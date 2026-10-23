import { NavLink, useLocation } from "react-router-dom";
import { BookMarked, Home, RotateCcw, Search, User } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function AppLayout({ children }) {
  const location = useLocation();
  const [dueCount, setDueCount] = useState(0);
  const [search, setSearch] = useState("");

  useEffect(() => {
    // best-effort badge count: words total (cap 99+)
    (async () => {
      try {
        const { count } = await supabase
          .from("words")
          .select("id", { count: "exact", head: true });
        if (typeof count === "number") setDueCount(Math.min(count, 999));
      } catch {
        setDueCount(0);
      }
    })();
  }, []);

  useEffect(() => {
    if (search.trim() && location.pathname !== "/vocabulary") {
      // route search to vocabulary page by storing query
      sessionStorage.setItem("vocab-search", search.trim());
    }
  }, [search, location.pathname]);

  const badge = dueCount > 99 ? "99+" : dueCount;

  return (
    <div className="app">
      <header className="topnav">
        <div className="topnav-left">
          <div className="logo">
            <span className="logo-icon">E</span>
            <span className="logo-text">EngFore</span>
          </div>
          <nav className="nav-links">
            <NavLink to="/" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <Home size={18} /> Trang chủ
            </NavLink>
            <NavLink to="/vocabulary" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <BookMarked size={18} /> Từ vựng
            </NavLink>
            <NavLink to="/review" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              <RotateCcw size={18} /> Học ngắt quãng
              {dueCount > 0 && <span className="badge">{badge}</span>}
            </NavLink>
          </nav>
        </div>
        <div className="topnav-center">
          <div className="search-box">
            <Search size={16} />
            <input
              type="search"
              placeholder="Tìm kiếm từ vựng nhanh..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && search.trim()) {
                  sessionStorage.setItem("vocab-search", search.trim());
                  window.location.href = "/vocabulary";
                }
              }}
            />
          </div>
        </div>
        <div className="topnav-right">
          <div className="avatar">Toàn</div>
        </div>
      </header>
      <main className="main-content">{children}</main>
    </div>
  );
}