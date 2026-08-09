import { authService } from './auth.service.js';
import { dbService } from './db.service.js';
import { supabase, VAPID_PUBLIC_KEY } from './supabase-client.js';
import { shortcutService } from './shortcut.service.js';
import { themeService } from './theme.service.js';

let currentUser = null;
let profileForm, emailDisplay, usernameInput, avatarPreview, avatarUpload, statusMessage;
let newAvatarFile = null;
let notificationsToggle, themeToggle, dailyGoalInput;

let cleanupFunctions = []; // For event listener cleanup
export async function renderProfilePage(rootElement) {
    // 1. Tải CSS
    if (!document.querySelector('link[href="/profile.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/profile.css';
        document.head.appendChild(link);
    }

    // 2. Tải HTML
    const response = await fetch('/profile.html');
    if (!response.ok) {
        rootElement.innerHTML = `<p style="color: red; padding: 2rem;">Error loading profile page.</p>`;
        return;
    }
    rootElement.innerHTML = await response.text();

    // 3. Cache DOM và lấy dữ liệu
    cacheDOMElements();
    const { data: { user } } = await authService.getUser();
    currentUser = user;

    if (currentUser) {
        await loadProfileData();
        await loadProfileStats();
        await renderMasteryChart();
        await setupNotificationToggle();
        renderShortcutsSettings();
        setupThemeToggle();
        // setupEventListeners will add listeners, so we need to capture them for cleanup
        setupEventListeners();
    }
}

export function cleanup() {
    cleanupFunctions.forEach(func => func());
    cleanupFunctions = [];
}

function cacheDOMElements() {
    profileForm = document.getElementById('profile-form');
    emailDisplay = document.getElementById('email-display');
    usernameInput = document.getElementById('username-input');
    avatarPreview = document.getElementById('avatar-preview');
    avatarUpload = document.getElementById('avatar-upload');
    statusMessage = document.getElementById('profile-status');
    notificationsToggle = document.getElementById('notifications-toggle');
    themeToggle = document.getElementById('theme-toggle');
    dailyGoalInput = document.getElementById('daily-goal-input');
}

async function loadProfileData() {
    emailDisplay.value = currentUser.email;

    const { data: profile, error } = await dbService.getProfile(currentUser.id);
    if (error) {
        console.error('Error fetching profile:', error);
        return;
    }

    if (profile) {
        usernameInput.value = profile.username || '';
        if (profile.avatar_url) {
            const { data } = supabase.storage.from('avatars').getPublicUrl(profile.avatar_url);
            avatarPreview.src = data.publicUrl;
        }
        // Cập nhật giá trị input của mục tiêu
        dailyGoalInput.value = profile.daily_goal || 20;
    }
}

async function loadProfileStats() {
    const streakStatEl = document.getElementById('streak-stat');
    if (!streakStatEl) return;

    // Lấy chuỗi ngày học
    const { data: streak, error } = await dbService.getLearningStreak(currentUser.id);
    if (!error) {
        streakStatEl.textContent = `${streak || 0} days 🔥`;
    }

    // Lấy tiến độ mục tiêu và cập nhật UI
    const goalStatEl = document.getElementById('goal-stat');
    if (goalStatEl) {
        const { data: goalProgress, error: goalError } = await dbService.getDailyGoalProgress(currentUser.id);
        if (!goalError && goalProgress) {
            goalStatEl.textContent = `${goalProgress.words_learned || 0} / ${goalProgress.daily_goal}`;
        }
    }
}

function setupEventListeners() {
    avatarUpload.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            newAvatarFile = file;
            const reader = new FileReader();
            reader.onload = (e) => {
                avatarPreview.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    profileForm.addEventListener('submit', handleProfileUpdate);
    cleanupFunctions.push(() => profileForm.removeEventListener('submit', handleProfileUpdate));

    // Thêm listener cho input mục tiêu
    if (dailyGoalInput) {
        const handleGoalChange = () => {
            // Tạo một sự kiện submit giả để dùng chung logic cập nhật
            const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
            profileForm.dispatchEvent(submitEvent);
        };
        dailyGoalInput.addEventListener('change', handleGoalChange);
        cleanupFunctions.push(() => dailyGoalInput.removeEventListener('change', handleGoalChange));
    }

}

async function handleProfileUpdate(event) {
    event.preventDefault();
    statusMessage.textContent = 'Saving...';

    let avatarUrl = null;
    if (newAvatarFile) {
        const { data, error } = await dbService.uploadAvatar(newAvatarFile);
        if (error) {
            statusMessage.textContent = `Avatar upload failed: ${error.message}`;
            return;
        }
        avatarUrl = data.path;
    }

    const updates = {
        username: usernameInput.value.trim(),
        daily_goal: parseInt(dailyGoalInput.value, 10) || 20,
    };
    if (avatarUrl) {
        updates.avatar_url = avatarUrl;
    }

    const { error } = await dbService.updateProfile(currentUser.id, updates);

    statusMessage.textContent = error ? `Error: ${error.message}` : 'Profile updated successfully!';
    newAvatarFile = null;
}

async function setupNotificationToggle() {
    if (!('PushManager' in window)) {
        document.querySelector('.notification-section').style.display = 'none';
        return;
    }

    const registration = await navigator.serviceWorker.ready;
    const existingSubscription = await registration.pushManager.getSubscription();

    notificationsToggle.checked = !!existingSubscription;

    const handleNotificationToggle = async (event) => {
        if (event.target.checked) {
            await subscribeUserToPush();
        } else {
            await unsubscribeUserFromPush();
        }
    };
    notificationsToggle.addEventListener('change', handleNotificationToggle);
    cleanupFunctions.push(() => notificationsToggle.removeEventListener('change', handleNotificationToggle));
}

async function subscribeUserToPush() {
    const registration = await navigator.serviceWorker.ready;
    try {
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: VAPID_PUBLIC_KEY
        });
        console.log('User is subscribed:', subscription);
        await dbService.savePushSubscription(subscription, currentUser.id);
    } catch (error) {
        console.error('Failed to subscribe the user: ', error);
        notificationsToggle.checked = false;
    }
}

