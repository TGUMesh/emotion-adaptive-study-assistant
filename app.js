// Emotion Analysis State
let webcamActive = localStorage.getItem('webcamActive') !== 'false';
let isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
let currentTheme = localStorage.getItem('theme') || 'light';
let todos = JSON.parse(localStorage.getItem('todos')) || [
    { id: 1, text: "Read Chapter 4: Backpropagation", completed: true },
    { id: 2, text: "Complete Neural Networks Quiz", completed: true },
    { id: 3, text: "Review Derivative formulas", completed: false },
    { id: 4, text: "Write reflection paragraph", completed: false }
];
let userName = localStorage.getItem('userName') || "Student";
let studyDates = JSON.parse(localStorage.getItem('studyDates'));

// Prototype Seed Data for Calendar Visualization
if (!studyDates || studyDates.length <= 1) {
    if (!studyDates) studyDates = [];
    const today = new Date();
    // Add 4 consecutive past days to simulate an ongoing streak
    for (let i = 1; i <= 4; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dStr = `${y}-${m}-${day}`;
        if (!studyDates.includes(dStr)) studyDates.push(dStr);
    }
}

function saveState() {
    localStorage.setItem('webcamActive', webcamActive);
    localStorage.setItem('isAuthenticated', isAuthenticated);
    localStorage.setItem('theme', currentTheme);
    localStorage.setItem('todos', JSON.stringify(todos));
    localStorage.setItem('userName', userName);
    localStorage.setItem('studyDates', JSON.stringify(studyDates));
}

let emotionDetectionInterval = null;
let currentEmotionBuffer = [];
const BUFFER_SIZE = 6; // 6 frames at 500ms = 3 seconds
let emotionCooldown = 0; // Timestamp to pause tracking

// Initialize Feather Icons & Face API
document.addEventListener("DOMContentLoaded", async () => {
    feather.replace();
    
    document.body.setAttribute('data-theme', currentTheme);
    const themeSelect = document.getElementById('theme-selector');
    if (themeSelect) themeSelect.value = currentTheme;
    
    const panel = document.querySelector('.debug-panel');
    if (panel) panel.style.display = 'flex';
    
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            if (panel) panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
        }
    });

    if (isAuthenticated) {
        document.getElementById('main-header').style.display = 'flex';
        document.getElementById('bottom-nav').style.display = 'flex';
        const greetingEl = document.getElementById('greeting-text');
        if (greetingEl) greetingEl.textContent = `Good evening, ${userName}`;
        document.getElementById('screen-login').classList.remove('active');
        renderTodos();
        setEmotion('neutral');
        logStudyDay();
        renderCalendar();
    }

    // Bind webcam toggle
    const toggle = document.getElementById('webcam-toggle');
    if (toggle) {
        toggle.checked = webcamActive;
        toggle.addEventListener('change', (e) => {
            webcamActive = e.target.checked;
            saveState();
            if (webcamActive && isAuthenticated) {
                startWebcam();
            } else {
                stopWebcam();
            }
        });
    }

    // Load Face API Models in background
    try {
        await loadFaceApiModels();
        if (webcamActive && isAuthenticated) startWebcam();
    } catch (err) {
        console.error("Face API Error:", err);
        updateWebcamStatus("Model Load Failed");
    }
});

// LOGIN LOGIC
function performLogin(event) {
    event.preventDefault(); // Stop form reload
    
    const usernameInput = document.getElementById('username-input');
    userName = usernameInput && usernameInput.value ? usernameInput.value : "Student";
    isAuthenticated = true;
    saveState();
    
    // 1. Update the Header Name dynamically
    const greetingEl = document.getElementById('greeting-text');
    if (greetingEl) greetingEl.textContent = `Good evening, ${userName}`;
    
    // 2. Unhide navigation elements
    document.getElementById('main-header').style.display = 'flex';
    document.getElementById('bottom-nav').style.display = 'flex';
    
    // 4. Trigger the usual initialization routines
    document.getElementById('screen-login').classList.remove('active');
    renderTodos();
    document.body.dataset.emotion = 'login'; // Reset to force the neutral transition
    setEmotion('neutral');
    logStudyDay();
    renderCalendar();
    showToast('Welcome Back!', 'Your study dashboard is ready.', 'success');
    
    // 5. Start models if they finished loading
    if (webcamActive && document.getElementById('webcam-status').textContent === "Ready") {
        startWebcam();
    }
}

