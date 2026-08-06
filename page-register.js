import { authService } from '/auth.service.js';

document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('register-form');
    const messageElement = document.getElementById('message');

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageElement.textContent = '';
        messageElement.classList.remove('error-message', 'success-message');

        const username = registerForm.username.value;
        const email = registerForm.email.value;
        const password = registerForm.password.value;

        const { data, error } = await authService.signUp(email, password, username);

        if (error) {
            console.error('Registration failed:', error.message);
            messageElement.textContent = 'Đăng ký thất bại. Email có thể đã tồn tại.';
            messageElement.classList.add('error-message');
        } else {
            console.log('Registration successful:', data.user);
            messageElement.textContent = 'Đăng ký thành công! Vui lòng kiểm tra email để xác thực tài khoản.';
            messageElement.classList.add('success-message'); // Cần thêm style cho class này
            registerForm.reset();
        }
    });
});