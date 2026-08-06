import { authService } from '/auth.service.js';
import { renderVocabularyLibrary } from '/vocabulary-library.js';
import { dbService } from './db.service.js';
import { renderVocabularyDetail } from '/vocabulary-detail.js';
import { renderPracticeSession } from '/practice-session.js';
import { renderReviewSession } from '/review.js';
import { renderProfilePage } from '/profile.js';
import { addRoute, setRoot, navigate } from '/router.js';

/**
 * Gắn sự kiện xử lý đăng xuất.
 */
const setupLogout = () => {
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            const { error } = await authService.signOut();
            if (error) {
                console.error('Lỗi khi đăng xuất:', error);
            } else {
                window.location.replace('/login.html');
            }
        });
    }
};

/**
 * Cập nhật trạng thái active cho mục điều hướng hiện tại.
 */
const updateActiveNav = () => {
    const path = window.location.hash.slice(1) || '/';
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    navItems.forEach(item => {
        // So sánh href (e.g., '#/review') với path hiện tại
        const itemPath = new URL(item.href).hash.slice(1);
        if (itemPath === path || (path === '/' && itemPath === '')) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
};

/**
 * Tải và hiển thị số lượng từ cần ôn tập.
 * @param {string} userId 
 */
const loadReviewCount = async (userId) => {
    const badge = document.getElementById('review-count-badge');
    if (!badge) return;

    const { count, error } = await dbService.getDueReviewWordsCount(userId);

    if (!error && count > 0) {
        badge.textContent = count;
        badge.classList.add('visible');
    }
};

/**
 * Hàm khởi tạo và chạy ứng dụng chính.
 * Chịu trách nhiệm kiểm tra xác thực và render giao diện phù hợp.
 */
const initApp = async () => {
    console.log('Khởi tạo ứng dụng EngFore...');

    const { data: { user }, error } = await authService.getUser();

    if (error || !user) {
        console.log('Không có phiên hoạt động. Đang chuyển hướng đến trang đăng nhập.');
        window.location.replace('/login.html');
        return;
    }
    
    const appRoot = document.getElementById('app-root');
    if (!appRoot) {
        console.error('LỖI NGHIÊM TRỌNG: Không tìm thấy phần tử #app-root! Không thể khởi chạy ứng dụng.');
        return;
    }

    // Thiết lập router
    setRoot(appRoot);
    addRoute('/', renderVocabularyLibrary);
    addRoute('/set/:id', renderVocabularyDetail);
    addRoute('/review', renderReviewSession);
    addRoute('/profile', renderProfilePage);
    addRoute('/set/:id/practice', renderPracticeSession);

    // Điều hướng lần đầu và lắng nghe các thay đổi
    await navigate();
    updateActiveNav();
    window.addEventListener('hashchange', () => { navigate(); updateActiveNav(); });

    setupLogout();
    loadReviewCount(user.id);
};

// Khởi chạy ứng dụng khi DOM đã sẵn sàng.
document.addEventListener('DOMContentLoaded', () => {
    initApp();

    // Register the Service Worker for PWA capabilities
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => console.log('Service Worker registered successfully:', registration))
            .catch(error => console.error('Service Worker registration failed:', error));
    }
});