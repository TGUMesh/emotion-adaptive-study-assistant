// Initialize Feather Icons
document.addEventListener("DOMContentLoaded", () => {
    feather.replace();
    
    // Set initial state
    setEmotion('neutral');
});

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
 * @param {string} emotion - 'neutral', 'confused', 'frustrated', 'focused', 'bored'
 */
function setEmotion(emotion) {
    // 1. Update body class for global emotion theming
    document.body.className = `emotion-${emotion}`;
    document.body.dataset.emotion = emotion;
    
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
