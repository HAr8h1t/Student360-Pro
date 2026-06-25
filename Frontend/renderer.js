import { setTheme, showToast, showView, copyToClipboard, currentLoggedInUser, setCurrentLoggedInUser, destroyAllCharts, hideAllViews } from './js/ui.js';
import { fetchWithCSRF, API_BASE_URL } from './js/api.js';
import { renderTeacherDashboard, handleResolveDoubt, showAnswerModal, handleSendAnswer, handleGenerateSuggestions, showComplaintModal, handleSendComplaint } from './js/teacher.js';
import { renderStudentView, populateTeacherDropdown, handleSendDoubt, handleStudentChat, renderProgressTracker, renderStudentDoubts } from './js/student.js';
import { renderParentDashboard, handleGenerateNoteToTeacher } from './js/parent.js';

console.log('Type of setCurrentLoggedInUser:', typeof setCurrentLoggedInUser);
import { loadQuizData, startQuiz, submitAnswer, loadQuizHistory } from './js/quiz.js';

let currentRole = null;
let currentlyViewedChildId = null;
let isRecording = false;
let speechRecognition = null;



// --- Login & Logout ---
async function logout() {
    let activeView = [document.getElementById('teacher-dashboard-view'), document.getElementById('student-view'), document.getElementById('parent-dashboard-view')].find(v => !v.classList.contains('hidden'));

    if (activeView) {
        activeView.classList.add('fade-out-up');
    }

    // Call the backend logout endpoint
    try {
        await fetchWithCSRF(`${API_BASE_URL}/logout`, { method: 'POST' });
    } catch (error) {
        console.error("Logout failed:", error);
    }

    setTimeout(() => {
        if (activeView) {
            activeView.classList.remove('fade-out-up');
        }
        
        destroyAllCharts();
        setCurrentLoggedInUser(null);
        currentRole = null;
        currentlyViewedChildId = null;
        
        document.getElementById('username-input').value = '';
        document.getElementById('password-input').value = '';

        // Reset login form state
        document.getElementById('credentials-section').classList.add('hidden');
        document.getElementById('credentials-section').classList.remove('animate-in', 'fade-out-down');
        document.getElementById('role-selection-section').classList.remove('hidden', 'fade-out-up');
        
        hideAllViews();
        document.getElementById('login-view').classList.remove('hidden');

    }, 300);
}
function showAuthFormForRole(role) {
    currentRole = role;
    document.getElementById('login-form-title').textContent = `${role.charAt(0).toUpperCase() + role.slice(1)} Portal Login`;
    document.getElementById('role-selection-section').classList.add('fade-out-up');
    setTimeout(() => {
        document.getElementById('role-selection-section').classList.add('hidden');
        document.getElementById('credentials-section').classList.remove('hidden', 'fade-out-down');
        document.getElementById('credentials-section').classList.add('animate-in');
        document.getElementById('username-input').focus();
    }, 300);
}

async function handleAuthLogin() {
    const username = document.getElementById('username-input').value.trim();
    const password = document.getElementById('password-input').value.trim();

    if (!username || !password) {
        showToast('Please enter username and password.', 'error');
        return;
    }

    try {
        const response = await fetchWithCSRF(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role: currentRole })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            setCurrentLoggedInUser(result.user);
            showToast('Login successful!', 'success');
            if (currentRole === 'teacher') {
                renderTeacherDashboard();
            } else if (currentRole === 'student') {
                renderStudentView(result.user);
            } else if (currentRole === 'parent') {
                renderParentDashboard(result.user);
            }
        } else {
            showToast(result.message || 'Invalid credentials.', 'error');
        }
    } catch (error) {
        console.error("Login API call failed:", error);
        showToast('Could not connect to the server. Is it running?', 'error');
    }
}

function handleBackToRoles() {
    document.getElementById('username-input').value = '';
    document.getElementById('password-input').value = '';
    currentRole = null;
    document.getElementById('credentials-section').classList.add('fade-out-down');
    setTimeout(() => {
        document.getElementById('credentials-section').classList.add('hidden');
        document.getElementById('role-selection-section').classList.remove('hidden', 'fade-out-up');
        document.getElementById('role-selection-section').classList.add('animate-in');
    }, 300);
}

