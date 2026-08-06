import { authService } from './auth.service.js';

const loginForm = document.getElementById('login-form');
const errorMessage = document.getElementById('error-message');

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // Ngăn form gửi đi theo cách truyền thống

    const email = loginForm.email.value;
    const password = loginForm.password.value;

    errorMessage.textContent = ''; // Xóa thông báo lỗi cũ

    try {
        const { error } = await authService.signIn(email, password);

        if (error) {
            throw error;
        }

        // Đăng nhập thành công, chuyển hướng đến trang chính của ứng dụng
        window.location.replace('/app.html'); 

    } catch (error) {
        console.error('Lỗi đăng nhập:', error.message);
        errorMessage.textContent = 'Email hoặc mật khẩu không đúng. Vui lòng thử lại.';
    }
});