async function loadFaceApiModels() {
    updateWebcamStatus("Loading High-Accuracy Models...");
    const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
    await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
    await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
    updateWebcamStatus("Ready");
}

async function startWebcam() {
    const video = document.getElementById('webcam-video');
    const container = document.getElementById('webcam-container');
    if (!video) return;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        container.classList.add('active');
        
        video.addEventListener('play', () => {
            if (emotionDetectionInterval) clearInterval(emotionDetectionInterval);
            emotionDetectionInterval = setInterval(detectEmotion, 500);
        });
        updateWebcamStatus("Monitoring...");
    } catch (err) {
        console.error("Webcam Error:", err);
        updateWebcamStatus("Camera Access Denied");
    }
}

function stopWebcam() {
    const video = document.getElementById('webcam-video');
    const container = document.getElementById('webcam-container');
    if (emotionDetectionInterval) {
        clearInterval(emotionDetectionInterval);
        emotionDetectionInterval = null;
    }
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    if (container) container.classList.remove('active');
}

function updateWebcamStatus(status) {
    const el = document.getElementById('webcam-status');
    if (el) el.textContent = status;
}

async function detectEmotion() {
    if (Date.now() < emotionCooldown) {
        updateWebcamStatus("Paused (Cooldown)");
        return;
    }

    const video = document.getElementById('webcam-video');
    if (!video || video.paused || video.ended) return;

    // Use SsdMobilenetv1Options for higher accuracy instead of TinyFaceDetector
    const detection = await faceapi.detectSingleFace(video, new faceapi.SsdMobilenetv1Options()).withFaceExpressions();
    
    if (detection) {
        const expressions = detection.expressions;
        let highestProp = 0;
        let emotion = 'neutral';
        for (const [key, val] of Object.entries(expressions)) {
            if (val > highestProp) {
                highestProp = val;
                emotion = key;
            }
        }
        
        let mappedEmotion = 'neutral';
        
        // Confidence Threshold: Require at least 60% confidence
        if (highestProp >= 0.6) {
            if (emotion === 'angry' || emotion === 'disgusted') mappedEmotion = 'frustrated';
            else if (emotion === 'surprised') mappedEmotion = 'confused';
            else if (emotion === 'sad') mappedEmotion = 'bored';
            else if (emotion === 'happy') mappedEmotion = 'neutral'; 
        }

        recordEmotion(mappedEmotion);
    } else {
        updateWebcamStatus("No Face Detected");
        currentEmotionBuffer = []; // Reset buffer if no face
    }
}

function recordEmotion(emotion) {
    currentEmotionBuffer.push(emotion);
    if (currentEmotionBuffer.length > BUFFER_SIZE) {
        currentEmotionBuffer.shift();
    }
    
    if (currentEmotionBuffer.length === BUFFER_SIZE) {
        // Require latest 3 out of 4 frames to be identical
        const recentFrames = currentEmotionBuffer.slice(-4);
        const count = recentFrames.filter(e => e === emotion).length;
        if (count >= 3 && currentEmotionBuffer[BUFFER_SIZE - 1] === emotion) {
            updateWebcamStatus(`Detected: ${emotion}`);
            
            if (document.body.dataset.emotion !== emotion) {
                setEmotion(emotion);
            }
        } else {
            updateWebcamStatus(`Monitoring...`);
        }
    }
}

let breakInterval = null;

// User ignores the suggestion and continues reading
function ignoreEmotion(resetTimer = true) {
    if (breakInterval) {
        clearInterval(breakInterval);
        breakInterval = null;
    }
    const breakTimerDisplay = document.getElementById('break-timer-display');
    const breakOptions = document.querySelector('.break-options');
    if (breakTimerDisplay) breakTimerDisplay.style.display = 'none';
    if (breakOptions) breakOptions.style.display = 'flex';
    
    if (resetTimer) emotionCooldown = Date.now() + 120000;
    else emotionCooldown = Date.now() + 60000;
    
    currentEmotionBuffer = [];
    setEmotion('neutral');
    updateWebcamStatus("Paused (Cooldown)");
    const tutorUI = document.getElementById('ai-tutor-container');
    if (tutorUI) tutorUI.style.display = 'none';
    const tutorFocusUI = document.getElementById('ai-tutor-container-focus');
    if (tutorFocusUI) tutorFocusUI.style.display = 'none';
}

function askAiTutor() {}
function askAiTutorFocus() {}

