const htmlEl = document.documentElement;
const loginView = document.getElementById('login-view');
const teacherDashboardView = document.getElementById('teacher-dashboard-view');
const studentView = document.getElementById('student-view');
const parentDashboardView = document.getElementById('parent-dashboard-view');
const studentDetailModal = document.getElementById('student-detail-modal');
const parentChildDetailView = document.getElementById('parent-child-detail-view');
const geminiResponseModal = document.getElementById('gemini-response-modal');
const toastNotification = document.getElementById('toast-notification');

let chartInstances = {};

function updateChartJsDefaults() {
    const isDarkMode = htmlEl.classList.contains('dark');
    const color = isDarkMode ? '#d1d5db' : '#4b5563';
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)';

    Chart.defaults.color = color;
    Chart.defaults.borderColor = gridColor;
    Chart.defaults.scale.ticks.color = color;
    Chart.defaults.plugins.legend.labels.color = color;
    Chart.defaults.scale.grid.color = gridColor;
}

function setTheme(theme) {
    localStorage.setItem('theme', theme);
    const toggleIcons = document.querySelectorAll('.theme-toggle-btn i');

    if (theme === 'dark') {
        htmlEl.classList.add('dark');
        htmlEl.classList.remove('light');
        toggleIcons.forEach(icon => { if(icon) { icon.classList.remove('fa-moon'); icon.classList.add('fa-sun'); } });
    } else {
        htmlEl.classList.remove('dark');
        htmlEl.classList.add('light');
        toggleIcons.forEach(icon => { if(icon) { icon.classList.remove('fa-sun'); icon.classList.add('fa-moon'); } });
    }
    updateChartJsDefaults();
    Object.values(chartInstances).forEach(chart => { if (chart) chart.update(); });
}

function showToast(message, type = 'success', duration = 3000) {
    toastNotification.textContent = message;
    toastNotification.className = 'toast-notification show ' + (type === 'error' ? 'error' : 'success');
    setTimeout(() => { toastNotification.classList.remove('show'); }, duration);
}

function destroyChart(chartId) { if (chartInstances[chartId]) { chartInstances[chartId].destroy(); delete chartInstances[chartId]; } }
function destroyAllCharts() { Object.keys(chartInstances).forEach(destroyChart); chartInstances = {}; }
export function hideAllViews() { [loginView, teacherDashboardView, studentView, parentDashboardView, studentDetailModal, parentChildDetailView, geminiResponseModal, document.getElementById('answer-doubt-modal')].forEach(v => v?.classList.add('hidden')); }
function showView(viewId) { hideAllViews(); const viewElement = document.getElementById(viewId); if (viewElement) { viewElement.classList.remove('hidden'); } }

async function copyToClipboard(elementId) {
    const container = document.getElementById(elementId);
    if (!container) return;
    try {
        await navigator.clipboard.writeText(container.innerText);
        showToast('Text copied to clipboard!');
    } catch (err) {
        showToast('Failed to copy text.', 'error');
    }
}

let currentLoggedInUser = null;

function setCurrentLoggedInUser(user) {
    currentLoggedInUser = user;
}

export { setTheme, showToast, destroyChart, destroyAllCharts, showView, copyToClipboard, chartInstances, currentLoggedInUser, setCurrentLoggedInUser };
