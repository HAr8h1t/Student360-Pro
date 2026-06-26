import { fetchWithCSRF, callGeminiApi, API_BASE_URL } from './api.js';
import { showToast, destroyAllCharts, showView, destroyChart, chartInstances, currentLoggedInUser } from './ui.js';

let allStudents = [];
let currentlyAnsweringDoubtId = null;
let currentlySelectedStudent = null;

const getOverallAverage = (student) => student.overallAverage || '0.0';
const getLowestScoringSubject = (student) => student.lowestSubject || { subject: 'N/A', score: 0 };
const getHighestScoringSubject = (student) => student.highestSubject || { subject: 'N/A', score: 0 };
const generatePredictiveScore = (historicalMarks) => {
    if (!historicalMarks || Object.keys(historicalMarks).length === 0) return 'N/A';
    const overallAverages = Object.values(historicalMarks).map(history => {
        const numericHistory = history.slice(-3).map(Number);
        return numericHistory.length ? numericHistory.reduce((a, b) => a + b, 0) / numericHistory.length : 0;
    });
    const avg = overallAverages.reduce((a, b) => a + b, 0) / overallAverages.length;
    return `${avg.toFixed(1)} (projected)`;
};

function updateTeacherDashboard(studentsToDisplay) {
    destroyAllCharts();
    const performanceLevels = { 'Excellent (90+)': 0, 'Good (75-89)': 0, 'Average (60-74)': 0, 'Needs Improvement (<60)': 0 };
    studentsToDisplay.forEach(student => {
        const avg = parseFloat(getOverallAverage(student));
        if (avg >= 90) performanceLevels['Excellent (90+)']++;
        else if (avg >= 75) performanceLevels['Good (75-89)']++;
        else if (avg >= 60) performanceLevels['Average (60-74)']++;
        else performanceLevels['Needs Improvement (<60)']++;
    });
    const ctxPerf = document.getElementById('classPerformanceDistributionChart').getContext('2d');
    chartInstances.classPerformanceDistributionChart = new Chart(ctxPerf, { type: 'doughnut', data: { labels: Object.keys(performanceLevels), datasets: [{ data: Object.values(performanceLevels), backgroundColor: ['#2ecc71', '#3498db', '#f1c40f', '#e74c3c'], borderWidth: 3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });

    const subjectTotals = {};
    const subjectCounts = {};
    studentsToDisplay.forEach(student => {
        Object.entries(student.marks).forEach(([subject, mark]) => {
            subjectTotals[subject] = (subjectTotals[subject] || 0) + mark;
            subjectCounts[subject] = (subjectCounts[subject] || 0) + 1;
        });
    });
    const classAverages = {};
    Object.keys(subjectTotals).forEach(subject => { classAverages[subject] = subjectTotals[subject] / subjectCounts[subject]; });
    const ctxSub = document.getElementById('classSubjectAverageChart').getContext('2d');
    chartInstances.classSubjectAverageChart = new Chart(ctxSub, { type: 'bar', data: { labels: Object.keys(classAverages), datasets: [{ label: 'Class Average', data: Object.values(classAverages), backgroundColor: 'rgba(108, 92, 231, 0.7)', borderRadius: 5 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } }, plugins: { legend: { display: false } } } });

    const tbody = document.getElementById('student-table-body');
    tbody.innerHTML = '';
    const alertList = document.getElementById('alert-list');
    alertList.innerHTML = '';
    let hasAlerts = false;

    studentsToDisplay.forEach((student, index) => {
        const avgScore = getOverallAverage(student);
        const lowestSubject = getLowestScoringSubject(student);
        const attendance = student.attendance || 'N/A';
        const flags = [];
        if (attendance < 80) flags.push('Low Attendance');
        if (avgScore < 60) flags.push('Low Average');
        if (lowestSubject.score < 50) flags.push(`Struggling in ${lowestSubject.subject}`);

        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer';
        row.innerHTML = `
            <td>${student.name}</td>
            <td>${student.class_name}</td>
            <td>${avgScore}</td>
            <td>${attendance}%</td>
            <td>${flags.map(f => `<span class="flag ${f.toLowerCase().replace(/\s+/g, '-')}">${f}</span>`).join('')}</td>
        `;
        row.addEventListener('click', () => showStudentDetailModal(student));
        tbody.appendChild(row);

        if (flags.length > 0) {
            hasAlerts = true;
            const alertItem = document.createElement('li');
            alertItem.innerHTML = `<b>${student.name}:</b> ${flags.join(', ')}. <a href="#" class="text-blue-500 hover:underline" data-student-id="${student.id}">View Details</a>`;
            alertList.appendChild(alertItem);
            alertItem.querySelector('a').addEventListener('click', (e) => {
                e.preventDefault();
                showStudentDetailModal(student);
            });
        }
    });

    document.getElementById('smart-alerts').classList.toggle('hidden', !hasAlerts);
}

async function renderTeacherDashboard() {
    destroyAllCharts();
    showView('teacher-dashboard-view');

    document.getElementById('teacher-banner').innerHTML = `
        <i class="fas fa-school-flag"></i>
        <div><h3>Welcome, ${currentLoggedInUser.name}!</h3><p>Here's the current overview of your class's performance.</p></div>
    `;

    try {
        const response = await fetchWithCSRF(`${API_BASE_URL}/teacher/dashboard`);
        allStudents = (await response.json()).students;

        const classFilter = document.getElementById('class-filter');
        classFilter.innerHTML = '<option value="">All Classes</option>';
        
        // Get unique class names from students
        const uniqueClasses = [...new Set(allStudents.map(s => s.class_name))];
        uniqueClasses.forEach(className => {
            const option = document.createElement('option');
            option.value = className;
            option.textContent = className;
            classFilter.appendChild(option);
        });

        classFilter.addEventListener('change', () => {
            const selectedClass = classFilter.value;
            const studentsToDisplay = selectedClass 
                ? allStudents.filter(s => s.class_name === selectedClass)
                : allStudents;
            updateTeacherDashboard(studentsToDisplay);
        });

        updateTeacherDashboard(allStudents);
        renderTeacherDoubts();
    } catch (error) {
        console.error("Failed to load teacher dashboard:", error);
        showToast('Failed to load dashboard data', 'error');
    }
}

async function renderTeacherDoubts() {
    if (!currentLoggedInUser) return;
    const doubtsContainer = document.getElementById('doubts-container');
    doubtsContainer.innerHTML = '<div class="spinner"></div>';

    try {
        const response = await fetch(`${API_BASE_URL}/teacher/doubts`);
        const result = await response.json();

        if (response.ok && result.success) {
            doubtsContainer.innerHTML = '';
            if (result.doubts.length === 0) {
                doubtsContainer.innerHTML = '<p id="no-doubts-message" class="text-gray-600">No pending doubts from students.</p>';
            } else {
                result.doubts.forEach(doubt => {
                    const doubtEl = document.createElement('div');
                    doubtEl.className = 'doubt-item';
                    doubtEl.innerHTML = `
                        <p><strong>${doubt.student_name}:</strong> ${doubt.question_text}</p>
                        <button class="answer-doubt-btn" data-doubt-id="${doubt.id}" data-question="${doubt.question_text}">Answer</button>
                        <button class="resolve-doubt-btn" data-doubt-id="${doubt.id}">Mark as Resolved</button>
                    `;
                    doubtsContainer.appendChild(doubtEl);
                });
            }
        } else {
            doubtsContainer.innerHTML = `<p class="text-red-500">Error: ${result.message || 'Could not load doubts.'}</p>`;
        }
    } catch (error) {
        console.error("Failed to fetch doubts:", error);
        doubtsContainer.innerHTML = '<p class="text-red-500">Could not connect to the server to get doubts.</p>';
    }
}

async function handleResolveDoubt(doubtId) {
    try {
        const response = await fetchWithCSRF(`${API_BASE_URL}/doubts/resolve/${doubtId}`, { method: 'POST' });
        const result = await response.json();

        if (response.ok && result.success) {
            showToast('Doubt marked as resolved!', 'success');
            renderTeacherDoubts();
        } else {
            showToast(result.message || 'Could not resolve the doubt.', 'error');
        }
    } catch (error) {
        console.error("Failed to resolve doubt:", error);
        showToast('Could not connect to the server.', 'error');
    }
}

function showAnswerModal(doubtId, question) {
    currentlyAnsweringDoubtId = doubtId;
    document.getElementById('answer-modal-question').textContent = question;
    document.getElementById('answer-textarea').value = '';
    document.getElementById('answer-doubt-modal').classList.remove('hidden');
}

async function handleSendAnswer() {
    const answerText = document.getElementById('answer-textarea').value.trim();
    if (!answerText) {
        showToast('Please enter an answer.', 'error');
        return;
    }

    try {
        const response = await fetchWithCSRF(`${API_BASE_URL}/doubts/answer/${currentlyAnsweringDoubtId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answer_text: answerText })
        });
        const result = await response.json();
        if (response.ok && result.success) {
            showToast('Answer sent successfully!', 'success');
            document.getElementById('answer-doubt-modal').classList.add('hidden');
            renderTeacherDoubts();
        } else {
            showToast(result.message || 'Could not send answer.', 'error');
        }
    } catch (error) {
        showToast('Could not connect to the server.', 'error');
    }
}

async function handleGenerateSuggestions() {
    const btn = document.getElementById('generate-suggestions');
    const btnText = document.getElementById('suggestion-btn-text');
    const spinner = document.getElementById('suggestion-spinner');
    const suggestionList = document.getElementById('suggestion-list');

    btn.disabled = true; btnText.classList.add('hidden'); spinner.classList.remove('hidden');
    suggestionList.innerHTML = '';

    const response = await fetch(`${API_BASE_URL}/teacher/dashboard`);
    const students = (await response.json()).students;

    const studentsNeedingSupport = students.filter(s => parseFloat(getOverallAverage(s)) < 70 || s.attendance < 85);
    if (studentsNeedingSupport.length === 0) {
        suggestionList.innerHTML = '<li class="text-green-600">All students are performing well!</li>';
    } else {
        let prompt = `As an AI assistant for a teacher, generate concise, actionable feedback for students who need support. Focus on specific subjects or attendance issues. Provide suggestions as a bulleted list using markdown. No conversational filler, just the list.\nStudents:\n`;
        studentsNeedingSupport.forEach(student => { prompt += `- Name: ${student.name}, Avg Score: ${getOverallAverage(student)}, Attendance: ${student.attendance}%, Lowest Subject: ${getLowestScoringSubject(student).subject}.\n`; });

        const suggestions = await callGeminiApi(prompt);
        suggestionList.innerHTML = suggestions.split('\n').map(item => item.trim().replace(/^[-*]\s*/, '')).filter(Boolean).map(item => `<li>${item}</li>`).join('');
    }

    btn.disabled = false; btnText.classList.remove('hidden'); spinner.classList.add('hidden');
}

function showStudentDetailModal(student) {
    if (!student) return;

    document.getElementById('modal-student-name').textContent = student.name;
    document.getElementById('modal-student-class').textContent = student.class_name;
    document.getElementById('modal-student-attendance').textContent = student.attendance;
    document.getElementById('modal-student-avg').textContent = getOverallAverage(student);
    document.getElementById('modal-student-lowest-subject').textContent = getLowestScoringSubject(student).subject;
    document.getElementById('modal-student-highest-subject').textContent = getHighestScoringSubject(student).subject;
    document.getElementById('modal-student-predictive-score').textContent = generatePredictiveScore(student.historicalMarks);
    
    document.getElementById('modal-marks-table-body').innerHTML = Object.entries(student.marks).map(([subject, score]) => `<tr><td class="px-2 py-1">${subject}</td><td class="px-2 py-1 font-bold">${score}</td></tr>`).join('');
    
    const radarCtx = document.getElementById('studentRadarChart').getContext('2d');
    destroyChart('studentRadarChart');
    chartInstances.studentRadarChart = new Chart(radarCtx, { type: 'radar', data: { labels: Object.keys(student.marks), datasets: [{ label: student.name, data: Object.values(student.marks), backgroundColor: 'rgba(108, 92, 231, 0.4)', borderColor: 'rgba(108, 92, 231, 1)', borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { r: { beginAtZero: true, max: 100, ticks: { stepSize: 20 } } }, plugins: { legend: { position: 'top' } } } });

    const trendCtx = document.getElementById('studentTrendLineChart').getContext('2d');
    destroyChart('studentTrendLineChart');
    const datasets = Object.entries(student.historicalMarks).map(([subject, marks]) => ({ label: subject, data: marks.slice(-3), borderColor: `hsl(${(subject.length * 30) % 360}, 70%, 50%)`, tension: 0.3, fill: false }));
    chartInstances.studentTrendLineChart = new Chart(trendCtx, { type: 'line', data: { labels: ['Test 1', 'Test 2', 'Test 3'], datasets }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } } });

    currentlySelectedStudent = student;
    document.getElementById('student-detail-modal').classList.remove('hidden');
}

function showComplaintModal() {
    if (!currentlySelectedStudent) return;
    document.getElementById('complaint-student-name').textContent = currentlySelectedStudent.name;
    document.getElementById('complaint-textarea').value = '';
    document.getElementById('complaint-modal').classList.remove('hidden');
}

async function handleSendComplaint() {
    const remark = document.getElementById('complaint-textarea').value.trim();
    if (!remark) {
        showToast('Please enter a remark.', 'error');
        return;
    }

    if (!currentlySelectedStudent || !currentLoggedInUser) {
        showToast('Error: No student or teacher context.', 'error');
        return;
    }

    try {
        const response = await fetchWithCSRF(`${API_BASE_URL}/teacher/complaint`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                teacher_id: currentLoggedInUser.id,
                student_id: currentlySelectedStudent.id,
                remark: remark
            })
        });

        const result = await response.json();
        if (response.ok && result.success) {
            showToast('Complaint sent successfully!', 'success');
            document.getElementById('complaint-modal').classList.add('hidden');
        } else {
            showToast(result.message || 'Could not send complaint.', 'error');
        }
    } catch (error) {
        showToast('Could not connect to the server.', 'error');
    }
}

export { renderTeacherDashboard, handleResolveDoubt, showAnswerModal, handleSendAnswer, handleGenerateSuggestions, showStudentDetailModal, showComplaintModal, handleSendComplaint };