// ==========================================
// AI TUTOR CHATBOT
// ==========================================
const tutorResponses = {
    derivative: [
        "A derivative measures how a function changes as its input changes. Think of it as the 'instantaneous speed' of a curve at any point.",
        "The power rule is your best friend: d/dx[x^n] = n·x^(n-1). For example, d/dx[x³] = 3x².",
        "Remember: the derivative of a constant is always 0, and the derivative of x is always 1."
    ],
    backpropagation: [
        "Backpropagation works in two phases: forward pass (compute output) and backward pass (compute gradients). The chain rule connects them.",
        "Think of it like tracing blame: if the output is wrong, backprop tells each weight how much it contributed to the error.",
        "The key insight is the chain rule: ∂L/∂w = ∂L/∂a · ∂a/∂z · ∂z/∂w, where each term is easy to compute individually."
    ],
    neural: [
        "A neural network is really just a series of matrix multiplications followed by non-linear functions (activations).",
        "Each layer transforms the data into a more useful representation. The network learns *which* transformations are best.",
        "The universal approximation theorem tells us a single hidden layer can approximate any function — but deeper networks learn more efficiently."
    ],
    gradient: [
        "The gradient points in the direction of steepest ascent. We go *opposite* to it (gradient descent) to minimize loss.",
        "If the gradient is large, we're far from the minimum. If it's tiny, we're either at the minimum or stuck in a flat region.",
        "Learning rate controls step size: too large and you overshoot, too small and training takes forever."
    ],
    loss: [
        "The loss function measures how wrong your model is. Common ones: MSE for regression, Cross-Entropy for classification.",
        "A good loss function should be differentiable (so we can compute gradients) and reflect what we actually care about.",
        "If training loss drops but validation loss rises, you're overfitting — the model memorizes instead of learning patterns."
    ],
    general: [
        "That's a great question! Let me think about it... The key is to break complex topics into smaller, digestible parts.",
        "I'd suggest re-reading the relevant section slowly and trying to explain it in your own words — that's active recall!",
        "Try working through a concrete example by hand. Abstract concepts become much clearer with specific numbers.",
        "Don't hesitate to draw diagrams. Visual representations often reveal patterns that text alone can't.",
        "One effective technique: try teaching this concept to an imaginary beginner. If you can explain it simply, you understand it."
    ]
};

function getAiResponse(userMessage) {
    const msg = userMessage.toLowerCase();
    if (msg.includes('derivative') || msg.includes('differentiat') || msg.includes('slope')) {
        return tutorResponses.derivative[Math.floor(Math.random() * tutorResponses.derivative.length)];
    }
    if (msg.includes('backprop') || msg.includes('back prop') || msg.includes('backward')) {
        return tutorResponses.backpropagation[Math.floor(Math.random() * tutorResponses.backpropagation.length)];
    }
    if (msg.includes('neural') || msg.includes('network') || msg.includes('layer') || msg.includes('neuron')) {
        return tutorResponses.neural[Math.floor(Math.random() * tutorResponses.neural.length)];
    }
    if (msg.includes('gradient') || msg.includes('learning rate') || msg.includes('descent')) {
        return tutorResponses.gradient[Math.floor(Math.random() * tutorResponses.gradient.length)];
    }
    if (msg.includes('loss') || msg.includes('error') || msg.includes('overfit')) {
        return tutorResponses.loss[Math.floor(Math.random() * tutorResponses.loss.length)];
    }
    return tutorResponses.general[Math.floor(Math.random() * tutorResponses.general.length)];
}

