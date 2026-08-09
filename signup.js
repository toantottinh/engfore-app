import { authService } from './auth.service.js';
import { getAuthErrorMessage } from './auth-errors.js';

const signupForm = document.getElementById('signup-form');
const message = document.getElementById('message');
const errorMessage = document.getElementById('error-message');
const submitButton = signupForm.querySelector('button[type="submit"]');

signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const username = signupForm.username.value.trim();
    const email = signupForm.email.value.trim();
    const password = signupForm.password.value;

    // Xóa các thông báo cũ
    message.textContent = '';
    errorMessage.textContent = '';

    // Form validation cơ bản
    if (!email || !password) {
        errorMessage.textContent = 'Vui lòng nhập đầy đủ email và mật khẩu.';
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errorMessage.textContent = 'Địa chỉ email không hợp lệ.';
        return;
    }
    if (password.length < 6) {
        errorMessage.textContent = 'Mật khẩu phải có ít nhất 6 ký tự.';
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Đang đăng ký...';

    try {
        const { data, error } = await authService.signUp(email, password, username);

        if (error) {
            throw error;
        }

        // Kiểm tra xem Supabase có tạo session ngay không.
        // Nếu cloud yêu cầu xác nhận email thì session sẽ là null.
        if (data?.session) {
            // Đã có session -> tự chuyển vào ứng dụng
            window.location.replace('/app.html');
        } else {
            // Chưa có session -> cần xác nhận email
            message.textContent = 'Đăng ký thành công. Vui lòng kiểm tra email để xác nhận tài khoản.';
            signupForm.reset();
        }
    } catch (error) {
        console.error('Lỗi đăng ký:', error.message);
        errorMessage.textContent = getAuthErrorMessage(error);
        submitButton.disabled = false;
        submitButton.textContent = 'Đăng ký';
    }
});
