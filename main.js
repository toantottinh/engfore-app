import { authService } from '/auth.service.js';
import { dbService } from './db.service.js';
import { addRoute, setRoot, navigate } from '/router.js';
import { offlineSyncService } from './offline-sync.service.js';
import { themeService } from './theme.service.js';
import { audioService } from './audio.service.js';
import { shortcutService } from './shortcut.service.js';

/**
 * Gắn sự kiện xử lý đăng xuất.
 */
const setupLogout = () => {
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            logoutButton.disabled = true;
            const { error } = await authService.signOut();
            if (error) {
                console.error('Lỗi khi đăng xuất:', error);
                logoutButton.disabled = false;
            } else {
                // onAuthStateChange (SIGNED_OUT) sẽ lo việc chuyển hướng,
                // nhưng để chắc chắn ta chuyển hướng luôn.
                window.location.replace('/login.html');
            }
        });
    }
};

/**
 * Lắng nghe sự thay đổi trạng thái xác thực.
 * - Khi đăng xuất (SIGNED_OUT): chuyển hướng về trang đăng nhập.
 * - Khi token được làm mới (TOKEN_REFRESHED): tiếp tục phiên làm việc.
 * - Đảm bảo session được duy trì khi refresh trang.
 */
const setupAuthStateListener = () => {
    const { data: { subscription } } = authService.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            console.log('Đã đăng xuất. Chuyển hướng về trang đăng nhập.');
            window.location.replace('/login.html');
        } else if (event === 'TOKEN_REFRESHED') {
            console.log('Phiên đăng nhập đã được làm mới.');
        }
    });
    return subscription;
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
 * Đồng bộ hóa dữ liệu offline khi có kết nối mạng trở lại.
 */
const syncOfflineData = async () => {
    const pendingUpdates = await offlineSyncService.getAllFromOutbox();
    if (pendingUpdates.length > 0) {
        console.log(`Syncing ${pendingUpdates.length} offline records...`);
        let allUpdates = [];
        pendingUpdates.forEach(record => {
            allUpdates = allUpdates.concat(record.payload);
        });

        // Loại bỏ các bản ghi trùng lặp, giữ lại bản ghi mới nhất cho mỗi từ
        const uniqueUpdates = [...new Map(allUpdates.map(item => [item.word_sense_id, item])).values()];

        const { error } = await dbService.updateUserProgress(uniqueUpdates);
        if (!error) {
            console.log('Offline data synced successfully!');
            await offlineSyncService.clearOutbox();
        } else {
            console.error('Failed to sync offline data:', error);
        }
    }
};
/**
 * Hàm khởi tạo và chạy ứng dụng chính.
 * Chịu trách nhiệm kiểm tra xác thực và render giao diện phù hợp.
 */
const initApp = async () => {
    // Khởi tạo theme service đầu tiên để tránh FOUC (flash of unstyled content)
    themeService.init();

    // Tải CSS cho hiệu ứng chuyển trang
    if (!document.querySelector('link[href="/page-transitions.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/page-transitions.css';
        document.head.appendChild(link);
    }
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
    addRoute('/', async () => import('/vocabulary-library.js'));
    addRoute('/set/:id', async () => import('/vocabulary-detail.js'));
    addRoute('/review', async () => import('/review.js'));
    addRoute('/profile', async () => import('/profile.js'));
    addRoute('/set/:id/practice', async () => import('/practice-session.js'));

    // Điều hướng lần đầu và lắng nghe các thay đổi
    // Bọc navigate trong một hàm để xử lý chuyển trang
    const handleNavigation = async () => {
        // Nếu có nội dung cũ, thêm class 'page-exit' để kích hoạt animation
        if (appRoot.children.length > 0) {
            appRoot.classList.add('page-exit');
            // Chờ animation kết thúc (0.3s từ CSS)
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        // Xóa nội dung cũ và class 'page-exit'
        appRoot.innerHTML = '';
        appRoot.classList.remove('page-exit');

        // Thêm class 'page-enter' để chuẩn bị cho animation vào
        appRoot.classList.add('page-enter');
        await navigate(); // Render nội dung mới

        // Kích hoạt animation vào
        requestAnimationFrame(() => {
            appRoot.classList.add('page-enter-active');
        });
        // Chờ animation kết thúc rồi xóa các class
        await new Promise(resolve => setTimeout(resolve, 300));
        appRoot.classList.remove('page-enter', 'page-enter-active');
    };

    await handleNavigation();
    updateActiveNav();
    window.addEventListener('hashchange', () => { handleNavigation(); updateActiveNav(); });

    setupLogout();
    loadReviewCount(user.id);

    // Lắng nghe sự kiện online để đồng bộ
    window.addEventListener('online', syncOfflineData);
    if (navigator.onLine) syncOfflineData(); // Thử đồng bộ ngay khi tải app

    // Khởi tạo audio service sau khi người dùng đã ở trong ứng dụng
    audioService.init();

    // Khởi tạo shortcut service
    shortcutService.init();
};

// Khởi chạy ứng dụng khi DOM đã sẵn sàng.
document.addEventListener('DOMContentLoaded', () => {
    initApp();

    // Lắng nghe sự thay đổi trạng thái xác thực (giữ session khi refresh, xử lý đăng xuất)
    setupAuthStateListener();

    // Register the Service Worker for PWA capabilities
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => console.log('Service Worker registered successfully:', registration))
            .catch(error => console.error('Service Worker registration failed:', error));
    }
});
