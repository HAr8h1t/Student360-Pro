import { fetchWithCSRF, callGeminiApi, API_BASE_URL } from './api.js';
import { showToast, showView, destroyChart, chartInstances, currentLoggedInUser } from './ui.js';
import { allQuizData } from './quiz.js';

function populateStudentView(student) {
    if (!student) return;

    // 1. Update Sidebar Name
    document.getElementById('student-sidebar-name').innerHTML = `
        <i class="fas fa-user-graduate"></i> ${student.name.split(' ')[0]}
    `;

    // 2. Update Stat Cards
    document.getElementById('student-dashboard-avg').textContent = `${student.overallAverage}%`;
    document.getElementById('student-dashboard-attendance').textContent = `${student.attendance}%`;
    document.getElementById('student-dashboard-quizzes').textContent = student.quizzesTaken;

    // 3. Update Strengths & Weaknesses
    const strengthsContainer = document.getElementById('student-strengths');
    const weaknessesContainer = document.getElementById('student-weaknesses');
    strengthsContainer.innerHTML = ''; // Clear static content
    weaknessesContainer.innerHTML = ''; // Clear static content

    if (student.marks && Object.keys(student.marks).length > 0) {
        const sortedSubjects = Object.entries(student.marks).sort(([, a], [, b]) => b - a);

        // Get top 2 strengths
        sortedSubjects.slice(0, 2).forEach(([subject, score]) => {
            const item = document.createElement('div');
            item.className = 'subject-item';
            item.innerHTML = `<span>${subject}:</span> <span>${score}%</span>`;
            strengthsContainer.appendChild(item);
        });

        // Get bottom 2 weaknesses
        if (sortedSubjects.length > 2) {
            sortedSubjects.slice(-2).reverse().forEach(([subject, score]) => {
                const item = document.createElement('div');
                item.className = 'subject-item';
                item.innerHTML = `<span>${subject}:</span> <span>${score}%</span>`;
                weaknessesContainer.appendChild(item);
            });
        }
    } else {
        strengthsContainer.innerHTML = '<p>No marks data available.</p>';
    }

    const subjectSelect = document.getElementById('subject-select');
    subjectSelect.innerHTML = ''; // Clear previous options
    if (allQuizData && allQuizData.length > 0) {
        const uniqueSubjects = [...new Set(allQuizData.map(q => q.subject))];
        uniqueSubjects.forEach(subject => {
            const option = document.createElement('option');
            option.value = subject;
            option.textContent = subject;
            subjectSelect.appendChild(option);
        });
    } else {
        const option = document.createElement('option');
        option.textContent = 'No quiz subjects available';
        subjectSelect.appendChild(option);
    }
}

async function renderStudentView() {
    const student = currentLoggedInUser;
    if (!student) return;
    
    populateStudentView(student);
    showView('student-view');
    renderStudentDoubts(); // This fetches and renders doubts
}

async function renderStudentDoubts(studentId) {
    if (!studentId) return;
    const container = document.getElementById('student-doubts-container');
    container.innerHTML = '<div class="spinner"></div>';

    try {
        const response = await fetch(`${API_BASE_URL}/student/doubts/${studentId}`);
        const result = await response.json();

        if (response.ok && result.success) {
            container.innerHTML = '';
            if (result.doubts.length === 0) {
                container.innerHTML = '<p class="text-gray-600">You have not asked any doubts yet.</p>';
                return;
            }
            result.doubts.forEach(doubt => {
                const doubtEl = document.createElement('div');
                doubtEl.className = 'doubt-item student-doubt';
                let answerHtml = doubt.answer_text 
                    ? `<p class="answer-text"><strong>Answer:</strong> ${doubt.answer_text}</p>`
                    : '<p class="unanswered-text">Awaiting answer...</p>';
                doubtEl.innerHTML = `
                    <p class="question-text"><strong>Q:</strong> ${doubt.question_text}</p>
                    ${answerHtml}
                `;
                container.appendChild(doubtEl);
            });
        } else {
            container.innerHTML = '<p class="text-red-500">Could not load your doubts.</p>';
        }
    } catch (error) {
        console.error("Failed to fetch student doubts:", error);
        container.innerHTML = '<p class="text-red-500">Error connecting to the server.</p>';
    }
}

async function populateTeacherDropdown() {
    const selectEl = document.getElementById('teacher-select');
    selectEl.innerHTML = '<option value="">Loading teachers...</option>';
    try {
        const response = await fetch(`${API_BASE_URL}/student/teachers`);
        const result = await response.json();
        if (response.ok && result.success) {
            selectEl.innerHTML = '<option value="">Select a Teacher (Optional)</option>';
            result.teachers.forEach(teacher => {
                const option = document.createElement('option');
                option.value = teacher.id;
                option.textContent = teacher.name;
                selectEl.appendChild(option);
            });
        } else {
            selectEl.innerHTML = '<option value="">Could not load teachers</option>';
        }
    } catch (error) {
        console.error("Failed to fetch teachers:", error);
        selectEl.innerHTML = '<option value="">Error loading teachers</option>';
    }
}

