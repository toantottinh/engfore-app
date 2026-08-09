const STORAGE_KEY = 'engfore_theme';
const THEME_ATTR = 'data-theme';

let currentTheme;

function applyTheme(theme) {
    document.documentElement.setAttribute(THEME_ATTR, theme);
    currentTheme = theme;
}

function saveTheme(theme) {
    localStorage.setItem(STORAGE_KEY, theme);
}

/**
 * Khởi tạo theme service.
 * Áp dụng theme đã lưu hoặc theme mặc định của hệ thống.
 */
function init() {
    const savedTheme = localStorage.getItem(STORAGE_KEY);
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
    
    applyTheme(initialTheme);
    console.log(`Theme initialized to: ${initialTheme}`);
}

function toggleTheme() {
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    saveTheme(newTheme);
}

export const themeService = {
    init,
    toggleTheme,
    getCurrentTheme: () => currentTheme,
};