async function unsubscribeUserFromPush() {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
        await subscription.unsubscribe();
        console.log('User is unsubscribed.');
        // TODO: Add a dbService method to remove the subscription from the database
    }
}

function setupThemeToggle() {
    if (!themeToggle) return;
    themeToggle.checked = themeService.getCurrentTheme() === 'dark'; // Set initial state
    const handleThemeChange = () => {
        themeService.toggleTheme();
    };
    themeToggle.addEventListener('change', handleThemeChange);
    cleanupFunctions.push(() => themeToggle.removeEventListener('change', handleThemeChange));
}

function renderShortcutsSettings() {
    const list = document.getElementById('shortcuts-list');
    if (!list) return;

    const shortcuts = shortcutService.getShortcuts();
    const actionLabels = {
        submitAnswer: 'Submit Answer',
        flipCard: 'Flip Card',
        playAudio: 'Play Audio',
    };

    list.innerHTML = Object.entries(shortcuts).map(([action, key]) => `
        <li>
            <span>${actionLabels[action] || action}</span>
            <kbd class="shortcut-key" data-action="${action}">${key}</kbd>
        </li>
    `).join('');

    const handleShortcutListClick = (event) => {
        const target = event.target;
        if (target.classList.contains('shortcut-key')) {
            handleShortcutChange(target);
        }
    };
    list.addEventListener('click', handleShortcutListClick);
    cleanupFunctions.push(() => list.removeEventListener('click', handleShortcutListClick));
}

function handleShortcutChange(keyElement) {
    const action = keyElement.dataset.action;
    const originalText = keyElement.textContent;
    keyElement.textContent = 'Press a key...';
    keyElement.classList.add('recording');

    const keydownListener = (event) => {
        event.preventDefault();
        const newKey = event.code;
        
        // Kiểm tra nếu phím đã được sử dụng
        const shortcuts = shortcutService.getShortcuts();
        if (Object.values(shortcuts).includes(newKey)) {
            alert(`Key "${newKey}" is already in use.`);
            keyElement.textContent = originalText;
        } else {
            shortcutService.setShortcut(action, newKey);
            keyElement.textContent = newKey;
        }
        keyElement.classList.remove('recording');
        document.removeEventListener('keydown', keydownListener, { once: true });
    };

    document.addEventListener('keydown', keydownListener, { once: true });
}

async function renderMasteryChart() {
    const { data: stats, error } = await dbService.getMasteryLevelStats(currentUser.id);
    if (error || !stats || stats.length === 0) {
        document.querySelector('.stats-section').innerHTML += '<p>No learning data yet. Start practicing to see your progress!</p>';
        return;
    }

    // Dynamically import Chart.js
    const { Chart } = await import('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/+esm');

    const ctx = document.getElementById('mastery-chart').getContext('2d');

    const labels = ['Unseen', 'Novice', 'Beginner', 'Intermediate', 'Advanced', 'Mastered'];
    const colors = ['#4B5563', '#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6'];
    const chartData = new Array(6).fill(0);

    stats.forEach(stat => {
        if (stat.mastery_level >= 0 && stat.mastery_level < chartData.length) {
            chartData[stat.mastery_level] = stat.word_count;
        }
    });

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                label: 'Words',
                data: chartData,
                backgroundColor: colors,
                borderColor: 'var(--sidebar-bg)',
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: 'var(--text-secondary)'
                    }
                }
            }
        }
    });
}