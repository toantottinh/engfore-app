/**
 * Tiện ích ánh xạ lỗi từ Supabase Auth sang thông báo tiếng Việt thân thiện.
 * Tất cả các lỗi hiển thị lên UI đều phải bằng tiếng Việt.
 */

/**
 * Map các mã lỗi / message phổ biến từ Supabase sang tiếng Việt.
 * Supabase trả về error.message, error.code hoặc error.error_code.
 */
const SUPABASE_ERROR_MAP = {
    // Đăng nhập
    'invalid_credentials': 'Email hoặc mật khẩu không chính xác.',
    'Invalid login credentials': 'Email hoặc mật khẩu không chính xác.',
    'invalid login credentials': 'Email hoặc mật khẩu không chính xác.',
    'Bad Request': 'Yêu cầu không hợp lệ. Vui lòng kiểm tra lại email và mật khẩu.',

    // Email chưa xác nhận
    'email_not_confirmed': 'Email chưa được xác nhận. Vui lòng kiểm tra hộp thư để xác nhận tài khoản.',
    'Email not confirmed': 'Email chưa được xác nhận. Vui lòng kiểm tra hộp thư để xác nhận tài khoản.',

    // Đăng ký
    'user_already_exists': 'Email này đã được đăng ký.',
    'User already registered': 'Email này đã đăng ký. Vui lòng đăng nhập hoặc dùng email khác.',
    'email_address_taken': 'Email này đã được đăng ký.',
    'Email address is already registered': 'Email này đã được đăng ký.',

    // Mật khẩu
    'weak_password': 'Mật khẩu phải có ít nhất 6 ký tự.',
    'Password should be at least 6 characters': 'Mật khẩu phải có ít nhất 6 ký tự.',
    'Password should be at least 6 characters.': 'Mật khẩu phải có ít nhất 6 ký tự.',
    'Password should be at least 8 characters': 'Mật khẩu phải có ít nhất 8 ký tự.',

    // Email không hợp lệ
    'invalid_email': 'Địa chỉ email không hợp lệ.',
    'Unable to validate email address: invalid format': 'Địa chỉ email không hợp lệ.',
    'Validation Failed': 'Địa chỉ email không hợp lệ. Vui lòng kiểm tra lại.',

    // Mạng / kết nối
    'Failed to fetch': 'Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối mạng.',
    'Network request failed': 'Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối mạng.',

    // Session
    'Auth session missing': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    'JWT expired': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    'token_expired': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',

    // Rate limit
    'signup_verifications': 'Bạn đã thực hiện quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.',
    'over_request_rate_limit': 'Bạn đã thực hiện quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.',
    'Over Email sending rate limit': 'Bạn đã gửi quá nhiều email xác nhận. Vui lòng thử lại sau ít phút.',

    // User bị vô hiệu
    'user_not_found': 'Không tìm thấy tài khoản với email này.',
    'User not found': 'Không tìm thấy tài khoản với email này.',
};

/** Thông báo mặc định khi không khớp được mã lỗi. */
const DEFAULT_ERROR_MESSAGE = 'Đã xảy ra lỗi. Vui lòng thử lại.';

/**
 * Trích xuất nội dung lỗi thành chuỗi message tiếng Việt.
 * @param {*} error - Đối tượng lỗi từ Supabase (hoặc string).
 * @returns {string} Thông báo lỗi tiếng Việt.
 */
export function getAuthErrorMessage(error) {
    if (!error) return DEFAULT_ERROR_MESSAGE;

    // Nếu lỗi là chuỗi đã là tiếng Việt do ta set, trả về nguyên bản.
    if (typeof error === 'string') {
        return SUPABASE_ERROR_MAP[error] || error || DEFAULT_ERROR_MESSAGE;
    }

    // Ưu tiên error.message
    const message = error.message || error.error_code || error.code || '';

    // Kiểm tra message trong map
    if (SUPABASE_ERROR_MAP[message]) {
        return SUPABASE_ERROR_MAP[message];
    }

    // Mata có thể chứa message lồng nhau
    if (error.error_code && SUPABASE_ERROR_MAP[error.error_code]) {
        return SUPABASE_ERROR_MAP[error.error_code];
    }

    // Các trường hợp đặc biệt dựa trên message
    const lower = message.toLowerCase();

    if (lower.includes('invalid login credentials')) {
        return 'Email hoặc mật khẩu không chính xác.';
    }
    if (lower.includes('already registered') || lower.includes('already been registered')) {
        return 'Email này đã được đăng ký.';
    }
    if (lower.includes('at least 6 characters')) {
        return 'Mật khẩu phải có ít nhất 6 ký tự.';
    }
    if (lower.includes('at least 8 characters')) {
        return 'Mật khẩu phải có ít nhất 8 ký tự.';
    }
    if (lower.includes('email not confirmed') || lower.includes('not confirmed')) {
        return 'Email chưa được xác nhận. Vui lòng kiểm tra hộp thư để xác nhận tài khoản.';
    }
    if (lower.includes('failed to fetch') || lower.includes('network')) {
        return 'Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối mạng.';
    }
    if (lower.includes('invalid email') || lower.includes('invalid format')) {
        return 'Địa chỉ email không hợp lệ.';
    }

    // Nếu message đã có dấu tiếng Việt, coi như đã được dịch.
    if (/[àáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]/i.test(message)) {
        return message;
    }

    return DEFAULT_ERROR_MESSAGE;
}
