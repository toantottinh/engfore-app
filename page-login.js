import { authService } from '/auth.service.js';

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessage.textContent = '';

        const email = loginForm.email.value;
        const password = loginForm.password.value;

        const { data, error } = await authService.signIn(email, password);

        if (error) {
            console.error('Login failed:', error.message);
            errorMessage.textContent = 'Email hoặc mật khẩu không chính xác.';
        } else {
            console.log('Login successful:', data.user);
            // Chuyển hướng đến trang dashboard sau khi đăng nhập thành công
            window.location.href = '/app.html'; // This was already correct, but let's ensure it.
        }
    });
});