async function handleSendDoubt() {
    const textarea = document.getElementById('doubt-textarea');
    const doubtText = textarea.value.trim();
    const teacherSelect = document.getElementById('teacher-select');
    const teacherId = teacherSelect.value;

    if (doubtText === '') {
        showToast('Please enter your question before sending.', 'error');
        return;
    }

    if (!currentLoggedInUser) {
        showToast('Error: You must be logged in to ask a question.', 'error');
        return;
    }

    try {
        const response = await fetchWithCSRF(`${API_BASE_URL}/student/ask-doubt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_id: currentLoggedInUser.id,
                question_text: doubtText,
                teacher_id: teacherId || null
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            textarea.value = '';
            document.getElementById('ask-doubt-modal').classList.add('hidden');
            showToast(result.message, 'success');
            renderStudentDoubts(currentLoggedInUser.id); // Refresh the student's doubt list
        } else {
            showToast(result.message || 'An error occurred.', 'error');
        }
    } catch (error) {
        console.error("Failed to send doubt:", error);
        showToast('Could not connect to the server to send your question.', 'error');
    }
}

async function handleStudentChat() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (message === '') return;

    const chatSendBtn = document.getElementById('chat-send');
    chatSendBtn.disabled = true;
    document.getElementById('chat-send-text').classList.add('hidden');
    document.getElementById('chat-spinner').classList.remove('hidden');

    const history = document.getElementById('chat-history');
    history.innerHTML += `<div class="chat-message-user"><div class="chat-bubble"><p>${message}</p></div></div>`;
    input.value = '';
    history.scrollTop = history.scrollHeight;

    const student = currentLoggedInUser;
    const studentContext = `Student: ${student.name}, Marks: ${JSON.stringify(student.marks)}, Attendance: ${student.attendance}%.`;
    const prompt = `You are LionsGPT, a friendly AI tutor. Based on the student's data and their question, provide a helpful, concise response (3-5 sentences). Be encouraging.\\n\\nData: ${studentContext}\\nQuestion: ${message}`;
    const response = await callGeminiApi(prompt);

    history.innerHTML += `<div class="chat-message-ai"><div class="chat-bubble"><p>${response.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}</p></div></div>`;
    history.scrollTop = history.scrollHeight;

    chatSendBtn.disabled = false;
    document.getElementById('chat-send-text').classList.remove('hidden');
    document.getElementById('chat-spinner').classList.add('hidden');
}

function renderProgressTracker(student) {
    destroyChart('progress-line-chart');
    destroyChart('progress-radar-chart');

    const lineChartEl = document.getElementById('progress-line-chart');
    const radarChartEl = document.getElementById('progress-radar-chart');

    if (!student || !student.historicalMarks || !student.marks || !lineChartEl || !radarChartEl) {
        lineChartEl.parentElement.innerHTML = '<p class="text-gray-600">No progress data available.</p>';
        radarChartEl.parentElement.innerHTML = '<p class="text-gray-600">No subject data available.</p>';
        return;
    }

    // Line Chart: Calculate overall average for each historical data point
    const historicalMarks = student.historicalMarks;
    const firstSubjectHistory = Object.values(historicalMarks)[0] || [];
    const labels = firstSubjectHistory.map((_, i) => `Test ${i + 1}`);
    
    const overallAverages = labels.map((_, i) => {
        let total = 0;
        let count = 0;
        Object.values(historicalMarks).forEach(history => {
            if (history[i] !== undefined) {
                total += history[i];
                count++;
            }
        });
        return count > 0 ? (total / count).toFixed(1) : 0;
    });

    const lineCtx = lineChartEl.getContext('2d');
    chartInstances['progress-line-chart'] = new Chart(lineCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Overall Score Trend',
                data: overallAverages,
                borderColor: '#36a2eb',
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                fill: true,
                tension: 0.3
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false } } }
    });

    // Radar Chart: Use current marks for subject mastery
    const radarCtx = radarChartEl.getContext('2d');
    chartInstances['progress-radar-chart'] = new Chart(radarCtx, {
        type: 'radar',
        data: {
            labels: Object.keys(student.marks),
            datasets: [{
                label: 'Current Mastery',
                data: Object.values(student.marks),
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                borderColor: 'rgb(255, 99, 132)',
                borderWidth: 1
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { r: { beginAtZero: true, max: 100 } } }
    });
}

export { renderStudentView, populateTeacherDropdown, handleSendDoubt, handleStudentChat, renderProgressTracker, populateStudentView, renderStudentDoubts };