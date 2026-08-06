import { authService } from './auth.service.js';
import { dbService } from './db.service.js';
import { supabase, VAPID_PUBLIC_KEY } from './supabase-client.js';

let currentUser = null;
let profileForm, emailDisplay, usernameInput, avatarPreview, avatarUpload, statusMessage;
let newAvatarFile = null;
let notificationsToggle;

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
        await renderMasteryChart();
        await setupNotificationToggle();
        setupEventListeners();
    }
}

function cacheDOMElements() {
    profileForm = document.getElementById('profile-form');
    emailDisplay = document.getElementById('email-display');
    usernameInput = document.getElementById('username-input');
    avatarPreview = document.getElementById('avatar-preview');
    avatarUpload = document.getElementById('avatar-upload');
    statusMessage = document.getElementById('profile-status');
    notificationsToggle = document.getElementById('notifications-toggle');
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

    notificationsToggle.addEventListener('change', async (event) => {
        if (event.target.checked) {
            await subscribeUserToPush();
        } else {
            await unsubscribeUserFromPush();
        }
    });
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