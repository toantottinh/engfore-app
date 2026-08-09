const STORAGE_KEY = 'engfore_shortcuts';

const defaultShortcuts = {
    submitAnswer: 'Enter',
    flipCard: 'Space',
    playAudio: 'KeyA',
};

let actions = {};
let shortcuts = {};

function loadShortcuts() {
    const customShortcuts = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    shortcuts = { ...defaultShortcuts, ...customShortcuts };
}

function saveShortcuts() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
}

function handleKeyDown(event) {
    // Bỏ qua nếu người dùng đang gõ trong input, textarea
    if (['INPUT', 'TEXTAREA'].includes(event.target.tagName)) {
        // Ngoại lệ cho phím Enter trong input
        if (event.target.tagName === 'INPUT' && event.code !== 'Enter') {
            return;
        }
    }

    const action = Object.keys(shortcuts).find(act => shortcuts[act] === event.code);

    if (action && actions[action]) {
        event.preventDefault();
        actions[action]();
    }
}

function init() {
    loadShortcuts();
    document.addEventListener('keydown', handleKeyDown);
    console.log('Shortcut service initialized.');
}

/**
 * Đăng ký một hành động với phím tắt.
 * @param {string} actionName - Tên hành động (e.g., 'submitAnswer').
 * @param {Function} callback - Hàm sẽ được gọi khi phím tắt được nhấn.
 */
function registerAction(actionName, callback) {
    actions[actionName] = callback;
}

/**
 * Hủy đăng ký một hành động.
 * @param {string} actionName - Tên hành động.
 */
function unregisterAction(actionName) {
    delete actions[actionName];
}

/**
 * Lấy cấu hình phím tắt hiện tại.
 * @returns {object}
 */
function getShortcuts() {
    return { ...shortcuts };
}

/**
 * Đặt một phím tắt mới cho một hành động.
 * @param {string} actionName - Tên hành động.
 * @param {string} newKeyCode - Mã phím mới (e.g., 'KeyS').
 */
function setShortcut(actionName, newKeyCode) {
    if (shortcuts[actionName]) {
        shortcuts[actionName] = newKeyCode;
        saveShortcuts();
    }
}

export const shortcutService = {
    init,
    registerAction,
    unregisterAction,
    getShortcuts,
    setShortcut,
};