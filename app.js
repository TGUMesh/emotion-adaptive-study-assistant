// Emotion Analysis State
let webcamActive = true;
let isAuthenticated = false;
let emotionDetectionInterval = null;
let currentEmotionBuffer = [];
const BUFFER_SIZE = 6; // 6 frames at 500ms = 3 seconds
let emotionCooldown = 0; // Timestamp to pause tracking

// Initialize Feather Icons & Face API
document.addEventListener("DOMContentLoaded", async () => {
    feather.replace();
    
    // Bind webcam toggle
    const toggle = document.getElementById('webcam-toggle');
    if (toggle) {
        toggle.addEventListener('change', (e) => {
            webcamActive = e.target.checked;
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
    const name = usernameInput && usernameInput.value ? usernameInput.value : "Student";
    
    // 1. Update the Header Name dynamically
    const greetingEl = document.getElementById('greeting-text');
    if (greetingEl) {
        greetingEl.textContent = `Good evening, ${name}`;
    }
    
    // 2. Unhide navigation elements
    document.getElementById('main-header').style.display = 'flex';
    document.getElementById('bottom-nav').style.display = 'flex';
    
    // 3. Set Authenticated state
    isAuthenticated = true;
    
    // 4. Trigger the usual initialization routines (hides login screen, routes to dashboard)
    renderTodos();
    document.body.dataset.emotion = 'login'; // Reset to force the neutral transition
    setEmotion('neutral');
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
            else if (emotion === 'happy') mappedEmotion = 'focused'; 
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
        // Require 5 out of 6 consecutive frames to be identical to account for minor API flickering
        const count = currentEmotionBuffer.filter(e => e === emotion).length;
        if (count >= 5) {
            updateWebcamStatus(`Detected: ${emotion}`);
            
            if (document.body.dataset.emotion !== emotion) {
                setEmotion(emotion);
            }
        } else {
            updateWebcamStatus(`Monitoring...`);
        }
    }
}

// User ignores the suggestion and continues reading
function ignoreEmotion() {
    // 30 Seconds cooldown to prevent re-triggering immediately
    emotionCooldown = Date.now() + 30000;
    
    // Clear buffer and return to neutral dashboard
    currentEmotionBuffer = [];
    setEmotion('neutral');
    updateWebcamStatus("Paused for 30s");
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
    document.body.className = `emotion-${emotion} ${isDarkMode ? 'dark-theme' : ''}`;
    document.body.dataset.emotion = emotion;
    
    // Notify user of state change if authenticated
    if (isAuthenticated) {
        showToast('State Change Detected', emotionLabels[emotion], 'info');
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
        if (nav.getAttribute('onclick').includes(screenId)) {
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
 * UI Interaction: Gamified Quiz
 */
function selectQuizOption(element) {
    // Deselect all
    const parent = element.parentNode;
    parent.querySelectorAll('.quiz-option').forEach(opt => {
        opt.classList.remove('selected');
        // Reset checkbox visuals
        const radio = opt.querySelector('.radio');
        radio.innerHTML = '';
    });
    
    // Select clicked
    element.classList.add('selected');
    const radio = element.querySelector('.radio');
    radio.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    
    // Simulate XP gain
    const streak = document.querySelector('.streak strong');
    if (streak) streak.textContent = "13 Days";
    
    const xpText = document.querySelector('.xp-text span');
    if (xpText) xpText.textContent = "435/1000";
    
    // Brief confetti simulation (just a visual delay response for the prototype)
    setTimeout(() => {
        setEmotion('neutral');
    }, 1500);
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
let todos = [
    { id: 1, text: "Read Chapter 4: Backpropagation", completed: true },
    { id: 2, text: "Complete Neural Networks Quiz", completed: true },
    { id: 3, text: "Review Derivative formulas", completed: false },
    { id: 4, text: "Write reflection paragraph", completed: false }
];

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
        
        li.innerHTML = `
            <div class="todo-left" onclick="toggleTodo(${todo.id})">
                <div class="todo-checkbox">
                    <i data-feather="check" style="width: 14px; height: 14px; stroke-width: 4px;"></i>
                </div>
                <span class="todo-text">${todo.text}</span>
            </div>
            <button class="delete-todo-btn" onclick="deleteTodo(${todo.id})">
                <i data-feather="trash-2"></i>
            </button>
        `;
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
    
    input.value = '';
    renderTodos();
    showToast('Task Added', text, 'info');
}

function toggleTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (todo) {
        todo.completed = !todo.completed;
        renderTodos();
        if (todo.completed) {
            showToast('Task Completed!', todo.text, 'success');
        }
    }
}

function deleteTodo(id) {
    todos = todos.filter(t => t.id !== id);
    renderTodos();
}

// ==========================================
// UX MECHANISMS: TOASTS, THEME, TIMER
// ==========================================

// Theme Logic
let isDarkMode = false;
function toggleTheme() {
    isDarkMode = !isDarkMode;
    if (isDarkMode) {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }
    
    // Re-apply emotion body classes so we don't accidentally wipe 'emotion-neutral' 
    const currentVis = document.body.dataset.emotion || 'neutral';
    document.body.className = `emotion-${currentVis} ${isDarkMode ? 'dark-theme' : ''}`;
    
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) {
        themeIcon.parentNode.innerHTML = `<i data-feather="${isDarkMode ? 'sun' : 'moon'}" id="theme-icon"></i>`;
        feather.replace();
    }
    showToast('Theme Updated', isDarkMode ? 'Dark Mode Enabled' : 'Light Mode Enabled', 'info');
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
