export default function QueueCounter({ newCount, againCount, reviewCount }) {
  return (
    <div className="queue-counter">
      <span className="qc green">• {newCount} Mới</span>
      <span className="qc red">• {againCount} Again</span>
      <span className="qc blue">• {reviewCount} Ôn</span>
    </div>
  );
}