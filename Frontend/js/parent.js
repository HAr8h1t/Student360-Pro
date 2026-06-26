import { fetchWithCSRF, callGeminiApi, API_BASE_URL } from './api.js';
import { showToast, destroyAllCharts, showView, chartInstances, currentLoggedInUser } from './ui.js';

let currentlyViewedChildId = null;

const getOverallAverage = (student) => student.overallAverage || '0.0';
const getHighestScoringSubject = (student) => student.highestSubject || { subject: 'N/A', score: 0 };
const getLowestScoringSubject = (student) => student.lowestSubject || { subject: 'N/A', score: 0 };

async function renderParentDashboard(parent) {    if (!parent) return;    document.getElementById('parent-banner').innerHTML = `<i class="fas fa-users"></i><div><h3>Welcome, ${parent.name}!</h3><p>Here's a summary of your children's academic progress.</p></div>`;    showView('parent-dashboard-view');
    
    const response = await fetch(`${API_BASE_URL}/parent/children`);
    const data = await response.json();
    const children = data.children;

    const container = document.getElementById('children-cards-container');
    container.innerHTML = '';
    if (children.length === 0) {
        container.innerHTML = '<p class="col-span-full text-center text-gray-600">No children linked to this account.</p>';
    } else {
        children.forEach((child, index) => {
            const card = document.createElement('div');
            card.className = 'card child-card';
            card.style.animationDelay = `${0.2 + index * 0.1}s`;
            card.innerHTML = `<i class="fas fa-child-reaching"></i><h3 class="text-2xl font-semibold">${child.name}</h3><p class="text-lg text-gray-600">Class: ${child.class_name}</p><p class="mt-2 text-lg">Avg: <strong>${getOverallAverage(child)}%</strong> | Att: <strong>${child.attendance}%</strong></p>`;
            card.addEventListener('click', () => showParentChildDetailView(child.id));
            container.appendChild(card);
        });
    }

    renderParentComplaints();
}

async function renderParentComplaints() {
    if (!currentLoggedInUser) return;
    const container = document.getElementById('complaints-container');
    container.innerHTML = '<div class="spinner"></div>';

    try {
        const response = await fetch(`${API_BASE_URL}/parent/complaints`);
        const result = await response.json();

        if (response.ok && result.success) {
            container.innerHTML = '';
            if (result.complaints.length === 0) {
                container.innerHTML = '<p class="text-gray-600">No complaints have been received.</p>';
            } else {
                result.complaints.forEach(complaint => {
                    const complaintEl = document.createElement('div');
                    complaintEl.className = 'complaint-item'; // You'll need CSS for this
                    complaintEl.innerHTML = `
                        <h4>Complaint regarding ${complaint.student_name}</h4>
                        <p>From: ${complaint.teacher_name}</p>
                        <p><strong>Remark:</strong> ${complaint.teacher_remark}</p>
                        <small>Sent: ${new Date(complaint.created_at).toLocaleString()}</small>
                    `;
                    container.appendChild(complaintEl);
                });
            }
        } else {
            container.innerHTML = '<p class="text-red-500">Could not load complaints.</p>';
        }
    } catch (error) {
        container.innerHTML = '<p class="text-red-500">Error connecting to server.</p>';
    }
}

