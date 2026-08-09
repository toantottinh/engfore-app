import { authService } from './auth.service.js';
import { getAuthErrorMessage } from './auth-errors.js';

const loginForm = document.getElementById('login-form');
const errorMessage = document.getElementById('error-message');
const submitButton = loginForm.querySelector('button[type="submit"]');

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // Ngăn form gửi đi theo cách truyền thống

    const email = loginForm.email.value.trim();
    const password = loginForm.password.value;

    errorMessage.textContent = ''; // Xóa thông báo lỗi cũ

    // Form validation cơ bản
    if (!email || !password) {
        errorMessage.textContent = 'Vui lòng nhập đầy đủ email và mật khẩu.';
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errorMessage.textContent = 'Địa chỉ email không hợp lệ.';
        return;
    }

    // Vô hiệu hóa nút để tránh submit nhiều lần
    submitButton.disabled = true;
    submitButton.textContent = 'Đang đăng nhập...';

    try {
        const { data, error } = await authService.signIn(email, password);

        if (error) {
            throw error;
        }

        // Đăng nhập thành công, chuyển hướng đến trang chính của ứng dụng
        window.location.replace('/app.html');
    } catch (error) {
        console.error('Lỗi đăng nhập:', error.message);
        errorMessage.textContent = getAuthErrorMessage(error);
        submitButton.disabled = false;
        submitButton.textContent = 'Đăng nhập';
    }
});