async function checkExistingSession() {
    try {
        const response = await fetchWithCSRF(`${API_BASE_URL}/user`);
        const result = await response.json();
        
        if (response.ok && result.success) {
            setCurrentLoggedInUser(result.user);
            currentRole = result.user.role;
            
            if (currentRole === 'teacher') renderTeacherDashboard();
            else if (currentRole === 'student') renderStudentView();
            else if (currentRole === 'parent') renderParentDashboard();
        } else {
            console.log("No existing session found, showing login view.");
            showView('login-view');
        }
    } catch (error) {
        console.error("Session check failed:", error);
        showView('login-view');
    }
}

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    loadQuizData();
    showView('login-view');

    // Theme Setup
    setTheme(localStorage.getItem('theme') || 'dark');
    document.getElementById('app').addEventListener('click', (e) => {
        if (e.target.closest('.theme-toggle-btn')) {
            setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
        }
    });
    
    // --- GLOBAL EVENT LISTENERS ---

    // Login
    document.getElementById('login-form').addEventListener('submit', (e) => { e.preventDefault(); handleAuthLogin(); });

    const loginButtons = document.querySelectorAll('.login-button');
    loginButtons.forEach(button => {
        button.classList.add('no-hover'); // Initially disable hover
        button.addEventListener('animationend', (event) => {
            if (event.animationName === 'bounceInUp') {
				button.classList.remove('animate__bounceInUp'); // Remove animate.css class
                button.classList.remove('no-hover'); // Re-enable hover effects
            }
        });
    });

	document.getElementById('login-teacher').addEventListener('click', () => showAuthFormForRole('teacher'));
	document.getElementById('login-student').addEventListener('click', () => showAuthFormForRole('student'));
	document.getElementById('login-parent').addEventListener('click', () => showAuthFormForRole('parent'));
    document.getElementById('auth-login-btn').addEventListener('click', handleAuthLogin);
    document.getElementById('password-input').addEventListener('keypress', (e) => e.key === 'Enter' && handleAuthLogin());
    document.getElementById('back-to-roles-btn').addEventListener('click', handleBackToRoles);
    
    // Logouts
    ['teacher-logout', 'student-logout', 'parent-logout'].forEach(id => document.getElementById(id).addEventListener('click', logout));
    
    // Modals
    document.getElementById('close-student-detail').addEventListener('click', () => document.getElementById('student-detail-modal').classList.add('hidden'));
    document.getElementById('close-doubt-modal').addEventListener('click', () => document.getElementById('ask-doubt-modal').classList.add('hidden'));
    document.getElementById('close-answer-modal').addEventListener('click', () => document.getElementById('answer-doubt-modal').classList.add('hidden'));
    document.getElementById('close-complaint-modal').addEventListener('click', () => document.getElementById('complaint-modal').classList.add('hidden'));
    document.querySelector('#gemini-response-modal .modal-close-button').addEventListener('click', () => document.getElementById('gemini-response-modal').classList.add('hidden'));

    // Teacher View
    document.getElementById('generate-suggestions').addEventListener('click', handleGenerateSuggestions);
    document.getElementById('open-complaint-modal-btn').addEventListener('click', showComplaintModal);
    document.getElementById('teacher-dashboard-view').addEventListener('click', (e) => {
        if (e.target.classList.contains('resolve-doubt-btn')) {
            handleResolveDoubt(e.target.dataset.doubtId);
        } else if (e.target.classList.contains('answer-doubt-btn')) {
            showAnswerModal(e.target.dataset.doubtId, e.target.dataset.question);
        }
    });
    document.getElementById('send-answer-btn').addEventListener('click', handleSendAnswer);
    document.getElementById('send-complaint-btn').addEventListener('click', handleSendComplaint);

    // Student View Navigation
    const studentNavItems = document.querySelectorAll('#student-view .sidebar-nav .nav-item');
    const contentDivs = document.querySelectorAll('#student-view .main-content > div[id$="-content"]');
    studentNavItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            if (item.id === 'ask-doubt-nav-item') {
                document.getElementById('ask-doubt-modal').classList.remove('hidden');
                populateTeacherDropdown();
                return; 
            }

            studentNavItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            contentDivs.forEach(div => div.classList.add('hidden'));
            const contentId = item.id.replace('-nav-item', '-content');
            document.getElementById(contentId).classList.remove('hidden');

            if (contentId === 'progress-content') {
                renderProgressTracker(currentLoggedInUser);
            } else if (contentId === 'dashboard-content') {
                renderStudentDoubts(currentLoggedInUser.id);
            } else if (contentId === 'practice-content') {
                loadQuizHistory();
            }
        });
    });
    
    // Student Actions
    document.getElementById('send-doubt-btn').addEventListener('click', handleSendDoubt);
    document.getElementById('chat-send').addEventListener('click', handleStudentChat);
    const chatInput = document.getElementById('chat-input');
    chatInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent form submission or newline in textarea
            handleStudentChat();
        }
    });

    // Speech Recognition Logic
    const micBtn = document.getElementById('chat-mic-btn');
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognitionAPI) {
        micBtn.addEventListener('click', () => {
            if (isRecording) {
                speechRecognition.stop();
            } else {
                startSpeechRecognition();
            }
        });
    } else {
        micBtn.style.display = 'none';
        console.warn('Speech Recognition API not supported in this browser.');
    }

    function startSpeechRecognition() {
        if (isRecording) return;
        const existingText = chatInput.value ? chatInput.value.trim() + ' ' : '';
        let finalTranscript = '';

        speechRecognition = new SpeechRecognitionAPI();
        speechRecognition.continuous = true;
        speechRecognition.interimResults = true;
        speechRecognition.lang = 'en-US';

        speechRecognition.onstart = () => { isRecording = true; micBtn.classList.add('recording'); };
        speechRecognition.onend = () => { isRecording = false; micBtn.classList.remove('recording'); };
        speechRecognition.onerror = (event) => { console.error('Speech recognition error', event.error); };
        speechRecognition.onresult = (event) => {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                event.results[i].isFinal ? finalTranscript += event.results[i][0].transcript + ' ' : interimTranscript += event.results[i][0].transcript;
            }
            chatInput.value = existingText + finalTranscript + interimTranscript;
        };
        speechRecognition.start();
    }

    // Quiz Buttons
    document.getElementById('start-quiz-btn').addEventListener('click', startQuiz);
    document.getElementById('submit-answer-btn').addEventListener('click', submitAnswer);
    document.getElementById('retake-quiz-btn').addEventListener('click', () => {
        document.getElementById('quiz-analysis-screen').classList.add('hidden');
        document.getElementById('quiz-start-screen').classList.remove('hidden');
    });

    // Parent View
    document.getElementById('generate-teacher-note').addEventListener('click', handleGenerateNoteToTeacher);
    document.getElementById('copy-gemini-response').addEventListener('click', () => copyToClipboard('gemini-modal-content'));
    document.getElementById('download-parent-report').addEventListener('click', () => showToast('Report downloaded (mock)!'));
    document.getElementById('back-to-parent-dashboard').addEventListener('click', renderParentDashboard);

    checkExistingSession();
});
