/**
 * Ánh xạ lỗi Supabase Auth sang thông báo tiếng Việt thân thiện.
 */

const RATE_LIMIT_MESSAGE =
  'Bạn đã yêu cầu quá nhiều lần. Vui lòng chờ một lúc rồi thử lại.';

const EMAIL_NOT_CONFIRMED_MESSAGE =
  'Email của bạn chưa được xác thực. Vui lòng kiểm tra email để xác nhận tài khoản.';

const DEFAULT_ERROR_MESSAGE = 'Đã xảy ra lỗi. Vui lòng thử lại.';

const SUPABASE_ERROR_MAP = {
  // Đăng nhập
  invalid_credentials: 'Email hoặc mật khẩu không chính xác.',
  'Invalid login credentials': 'Email hoặc mật khẩu không chính xác.',

  // Đăng ký
  user_already_exists: 'Email này đã được đăng ký.',
  'User already registered': 'Email này đã được đăng ký.',

  // Mật khẩu
  weak_password: 'Mật khẩu phải có ít nhất 6 ký tự.',
  'Password should be at least 6 characters': 'Mật khẩu phải có ít nhất 6 ký tự.',

  // Email
  invalid_email: 'Địa chỉ email không hợp lệ.',
  'Unable to validate email address: invalid format': 'Địa chỉ email không hợp lệ.',
};

/**
 * Trích xuất nội dung lỗi từ Supabase và trả về thông báo tiếng Việt tương ứng.
 * Ưu tiên các trường hợp đặc biệt như "email chưa xác thực" và "rate limit".
 *
 * @param {*} error - Lỗi từ Supabase (AuthApiError) hoặc một chuỗi.
 * @returns {string} Thông báo lỗi đã được dịch và thân thiện với người dùng.
 */
export function getAuthErrorMessage(error) {
  if (!error) {
    return DEFAULT_ERROR_MESSAGE;
  }

  // Xử lý lỗi dạng chuỗi đơn giản. KHÔNG leak chuỗi thô ra UI:
  // nếu không khớp bản đồ nào, trả về thông báo mặc định chung chung.
  if (typeof error === 'string') {
    return SUPABASE_ERROR_MAP[error.toLowerCase()] || DEFAULT_ERROR_MESSAGE;
  }

  const message = (error.message || '').toLowerCase();
  const code = (error.code || '').toLowerCase();
  const status = error.status;

  // Lỗi PostgreSQL / PostgREST (Lỗi INSERT/RLS/NOT NULL/unique từ RPC).
  // Ưu tiên nhận diện code PostgreSQL (23505 duplicate, 23502 not-null, 42501 rls).
  if (code === '23505' || message.includes('duplicate key value')) {
    return 'Từ này đã tồn tại. Vui lòng kiểm tra danh sách nhập.';
  }
  if (code === '23502' || message.includes('null value in column')) {
    return 'Có từ thiếu dữ liệu bắt buộc (ví dụ: nghĩa). Vui lòng kiểm tra dòng đã nhập.';
  }
  if (
    code === '42501' ||
    message.includes('row-level security') ||
    message.includes('new row violates') ||
    (message.includes('permission') && message.includes('denied'))
  ) {
    return 'Bạn không có quyền thực hiện thao tác này vào bộ từ. Vui lòng kiểm tra quyền truy cập.';
  }
if (
    message.includes('could not find the function') ||
    message.includes('function') ||
    message.includes('does not exist')
  ) {
    return 'Không tìm thấy hàm import dữ liệu trên máy chủ.';
  }

  // Lỗi tùy chỉnh từ RPC import_words_to_set (SECURITY DEFINER) — bảo mật.
  if (message.includes('cần đăng nhập')) {
    return 'Bạn cần đăng nhập để nhập từ.';
  }
  if (message.includes('không có quyền nhập từ')) {
    return 'Bạn không có quyền nhập từ vào bộ từ này.';
  }

  // 1. Ưu tiên: Lỗi rate limit (quá nhiều yêu cầu)
  if (
    status === 429 ||
    code === 'rate_limit_exceeded' ||
    message.includes('rate limit exceeded') ||
    message.includes('too many requests') ||
    message.includes('rate limit')
  ) {
    return RATE_LIMIT_MESSAGE;
  }

  // 2. Ưu tiên: Email chưa được xác thực khi đăng nhập
  if (
    (status === 400 && message.includes('email not confirmed')) ||
    code === 'email_not_confirmed'
  ) {
    return EMAIL_NOT_CONFIRMED_MESSAGE;
  }

  // 3. Tra cứu trong map dựa trên message và code
  if (SUPABASE_ERROR_MAP[message]) {
    return SUPABASE_ERROR_MAP[message];
  }
  if (SUPABASE_ERROR_MAP[code]) {
    return SUPABASE_ERROR_MAP[code];
  }

  // 4. Các trường hợp tra cứu lỏng lẻo khác

  // 4a. Lỗi enum word_type không hợp lệ (PostgreSQL 22P02) khi import từ vựng.
  if (code === '22p02' || message.includes('invalid input value for enum')) {
    return 'Loại từ không hợp lệ. Vui lòng chọn một loại từ trong danh sách (noun, verb, adjective...).';
  }

  if (message.includes('invalid login credentials')) {
    return 'Email hoặc mật khẩu không chính xác.';
  }
  if (message.includes('user already registered')) {
    return 'Email này đã được đăng ký.';
  }
  if (message.includes('password should be at least')) {
    return 'Mật khẩu yếu, cần ít nhất 6 ký tự.';
  }
  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối mạng.';
  }

  // 5. Fallback cuối cùng
  return DEFAULT_ERROR_MESSAGE;
}