function sendChatMessage(event, context) {
    event.preventDefault();
    
    const input = document.getElementById(`chat-input-${context}`);
    const messagesContainer = document.getElementById(`chat-messages-${context}`);
    if (!input || !messagesContainer) return;
    
    const text = input.value.trim();
    if (!text) return;
    
    // Add user message
    const userMsg = document.createElement('div');
    userMsg.className = 'chat-msg user';
    const userP = document.createElement('p');
    userP.textContent = text;
    userMsg.appendChild(userP);
    messagesContainer.appendChild(userMsg);
    
    input.value = '';
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Show typing indicator
    const typingMsg = document.createElement('div');
    typingMsg.className = 'chat-msg bot typing';
    typingMsg.innerHTML = '<p>Thinking...</p>';
    messagesContainer.appendChild(typingMsg);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Simulate response delay
    setTimeout(() => {
        typingMsg.remove();
        
        const botMsg = document.createElement('div');
        botMsg.className = 'chat-msg bot';
        const botP = document.createElement('p');
        botP.textContent = getAiResponse(text);
        botMsg.appendChild(botP);
        messagesContainer.appendChild(botMsg);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 800 + Math.random() * 700);
}

function toggleChatWidget(id) {
    const widget = document.getElementById(id);
    if (widget && widget.classList.contains('chat-widget-floating')) {
        widget.classList.toggle('active');
    }
}

// ==========================================
// TEXT-TO-SPEECH (Read Aloud)
// ==========================================
let isSpeaking = false;
let speechUtterance = null;

function toggleReadAloud() {
    const btn = document.getElementById('tts-toggle-btn');
    
    if (isSpeaking) {
        // Stop reading
        window.speechSynthesis.cancel();
        isSpeaking = false;
        if (btn) {
            btn.innerHTML = '<i data-feather="headphones"></i>';
            btn.style.background = '';
            btn.style.color = '';
            feather.replace();
        }
        showToast('Read Aloud', 'Stopped reading.', 'info');
        return;
    }
    
    // Grab the text content from the focus screen
    const focusText = document.querySelector('.focus-text');
    if (!focusText) return;
    
    const textContent = focusText.innerText;
    if (!textContent.trim()) return;
    
    speechUtterance = new SpeechSynthesisUtterance(textContent);
    speechUtterance.rate = 0.9;
    speechUtterance.pitch = 1;
    speechUtterance.lang = 'en-US';
    
    // Try to pick a natural-sounding voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha'));
    if (preferred) speechUtterance.voice = preferred;
    
    speechUtterance.onend = () => {
        isSpeaking = false;
        if (btn) {
            btn.innerHTML = '<i data-feather="headphones"></i>';
            btn.style.background = '';
            btn.style.color = '';
            feather.replace();
        }
        showToast('Read Aloud', 'Finished reading.', 'success');
    };
    
    window.speechSynthesis.speak(speechUtterance);
    isSpeaking = true;
    
    if (btn) {
        btn.innerHTML = '<i data-feather="volume-x"></i>';
        btn.style.background = 'var(--primary)';
        btn.style.color = 'white';
        feather.replace();
    }
    showToast('Read Aloud', 'Reading study content...', 'info');
}

function startBreakTimer() {
    const breakOptions = document.querySelector('.break-options');
    const timerDisplay = document.getElementById('break-timer-display');
    if (breakOptions && timerDisplay) {
        breakOptions.style.display = 'none';
        timerDisplay.style.display = 'block';
        
        let breakRemaining = 5 * 60;
        timerDisplay.textContent = formatTime(breakRemaining);
        
        if (breakInterval) clearInterval(breakInterval);
        
        breakInterval = setInterval(() => {
            if (breakRemaining > 0) {
                breakRemaining--;
                timerDisplay.textContent = formatTime(breakRemaining);
            } else {
                clearInterval(breakInterval);
                breakInterval = null;
                showToast('Break Complete!', 'Ready to focus again?', 'success');
                ignoreEmotion(false);
            }
        }, 1000);
    }
}

/**
 * Screen Navigation Map based on Emotion
 */
const emotionToScreenMap = {
    'neutral': 'dashboard',
    'confused': 'confusion',
    'frustrated': 'frustration',
    'focused': 'focused',
    'bored': 'boredom'
};

const emotionLabels = {
    'neutral': 'Feeling Neutral',
    'confused': 'Feeling Confused',
    'frustrated': 'Feeling Frustrated',
    'focused': 'Deep Focus',
    'bored': 'Feeling Bored'
};

const emotionIcons = {
    'neutral': 'smile',
    'confused': 'help-circle',
    'frustrated': 'frown',
    'focused': 'target',
    'bored': 'coffee'
};

/**
 * Handle Emotion Simulation logic
 */
function setEmotion(emotion) {
    if (document.body.dataset.emotion === emotion) return; // prevent redundant triggers
    
    // 1. Update body class for global emotion theming
    // Do not overwrite data-theme. Just change class.
    document.body.className = `emotion-${emotion}`;
    document.body.dataset.emotion = emotion;
    
    // Notify user of state change if authenticated
    if (isAuthenticated && emotion !== 'login') {
        showToast('State Change Detected', emotionLabels[emotion], 'info');
    }
    
    // 1-minute logic cooldowns for focus/breathing
    if (emotion === 'frustrated') {
        emotionCooldown = Date.now() + 60000;
        updateWebcamStatus("Paused (Breathing)");
    }
    if (emotion === 'focused') {
        emotionCooldown = Date.now() + 60000;
        updateWebcamStatus("Paused (Focus)");
    }
    
    // Optional Pomodoro Hook: Auto-start if focused
    if (emotion === 'focused' && isTimerPaused) {
        toggleTimer();
        showToast('Deep Focus', 'Timer started automatically.', 'success');
    }
    
    // 2. Update Header Label & Icon
    const labelEl = document.querySelector('.emotion-label');
    const iconEl = document.querySelector('.emotion-icon');
    
    if (labelEl && iconEl) {
        labelEl.textContent = emotionLabels[emotion];
        // feather.replace creates an svg replacing the <i> tag, so tracking the icon visually requires recreating it
        const newIcon = `<i data-feather="${emotionIcons[emotion]}" class="emotion-icon"></i>`;
        iconEl.outerHTML = newIcon;
        feather.replace();
    }
    
    // 3. Update Debug Panel active state
    document.querySelectorAll('.debug-panel button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.trigger === emotion) {
            btn.classList.add('active');
        }
    });

    // 4. Auto-route to specific screen based on emotion logic (The core Feature)
    const targetScreen = emotionToScreenMap[emotion];
    if (targetScreen) {
        navigateTo(targetScreen);
    }
}