async function showParentChildDetailView(childId) {
    destroyAllCharts();
    currentlyViewedChildId = childId;
    
    const response = await fetchWithCSRF(`${API_BASE_URL}/parent/children`);
    const data = await response.json();
    const child = data.children.find(c => c.id === childId);
    const topper = data.topper;

    if (!child) return;
    
    document.getElementById('parent-view-child-name').textContent = `${child.name}'s Report`;
    document.getElementById('parent-view-child-class').textContent = child.class_name;
    document.getElementById('parent-view-child-attendance').textContent = child.attendance;
    document.getElementById('parent-view-child-avg').textContent = getOverallAverage(child);
    
    const teacherMessageEl = document.getElementById('parent-view-teacher-message');
    teacherMessageEl.innerHTML = `<div class="flex items-center justify-center gap-2"><div class="spinner"></div>Generating...</div>`;
    showView('parent-child-detail-view');

    const teacherMsgPrompt = `As an AI, write a concise, encouraging message from a teacher (Mr. Lee) to a parent about ${child.name}'s performance. Mention their average of ${getOverallAverage(child)}%, strongest subject (${getHighestScoringSubject(child).subject}), and weakest subject (${getLowestScoringSubject(child).subject}). Suggest collaborating. Limit to 3-4 sentences.`;
    teacherMessageEl.innerHTML = (await callGeminiApi(teacherMsgPrompt)).replace(/\\n/g, '<br>');

    const marksBody = document.getElementById('parent-view-marks-table-body');
    marksBody.innerHTML = Object.entries(child.marks).map(([subject, mark]) => `<tr><td>${subject}</td><td>${mark}</td><td>${mark > 75 ? '<span class="flag-green">Strong</span>' : mark < 60 ? '<span class="flag-red">Weak</span>' : '<span class="flag-orange">Average</span>'}</td></tr>`).join('');
    
    const marksTopperCtx = document.getElementById('parentChildMarksTopperChart').getContext('2d');
    chartInstances.parentChildMarksTopperChart = new Chart(marksTopperCtx, { type: 'bar', data: { labels: Object.keys(child.marks), datasets: [ { label: child.name, data: Object.values(child.marks), backgroundColor: 'rgba(108, 92, 231, 0.7)' }, { label: `${topper.name} (Topper)`, data: Object.values(topper.marks), backgroundColor: 'rgba(26, 188, 156, 0.7)' } ] }, options: { responsive: true, scales: { y: { beginAtZero: true, max: 100 } }, plugins: { legend: { position: 'top' } } } });

    const attendanceTrendCtx = document.getElementById('parentChildAttendanceTrendChart').getContext('2d');
    chartInstances.parentChildAttendanceTrendChart = new Chart(attendanceTrendCtx, { type: 'line', data: { labels: ['Term 1', 'Term 2', 'Term 3'], datasets: [{ label: 'Attendance %', data: [child.attendance > 5 ? child.attendance - 5 : 2, child.attendance < 97 ? child.attendance + 3 : 100, child.attendance], tension: 0.1, fill: true, borderColor: 'rgb(255, 159, 64)', backgroundColor: 'rgba(255, 159, 64, 0.2)' }] }, options: { responsive: true, scales: { y: { beginAtZero: true, max: 100 } } } });

    document.getElementById('note-spinner').classList.add('hidden');
}

async function handleGenerateNoteToTeacher() {
    const btn = document.getElementById('generate-teacher-note');
    btn.disabled = true;
    document.getElementById('note-btn-text').classList.add('hidden');
    document.getElementById('note-spinner').classList.remove('hidden');

    const response = await fetch(`${API_BASE_URL}/parent/children/${currentLoggedInUser.id}`);
    const data = await response.json();
    const child = data.children.find(c => c.id === currentlyViewedChildId);

    if (!child) { showToast('Error: No child selected.', 'error'); return; }

    const prompt = `You are an assistant for parents. Draft a polite, brief email from a parent to their child\'s teacher, Mr. Lee.\\nChild: ${child.name}\\nAvg: ${getOverallAverage(child)}%\\nStrongest: ${getHighestScoringSubject(child).subject}\\nWeakest: ${getLowestScoringSubject(child).subject}\\nAttendance: ${child.attendance}%\\nThe parent wants to thank the teacher and ask for advice on supporting their child\'s learning at home, especially in their weakest subject. Format as a complete email.`;
    const note = await callGeminiApi(prompt);
    
    document.getElementById('gemini-modal-title').textContent = `Draft Note for ${child.name}'s Teacher`;
    document.getElementById('gemini-modal-content').innerHTML = note.replace(/\\n/g, '<br>');
    geminiResponseModal.classList.remove('hidden');

    btn.disabled = false;
    document.getElementById('note-btn-text').classList.remove('hidden');
    document.getElementById('note-spinner').classList.add('hidden');
}

export { renderParentDashboard, handleGenerateNoteToTeacher, currentlyViewedChildId };