// Bản đồ lỗi khi xác thực email qua link callback / redirect.
// Supabase đính kèm `error_code` + `error_description` vào URL.
const CALLBACK_ERROR_MAP = {
  access_denied: 'Yêu cầu xác thực bị từ chối. Vui lòng thử lại.',
  'Access denied': 'Yêu cầu xác thực bị từ chối. Vui lòng thử lại.',
  expired_token: 'Liên kết xác thực đã hết hạn. Vui lòng gửi lại email xác thực.',
  'Email link is invalid or has expired': 'Liên kết xác thực không hợp lệ hoặc đã hết hạn. Vui lòng gửi lại email xác thực.',
  invalid_token: 'Liên kết xác thực không hợp lệ. Vui lòng gửi lại email xác thực.',
  'Invalid token': 'Liên kết xác thực không hợp lệ. Vui lòng gửi lại email xác thực.',
  email_not_confirmed: 'Email của bạn chưa được xác thực. Vui lòng kiểm tra email để xác nhận tài khoản.',
  'Email not confirmed': 'Email của bạn chưa được xác thực. Vui lòng kiểm tra email để xác nhận tài khoản.',
  // Google OAuth / Provider lỗi
  provider_disabled: 'Đăng nhập bằng Google hiện chưa được bật. Vui lòng thử lại sau.',
  'Provider is disabled': 'Đăng nhập bằng Google hiện chưa được bật. Vui lòng thử lại sau.',
  oauth_failed: 'Đăng nhập bằng Google thất bại. Vui lòng thử lại.',
  'Failed to fetch from google': 'Đăng nhập bằng Google thất bại. Vui lòng thử lại.',
  crypto_not_subtle: 'Trình duyệt của bạn không hỗ trợ mã hoá cần thiết cho đăng nhập. Vui lòng dùng trình duyệt khác.',
  'Invalid Credentials': 'Email hoặc mật khẩu không chính xác.',
  'Sign in with Google was cancelled': 'Bạn đã huỷ đăng nhập bằng Google.',
  'User cancelled': 'Bạn đã huỷ đăng nhập bằng Google.',
  'Flow State Not Found': 'Phiên đăng nhập Google đã hết hạn. Vui lòng thử lại.',
  'flow_state_not_found': 'Phiên đăng nhập Google đã hết hạn. Vui lòng thử lại.',
};

/**
 * Dịch lỗi trả về từ callback xác thực email (error_code / error_description).
 * KHÔNG leak chuỗi thô từ URL ra giao diện.
 *
 * @param {string} [errorCode] - Mã lỗi từ Supabase (query `error_code` hoặc `exchangeError.error_code`).
 * @param {string} [errorDescription] - Mô tả lỗi (query `error_description` hoặc `exchangeError.message`).
 * @returns {string} Thông báo lỗi tiếng Việt thân thiện với người dùng.
 */
export function getCallbackErrorMessage(errorCode, errorDescription) {
  // Ưu tiên khớp theo mã lỗi, rồi tới mô tả.
  if (errorCode) {
    const mapped = SUPABASE_ERROR_MAP[String(errorCode).toLowerCase()] ||
      CALLBACK_ERROR_MAP[String(errorCode).toLowerCase()];
    if (mapped) return mapped;
  }
  if (errorDescription) {
    const desc = String(errorDescription).toLowerCase();
    const byDesc = CALLBACK_ERROR_MAP[desc];
    if (byDesc) return byDesc;

    // Khớp lỏng theo từ khoá common trong mô tả.
    if (desc.includes('expired') || desc.includes('has expired')) {
      return 'Liên kết xác thực đã hết hạn. Vui lòng gửi lại email xác thực.';
    }
    if (desc.includes('invalid') || desc.includes('not valid')) {
      return 'Liên kết xác thực không hợp lệ. Vui lòng gửi lại email xác thực.';
    }
  }

  // Không khớp được -> thông báo chung, không leak raw lỗi.
  return 'Xác thực tài khoản thất bại. Vui lòng thử lại hoặc gửi lại email xác thực.';
}
