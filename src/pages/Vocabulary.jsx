import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function VocabularyPage() {
  const [words, setWords] = useState([]);
  const [query, setQuery] = useState(() => sessionStorage.getItem("vocab-search") || "");
  const [loading, setLoading] = useState(true);
  const [newWord, setNewWord] = useState("");
  const [newIpa, setNewIpa] = useState("");

  useEffect(() => {
    sessionStorage.removeItem("vocab-search");
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("words").select("*").order("word");
    if (!error) setWords(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = words.filter((w) =>
    w.word.toLowerCase().includes(query.toLowerCase())
  );

  const add = async (e) => {
    e.preventDefault();
    if (!newWord.trim()) return;
    const { error } = await supabase.from("words").insert({ word: newWord.trim(), ipa: newIpa.trim() || "—" });
    if (!error) { setNewWord(""); setNewIpa(""); load(); }
  };

  return (
    <div className="page">
      <h1>Từ vựng</h1>
      <div className="card" style={{ marginBottom: 16 }}>
        <form onSubmit={add} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="input" placeholder="Từ mới" value={newWord} onChange={(e) => setNewWord(e.target.value)} />
          <input className="input" placeholder="IPA" value={newIpa} onChange={(e) => setNewIpa(e.target.value)} />
          <button className="btn btn-primary" type="submit">Thêm</button>
        </form>
      </div>
      <input
        className="input"
        placeholder="Tìm kiếm từ vựng..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 16, width: "100%" }}
      />
      {loading ? <p>Đang tải...</p> : (
        <div className="word-grid">
          {filtered.map((w) => (
            <div key={w.id} className="card word-card">
              <div className="word-title">{w.word}</div>
              <div className="word-ipa">{w.ipa}</div>
              {w.cefr_level && <span className="chip">{w.cefr_level}</span>}
            </div>
          ))}
          {filtered.length === 0 && <p className="muted">Không tìm thấy từ.</p>}
        </div>
      )}
    </div>
  );
}