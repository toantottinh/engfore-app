// =====================================================================
// Shared, dependency-free pub/sub for Vocabulary membership refresh.
//
// WHY (data-cleanup/debug root cause — "Vocabulary does not show a just
// imported word"):
//   The Vocabulary LIBRARY page only (re)loads `getUserVocabulary` inside a
//   `useEffect(..., [user])`. After a successful import on `/vocabulary/import`
//   the Library `words` state is never invalidated, so — when the Library
//   component is still mounted or returns without a clean remount+refetch — a
//   newly added word (e.g. `decide`) is missing until a manual reload.
//
//   PostgREST query shape was verified VALID (supabase-js normalizes the
//   select string; a verbatim replay returns 200). The DB rows themselves are
//   correct (set_words / user_vocabulary exist for `decide`). So the bug is a
//   stale-view state problem, NOT a query or RPC or data problem.
//
// FIX (minimal, no DB/RPC changes):
//   Import triggers vocabularyStore.refresh() after a successful mutation;
//   the Library subscribes to it and re-runs getUserVocabulary(). Any owner
//   of "library words" state can subscribe. Refresh is fire-and-forget; the
//   subscriber re-renders only when it actually gets new data.
// =====================================================================

const listeners = new Set();

let currentVersion = 0;
export const vocabularyStore = {
  /** Call from a subscriber (e.g. Library) to (re)load; returns unsubsribe. */
  subscribe(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  /** Bump the version and notify every subscriber (e.g. after an import). */
  refresh() {
    currentVersion += 1;
    listeners.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        // Subscribers must be resilient; never throw out of a refresh.
        if (import.meta?.env?.DEV) console.error('[vocabularyStore] subscriber throw:', e);
      }
    });
  },
  /** Used by components to depend on "data changed since last read". */
  get version() {
    return currentVersion;
  },
};

/** Convenience exported for callers that only emit (Import, add-word flows). */
export const refreshVocabulary = () => vocabularyStore.refresh();