/**
 * Handle Screen Transitions
 * @param {string} screenId - id of the screen to show (without 'screen-' prefix)
 */
function navigateTo(screenId) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    // Show target screen
    const target = document.getElementById(`screen-${screenId}`);
    if (target) {
        // Small delay to allow CSS transitions to feel smoother
        setTimeout(() => {
            target.classList.add('active');
        }, 50);
    }
    
    // Update bottom nav active state if applicable
    document.querySelectorAll('.nav-item').forEach(nav => {
        nav.classList.remove('active');
        // Simple heuristic: if the onclick contains the screenId, it's the active nav
        if (nav.hasAttribute('onclick') && nav.getAttribute('onclick').includes(screenId)) {
            nav.classList.add('active');
        }
    });
}

/**
 * UI Interaction: Confusion Hints Accordion
 */
function toggleHint(element) {
    const wasOpen = element.classList.contains('open');
    
    // Close all
    document.querySelectorAll('.accordion-item').forEach(item => {
        item.classList.remove('open');
    });
    
    // Toggle clicked
    if (!wasOpen) {
        element.classList.add('open');
        
        // Simulate Concept Map interaction based on hint open
        // (Just a visual flare for the prototype)
        const activeIndex = Array.from(element.parentNode.children).indexOf(element) + 1;
        document.querySelectorAll('.map-node').forEach(node => node.classList.remove('active-confused'));
        
        const targetNode = document.querySelector(`.node-${activeIndex}`);
        if (targetNode) {
            targetNode.classList.add('active-confused');
        }
    }
}

/**
 * UI Interaction: Gamified Quiz (Multi-Question)
 */
const quizBank = [
    {
        question: "What is the primary difference between a CNN and a standard MLP?",
        options: [
            { text: "MLPs use pooling layers while CNNs don't", correct: false },
            { text: "CNNs maintain spatial hierarchy of data", correct: true },
            { text: "CNNs are only for text processing", correct: false },
            { text: "MLPs are faster but less accurate", correct: false }
        ]
    },
    {
        question: "What does the vanishing gradient problem cause?",
        options: [
            { text: "Weights explode to infinity", correct: false },
            { text: "Early layers learn very slowly or stop learning", correct: true },
            { text: "The model trains too quickly", correct: false },
            { text: "The loss function becomes negative", correct: false }
        ]
    },
    {
        question: "Which activation function outputs max(0, x)?",
        options: [
            { text: "Sigmoid", correct: false },
            { text: "Tanh", correct: false },
            { text: "ReLU", correct: true },
            { text: "Softmax", correct: false }
        ]
    },
    {
        question: "What is the purpose of a loss function in machine learning?",
        options: [
            { text: "To speed up training iterations", correct: false },
            { text: "To measure how wrong the model's predictions are", correct: true },
            { text: "To add more layers to the network", correct: false },
            { text: "To normalize the input data", correct: false }
        ]
    },
    {
        question: "In gradient descent, what happens if the learning rate is too large?",
        options: [
            { text: "The model converges faster and better", correct: false },
            { text: "Training becomes more stable", correct: false },
            { text: "The model may overshoot the minimum and diverge", correct: true },
            { text: "The gradients vanish completely", correct: false }
        ]
    }
];

