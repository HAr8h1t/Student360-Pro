import { fetchWithCSRF, callGeminiApi, API_BASE_URL } from './api.js';
import { showToast, destroyChart, chartInstances, currentLoggedInUser } from './ui.js';

let allQuizData = [];
let currentQuizQuestions = [];
let currentQuestionIndex = 0;
let quizResults = [];
let selectedOption = null;
let quizTimerInterval = null;
let quizStartTime = null;

async function loadQuizData() {
    try {
        const response = await fetch('quizdata.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        allQuizData = await response.json();
    } catch (error) {
        console.error("Could not load quiz data:", error);
        const quizContainer = document.getElementById('quiz-container');
        if(quizContainer) {
            quizContainer.innerHTML = '<p class="text-red-500">Error: Could not load quiz questions. Please try again later.</p>';
        }
    }
}

function startQuiz() {
    const selectedSubject = document.getElementById('subject-select').value;
    const numQuestions = parseInt(document.getElementById('num-questions-input').value);
    
    // Filter questions by subject and shuffle them
    const subjectQuestions = allQuizData.filter(q => q.subject === selectedSubject);
    currentQuizQuestions = subjectQuestions.sort(() => 0.5 - Math.random()).slice(0, numQuestions);

    if (currentQuizQuestions.length === 0) {
        showToast('No questions available for this subject. Please select another.', 'error');
        return;
    }

    currentQuestionIndex = 0;
    quizResults = [];
    selectedOption = null;

    document.getElementById('quiz-start-screen').classList.add('hidden');
    document.getElementById('quiz-analysis-screen').classList.add('hidden');
    document.getElementById('quiz-question-screen').classList.remove('hidden');
    document.getElementById('submit-answer-btn').textContent = 'Submit';

    startTimer();
    showQuestion();
}

function startTimer() {
    quizStartTime = new Date();
    const timerEl = document.getElementById('quiz-timer');
    timerEl.textContent = '00:00';
    quizTimerInterval = setInterval(() => {
        const now = new Date();
        const seconds = Math.floor((now - quizStartTime) / 1000);
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        timerEl.textContent = `${mins}:${secs}`;
    }, 1000);
}

function stopTimer() {
    clearInterval(quizTimerInterval);
}

function showQuestion() {
    // Reset from previous question
    selectedOption = null;
    document.getElementById('ai-explanation-container').classList.add('hidden');
    document.getElementById('ai-explanation-text').innerHTML = '';

    const question = currentQuizQuestions[currentQuestionIndex];
    document.getElementById('quiz-question-title').textContent = `Question ${currentQuestionIndex + 1} of ${currentQuizQuestions.length}`;
    document.getElementById('quiz-question').textContent = question.question;
    
    const optionsContainer = document.getElementById('quiz-options');
    optionsContainer.innerHTML = '';
    // Shuffle options for variety
    const shuffledOptions = [...question.options].sort(() => 0.5 - Math.random());
    shuffledOptions.forEach(option => {
        const optionElement = document.createElement('button');
        optionElement.textContent = option;
        optionElement.classList.add('quiz-option-btn');
        optionElement.addEventListener('click', () => selectOption(optionElement, option));
        optionsContainer.appendChild(optionElement);
    });
    
    document.getElementById('submit-answer-btn').disabled = true;
}

function selectOption(optionElement, optionValue) {
    document.querySelectorAll('.quiz-option-btn').forEach(btn => btn.classList.remove('selected'));
    optionElement.classList.add('selected');
    selectedOption = optionValue;
    document.getElementById('submit-answer-btn').disabled = false;
}

function submitAnswer() {
    const submitBtn = document.getElementById('submit-answer-btn');
    const question = currentQuizQuestions[currentQuestionIndex];
    const correctAnswer = question.answer;

    // First click: Check answer
    if (submitBtn.textContent === 'Submit') {
        const isCorrect = selectedOption === correctAnswer;
        
        quizResults.push({
            question: question.question,
            topic: question.topic,
            options: question.options,
            userAnswer: selectedOption,
            correctAnswer: correctAnswer,
            isCorrect: isCorrect
        });

        // Visually show correct/incorrect answers
        const optionButtons = document.querySelectorAll('.quiz-option-btn');
        optionButtons.forEach(btn => {
            btn.disabled = true; // Disable all options
            if (btn.textContent === correctAnswer) {
                btn.classList.add('correct');
            } else if (btn.classList.contains('selected')) {
                btn.classList.add('incorrect');
            }
        });

        if (!isCorrect) {
            getAIExplanation(question, selectedOption);
        }

        const nextText = currentQuestionIndex < currentQuizQuestions.length - 1 ? 'Next Question' : 'Finish Quiz';
        submitBtn.textContent = nextText;
    
    // Second click: Go to next question or finish
    } else {
        currentQuestionIndex++;
        if (currentQuestionIndex < currentQuizQuestions.length) {
            submitBtn.textContent = 'Submit';
            showQuestion();
        } else {
            finishQuiz();
        }
    }
}

async function getAIExplanation(question, wrongAnswer) {
    const container = document.getElementById('ai-explanation-container');
    const spinner = document.getElementById('ai-explanation-spinner');
    const textEl = document.getElementById('ai-explanation-text');
    
    container.classList.remove('hidden');
    spinner.classList.remove('hidden');
    textEl.classList.add('hidden');

    const prompt = `The student was asked: \"${question.question}\". They incorrectly answered \"${wrongAnswer}\". The correct answer is \"${question.answer}\". Briefly and simply explain why \"${question.answer}\" is correct. Do not be conversational, just provide the explanation.`;
    const explanation = await callGeminiApi(prompt);
    
    textEl.innerHTML = explanation.replace(/\\n/g, '<br>');
    spinner.classList.add('hidden');
    textEl.classList.remove('hidden');
}

async function finishQuiz() {
    stopTimer();
    const timeTaken = Math.floor((new Date() - quizStartTime) / 1000);

    const score = quizResults.filter(r => r.isCorrect).length;
    const total = currentQuizQuestions.length;
    const accuracy = total > 0 ? (score / total) * 100 : 0;
    
    const analysisData = {
        score: score,
        totalQuestions: total,
        accuracy: accuracy.toFixed(1),
        timeTaken: timeTaken,
        subject: document.getElementById('subject-select').value,
        results: quizResults
    };

    showAnalysis(analysisData);
    saveQuizAttempt(analysisData);
}

function showAnalysis(data) {
    document.getElementById('quiz-question-screen').classList.add('hidden');
    document.getElementById('quiz-analysis-screen').classList.remove('hidden');

    // Populate metrics
    document.getElementById('analysis-score').textContent = `${data.score} / ${data.totalQuestions}`;
    document.getElementById('analysis-accuracy').textContent = `${data.accuracy}%`;
    const mins = Math.floor(data.timeTaken / 60);
    const secs = (data.timeTaken % 60).toString().padStart(2, '0');
    document.getElementById('analysis-time').textContent = `${mins}:${secs}`;
    
    // Topic Analysis
    const topicCounts = {};
    data.results.forEach(res => {
        if (!topicCounts[res.topic]) topicCounts[res.topic] = { correct: 0, incorrect: 0 };
        res.isCorrect ? topicCounts[res.topic].correct++ : topicCounts[res.topic].incorrect++;
    });
    
    const strongTopics = [];
    const weakTopics = [];
    for (const topic in topicCounts) {
        if (topicCounts[topic].incorrect === 0) strongTopics.push(topic);
        if (topicCounts[topic].correct === 0) weakTopics.push(topic);
    }

    document.getElementById('analysis-strong-topics').innerHTML = strongTopics.length ? strongTopics.map(t => `<li>${t}</li>`).join('') : '<li>None</li>';
    document.getElementById('analysis-weak-topics').innerHTML = weakTopics.length ? weakTopics.map(t => `<li>${t}</li>`).join('') : '<li>None</li>';

    // Pie Chart
    destroyChart('analysis-pie-chart');
    const pieCtx = document.getElementById('analysis-pie-chart').getContext('2d');
    chartInstances['analysis-pie-chart'] = new Chart(pieCtx, {
        type: 'pie',
        data: {
            labels: ['Correct', 'Incorrect'],
            datasets: [{
                data: [data.score, data.totalQuestions - data.score],
                backgroundColor: ['#2ecc71', '#e74c3c'],
                borderWidth: 2
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
    
    // Question Review
    const reviewContainer = document.getElementById('analysis-question-list');
    reviewContainer.innerHTML = '';
    data.results.forEach(res => {
        const item = document.createElement('div');
        item.className = `question-review-item ${res.isCorrect ? 'correct' : 'incorrect'}`;
        item.innerHTML = `
            <p class="font-semibold">${res.question}</p>
            <p>Your answer: <span class="review-user-answer ${res.isCorrect ? 'correct' : 'incorrect'}">${res.userAnswer}</span></p>
            ${!res.isCorrect ? `<p>Correct answer: <span class="font-bold">${res.correctAnswer}</span></p>` : ''}
        `;
        reviewContainer.appendChild(item);
    });
}

async function saveQuizAttempt(data) {
    if (!currentLoggedInUser) return;
    try {
        await fetchWithCSRF(`${API_BASE_URL}/student/quiz/attempt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_id: currentLoggedInUser.id,
                subject: data.subject,
                score: data.score,
                total_questions: data.totalQuestions,
                accuracy: parseFloat(data.accuracy),
                time_taken_seconds: data.timeTaken,
                details: data.results // Save the full breakdown
            })
        });
        // Optionally show toast, but might be too noisy.
    } catch (error) {
        console.error("Failed to save quiz attempt:", error);
        showToast('Could not save quiz results to your history.', 'error');
    }
}

async function loadQuizHistory() {
    if (!currentLoggedInUser) return;
    const container = document.getElementById('quiz-history-container');
    container.innerHTML = '<div class="spinner-dark"></div>';
    
    try {
        const response = await fetch(`${API_BASE_URL}/student/quiz/history`);
        const result = await response.json();
        
        if (result.success && result.history.length > 0) {
            container.innerHTML = '';
            result.history.forEach(attempt => {
                const item = document.createElement('div');
                item.className = 'history-item';
                const accuracyColor = attempt.accuracy >= 75 ? 'text-green-500' : attempt.accuracy >= 50 ? 'text-yellow-500' : 'text-red-500';
                item.innerHTML = `
                    <div>
                        <span class="font-bold">${attempt.subject}</span>
                        <span class="text-sm text-gray-500 ml-2">${new Date(attempt.attempted_at).toLocaleDateString()}</span>
                    </div>
                    <div>
                        <span class="mr-4">Score: <strong>${attempt.score}/${attempt.total_questions}</strong></span>
                        <span class="${accuracyColor}">Accuracy: <strong>${attempt.accuracy.toFixed(1)}%</strong></span>
                    </div>
                `;
                container.appendChild(item);
            });
        } else {
             container.innerHTML = '<p class="text-gray-600">No past quiz attempts found.</p>';
        }
    } catch (error) {
        console.error("Failed to load quiz history:", error);
        container.innerHTML = '<p class="text-red-500">Could not load quiz history.</p>';
    }
}

export { loadQuizData, startQuiz, submitAnswer, loadQuizHistory, allQuizData };