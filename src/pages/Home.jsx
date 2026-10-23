import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <div className="page">
      <h1>Trang chủ</h1>
      <p className="muted">Chào mừng bạn đến với EngFore — học tiếng Anh thông minh với lặp lại ngắt quãng.</p>
      <div className="grid-2">
        <div className="card">
          <h2>Học ngắt quãng</h2>
          <p>Ôn tập từ vựng theo thuật toán SM-2: Flashcard, gõ từ, trắc nghiệm.</p>
          <Link to="/review" className="btn btn-primary">Bắt đầu học</Link>
        </div>
        <div className="card">
          <h2>Quản lý từ vựng</h2>
          <p>Thêm, sửa, tìm kiếm từ vựng trong kho của bạn.</p>
          <Link to="/vocabulary" className="btn btn-ghost">Mở từ vựng</Link>
        </div>
      </div>
    </div>
  );
}