let currentQuizIndex = 0;
let quizScore = 0;
let quizAnswered = new Array(quizBank.length).fill(false);

function renderQuizQuestion() {
    const q = quizBank[currentQuizIndex];
    const questionEl = document.getElementById('quiz-question');
    const optionsEl = document.getElementById('quiz-options');
    const progressEl = document.getElementById('quiz-progress');
    const prevBtn = document.getElementById('quiz-prev-btn');
    const nextBtn = document.getElementById('quiz-next-btn');
    
    if (!questionEl || !optionsEl) return;
    
    progressEl.textContent = `QUESTION ${currentQuizIndex + 1} OF ${quizBank.length}`;
    questionEl.textContent = q.question;
    optionsEl.innerHTML = '';
    
    q.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'quiz-option';
        btn.innerHTML = `${opt.text} <div class="radio"></div>`;
        btn.onclick = () => selectQuizOption(btn, opt.correct);
        optionsEl.appendChild(btn);
    });
    
    // Navigation visibility
    prevBtn.style.visibility = currentQuizIndex > 0 ? 'visible' : 'hidden';
    nextBtn.style.display = quizAnswered[currentQuizIndex] ? 'block' : 'none';
    
    if (currentQuizIndex === quizBank.length - 1 && quizAnswered[currentQuizIndex]) {
        nextBtn.textContent = 'Finish Quiz';
    } else {
        nextBtn.textContent = 'Next →';
    }
}

function selectQuizOption(element, isCorrect) {
    if (quizAnswered[currentQuizIndex]) return; // already answered
    
    const parent = element.parentNode;
    parent.querySelectorAll('.quiz-option').forEach(opt => {
        opt.classList.remove('selected');
        const radio = opt.querySelector('.radio');
        radio.innerHTML = '';
    });
    
    element.classList.add('selected');
    const radio = element.querySelector('.radio');
    radio.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    
    quizAnswered[currentQuizIndex] = true;
    
    if (isCorrect) {
        quizScore++;
        showToast("Correct!", `+15 XP Earned (${quizScore}/${currentQuizIndex + 1})`, "success");
        const xpText = document.querySelector('.xp-text span');
        if (xpText) xpText.textContent = `${420 + quizScore * 15}/1000`;
    } else {
        showToast("Not quite...", "The correct answer is highlighted.", "info");
    }
    
    // Show next button
    const nextBtn = document.getElementById('quiz-next-btn');
    if (nextBtn) {
        nextBtn.style.display = 'block';
        if (currentQuizIndex === quizBank.length - 1) nextBtn.textContent = 'Finish Quiz';
    }
}

function nextQuizQuestion() {
    if (currentQuizIndex < quizBank.length - 1) {
        currentQuizIndex++;
        renderQuizQuestion();
    } else {
        // Quiz complete
        showToast('Quiz Complete!', `You scored ${quizScore}/${quizBank.length}!`, 'success');
        currentQuizIndex = 0;
        quizScore = 0;
        quizAnswered = new Array(quizBank.length).fill(false);
        setTimeout(() => setEmotion('neutral'), 2000);
    }
}

function prevQuizQuestion() {
    if (currentQuizIndex > 0) {
        currentQuizIndex--;
        renderQuizQuestion();
    }
}

// Initialize quiz on first load
document.addEventListener('DOMContentLoaded', () => {
    renderQuizQuestion();
});

// ==========================================
// PDF IMPORT
// ==========================================
async function handlePdfUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    showToast('Importing PDF', file.name, 'info');
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        
        // Set the worker source
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n\n';
        }
        
        if (!fullText.trim()) {
            showToast('PDF Error', 'Could not extract text. The PDF may be image-based.', 'info');
            return;
        }
        
        // Update the focus screen content
        const chapterTitle = document.getElementById('focus-chapter-title');
        const docTitle = document.getElementById('focus-doc-title');
        const textContent = document.getElementById('focus-text-content');
        
        if (chapterTitle) chapterTitle.textContent = 'IMPORTED DOCUMENT';
        if (docTitle) docTitle.textContent = file.name.replace('.pdf', '');
        if (textContent) {
            textContent.innerHTML = '';
            // Split into paragraphs
            const paragraphs = fullText.split(/\n\s*\n/).filter(p => p.trim());
            paragraphs.forEach(para => {
                const p = document.createElement('p');
                p.textContent = para.trim();
                textContent.appendChild(p);
            });
        }
        
        showToast('PDF Imported!', `${pdf.numPages} pages loaded successfully.`, 'success');
        
        // Navigate to focus mode
        setEmotion('focused');
        
    } catch (err) {
        console.error('PDF Error:', err);
        showToast('PDF Error', 'Failed to read the PDF file.', 'info');
    }
}

