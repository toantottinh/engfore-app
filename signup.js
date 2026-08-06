import { authService } from './auth.service.js';

const signupForm = document.getElementById('signup-form');
const message = document.getElementById('message');
const errorMessage = document.getElementById('error-message');

signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = signupForm.email.value;
    const password = signupForm.password.value;

    // Xóa các thông báo cũ
    message.textContent = '';
    errorMessage.textContent = '';

    try {
        const { data, error } = await authService.signUp(email, password);

        if (error) {
            throw error;
        }

        // Mặc định Supabase sẽ gửi email xác thực.
        // Chúng ta thông báo cho người dùng để họ kiểm tra email.
        message.textContent = 'Đăng ký thành công! Vui lòng kiểm tra email để xác thực tài khoản.';
        signupForm.reset(); // Xóa thông tin trên form

    } catch (error) {
        console.error('Lỗi đăng ký:', error.message);
        errorMessage.textContent = 'Đăng ký không thành công. Email có thể đã tồn tại hoặc mật khẩu không đủ mạnh.';
    }
});