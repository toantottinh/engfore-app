import { Link } from "react-router-dom";

export default function SessionComplete() {
  return (
    <div className="session-complete">
      <div className="party">🎉</div>
      <h2>Hoàn thành phiên học!</h2>
      <p>Bạn đã hoàn thành tất cả từ trong hàng đợi.</p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 16 }}>
        <Link to="/" className="btn btn-ghost">Quay lại Trang chủ</Link>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Học thêm từ mới</button>
      </div>
    </div>
  );
}