/**
 * UI Interaction: Settings Expand
 */
function toggleSettingsExpand(element) {
    element.classList.toggle('open');
}

/**
 * UI Interaction: Delete Modal
 */
function confirmDelete() {
    document.getElementById('delete-modal').classList.add('active');
}

// TODO LOGIC
function renderTodos() {
    const list = document.getElementById('todo-list-container');
    if (!list) return;
    
    const completedCount = todos.filter(t => t.completed).length;
    const progressTextEl = document.getElementById('dashboard-todo-progress');
    if (progressTextEl) {
        progressTextEl.textContent = `You've completed ${completedCount} of ${todos.length} tasks today. Great progress!`;
    }

    list.innerHTML = '';
    todos.forEach(todo => {
        const li = document.createElement('li');
        li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
        
        const leftDiv = document.createElement('div');
        leftDiv.className = 'todo-left';
        leftDiv.onclick = () => toggleTodo(todo.id);
        
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'todo-checkbox';
        checkboxDiv.innerHTML = '<i data-feather="check" style="width: 14px; height: 14px; stroke-width: 4px;"></i>';
        
        const textSpan = document.createElement('span');
        textSpan.className = 'todo-text';
        textSpan.textContent = todo.text; // TextContent prevents XSS
        
        leftDiv.appendChild(checkboxDiv);
        leftDiv.appendChild(textSpan);
        
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-todo-btn';
        delBtn.onclick = (e) => { e.stopPropagation(); deleteTodo(todo.id); };
        delBtn.innerHTML = '<i data-feather="trash-2"></i>';
        
        li.appendChild(leftDiv);
        li.appendChild(delBtn);
        list.appendChild(li);
    });
    feather.replace();
}

function addTodo(e) {
    e.preventDefault();
    const input = document.getElementById('new-todo-input');
    const text = input.value.trim();
    if (!text) return;
    
    todos.push({
        id: Date.now(),
        text: text,
        completed: false
    });
    saveState();
    
    input.value = '';
    renderTodos();
    showToast('Task Added', text, 'info');
}

function toggleTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (todo) {
        todo.completed = !todo.completed;
        saveState();
        renderTodos();
        if (todo.completed) {
            showToast('Task Completed!', todo.text, 'success');
        }
    }
}

function deleteTodo(id) {
    todos = todos.filter(t => t.id !== id);
    saveState();
    renderTodos();
}

// CALENDAR STREAK LOGIC
function logStudyDay() {
    const date = new Date();
    // Use local time for timezone safety instead of standard ISO
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    
    if (!studyDates.includes(todayStr)) {
        studyDates.push(todayStr);
        saveState();
    }
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const streakCountEl = document.getElementById('current-streak-count');
    if (!grid || !streakCountEl) return;
    
    grid.innerHTML = '';
    
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    // Empty spaces for the previous month
    for (let i = 0; i < firstDay; i++) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'calendar-day empty';
        grid.appendChild(emptyDiv);
    }
    
    // Calculate simple streak (consecutive days backward from today)
    const dateStrings = studyDates.sort((a,b) => b.localeCompare(a));
    let currentStreak = 0;
    let checkDate = new Date(); // Local time
    
    for (let i = 0; i < 365; i++) {
        const y = checkDate.getFullYear();
        const m = String(checkDate.getMonth() + 1).padStart(2, '0');
        const d = String(checkDate.getDate()).padStart(2, '0');
        const dStr = `${y}-${m}-${d}`;
        
        if (dateStrings.includes(dStr)) {
            currentStreak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else {
            // Check if today isn't logged yet, then check yesterday
            if (i === 0) {
               checkDate.setDate(checkDate.getDate() - 1);
            } else {
               break;
            }
        }
    }
    streakCountEl.textContent = currentStreak;

    // Format today string
    const ty = today.getFullYear();
    const tm = String(today.getMonth() + 1).padStart(2, '0');
    const td = String(today.getDate()).padStart(2, '0');
    const todayStr = `${ty}-${tm}-${td}`;

    // Fill days
    for (let i = 1; i <= daysInMonth; i++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        dayDiv.textContent = i;
        
        const mStr = String(currentMonth + 1).padStart(2, '0');
        const dStr = String(i).padStart(2, '0');
        const dateStr = `${currentYear}-${mStr}-${dStr}`;
        
        if (studyDates.includes(dateStr)) {
            dayDiv.classList.add('studied');
        }
        if (dateStr === todayStr) {
            dayDiv.classList.add('today');
        }
        
        grid.appendChild(dayDiv);
    }
}

// ==========================================
// UX MECHANISMS: TOASTS, THEME, TIMER
// ==========================================

// Theme Logic
const themes = ['light', 'dark', 'ocean', 'sepia'];

function cycleTheme() {
    const currentIndex = themes.indexOf(currentTheme);
    const nextTheme = themes[(currentIndex + 1) % themes.length];
    setTheme(nextTheme);
}

function setTheme(theme) {
    currentTheme = theme;
    document.body.setAttribute('data-theme', currentTheme);
    saveState();
    
    // Update body classes to maintain emotion
    const currentVis = document.body.dataset.emotion || 'neutral';
    document.body.className = `emotion-${currentVis}`;
    
    const themeSelect = document.getElementById('theme-selector');
    if (themeSelect) themeSelect.value = currentTheme;
    
    showToast('Theme Updated', `${theme.charAt(0).toUpperCase() + theme.slice(1)} Mode Enabled`, 'info');
}

// Toast Logic
function showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'success' ? 'check' : 'info';
    
    toast.innerHTML = `
        <div class="toast-icon">
            <i data-feather="${icon}"></i>
        </div>
        <div class="toast-content">
            <h4>${title}</h4>
            <p>${message}</p>
        </div>
    `;
    
    container.appendChild(toast);
    feather.replace();
    
    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after 3s
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400); 
    }, 3000);
}

// ==========================================
// PROFILE DROPDOWN LOGIC
// ==========================================
function toggleDropdown(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown) dropdown.classList.toggle('active');
}

// Close dropdown if clicking outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown && dropdown.classList.contains('active')) {
        if (!e.target.closest('.user-profile')) {
            dropdown.classList.remove('active');
        }
    }
});

function performLogout() {
    isAuthenticated = false;
    saveState();
    
    document.getElementById('main-header').style.display = 'none';
    document.getElementById('bottom-nav').style.display = 'none';
    
    // Hide all screens, show login
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-login').classList.add('active');
    
    // Hide dropdown
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown) dropdown.classList.remove('active');
    
    showToast('Logged Out', 'You have been safely logged out.', 'info');
}

// Pomodoro Timer Logic
let pomodoroRemaining = 25 * 60; // 25 mins
let pomodoroInterval = null;
let isTimerPaused = true;

function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function updateTimerDisplay() {
    const display = document.getElementById('focus-timer-display');
    if (display) display.textContent = formatTime(pomodoroRemaining);
}

function toggleTimer() {
    isTimerPaused = !isTimerPaused;
    const btn = document.getElementById('focus-pause-btn');
    if (btn) {
        btn.innerHTML = `<i data-feather="${isTimerPaused ? 'play' : 'pause'}"></i>`;
        feather.replace();
    }
    
    if (!isTimerPaused) {
        emotionCooldown = Date.now() + 60000;
        updateWebcamStatus("Paused (Focus Timer)");
        if (!pomodoroInterval) {
            pomodoroInterval = setInterval(() => {
                if (pomodoroRemaining > 0) {
                    pomodoroRemaining--;
                    updateTimerDisplay();
                } else {
                    // Timer finished!
                    clearInterval(pomodoroInterval);
                    pomodoroInterval = null;
                    isTimerPaused = true;
                    // Reset time
                    pomodoroRemaining = 25 * 60; 
                    updateTimerDisplay();
                    if (btn) {
                        btn.innerHTML = `<i data-feather="play"></i>`;
                        feather.replace();
                    }
                    showToast('Focus Session Complete!', 'Time for a guided break.', 'success');
                    setEmotion('frustrated'); // Routes to break screen
                }
            }, 1000);
        }
    } else {
        if (pomodoroInterval) {
            clearInterval(pomodoroInterval);
            pomodoroInterval = null;
        }
    }
}
