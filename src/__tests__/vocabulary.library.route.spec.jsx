import React, { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, useParams } from 'react-router-dom';
import { AuthProvider } from '../hooks/useAuth.jsx';
import AppRoutes from '../App.jsx';

/*
 * Regression test for: GET /vocabulary/library -> 400
 *   "invalid input syntax for type uuid: \"library\""
 *
 * Root cause: src/App.jsx registered a greedy sibling
 *   <Route path="/vocabulary/:setId" element={<VocabularyDetail/>} />
 * which also matched the static segments /vocabulary/library, /vocabulary/sets
 * and /vocabulary/priority (no route declared for them). `:setId` captured
 * "library" and was forwarded to useVocabularyDetail -> getWordsInSet("library")
 * (RPC uuid error) and getVocabularySet("library") (REST
 * /vocabulary_sets?id=eq.library error).
 *
 * Fix: declare library/sets/priority as child routes of /vocabulary (same
 * convention as the existing import/practice children), so the static
 * segments win over the dynamic :setId param.
 *
 * This test renders the REAL AppRoutes route tree from App.jsx. Leaf pages are
 * replaced with marker components that reproduce each page's data-fetch
 * contract, so we assert exactly which set-detail fetch the router triggers
 * for a given URL.
 */

const USER = { id: 'user-1', email: 'user@example.com' };
const UUID = '11111111-2222-4333-8444-555555555555';

// Stand-ins for the set-detail fetches useVocabularyDetail performs
// (getWordsInSet = RPC, getVocabularySet = REST /vocabulary_sets?id=eq.<id>).
const getWordsInSetMock = vi.fn(async () => ({ data: [], error: null }));
const getVocabularySetMock = vi.fn(async () => ({ data: null, error: null }));

vi.mock('../services/auth.service.js', () => ({
  authService: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    getSession: async () => ({ data: { session: null }, error: null }),
    ensureProfile: async () => ({ data: USER, error: null }),
  },
}));

// Vocabulary page marker: the library/sets/priority view performs NO
// set-detail fetch (it never calls getWordsInSet / getVocabularySet).
vi.mock('../pages/Vocabulary/index.jsx', () => ({
  default: () =>
    React.createElement('div', { 'data-testid': 'vocabulary-page' }, 'Thư viện từ vựng'),
}));

// VocabularyDetail marker: on a `:setId` route it calls the set-detail fetches
// with the route param — exactly what useVocabularyDetail does.
vi.mock('../pages/VocabularyDetail/index.jsx', () => ({
  default: function VocabularyDetailMarker() {
    const { setId } = useParams();
    useEffect(() => {
      if (setId) {
        getVocabularySetMock(setId);
        getWordsInSetMock(setId, USER.id);
      }
    }, [setId]);
    return React.createElement(
      'div',
      { 'data-testid': 'vocabulary-detail-page' },
      'VocabularyDetail ' + setId
    );
  },
}));

// Stub every other leaf page / layout so App.jsx's top-level imports don't
// execute unrelated (and possibly jsdom-incompatible) code. None are rendered
// for the /vocabulary/* routes under test.
const NULL_STUBS = [
  '../pages/Home/index.jsx',
  '../pages/AuthCallback/index.jsx',
  '../pages/Login/index.jsx',
  '../pages/Register/index.jsx',
  '../pages/App/index.jsx',
  '../pages/Import/index.jsx',
  '../pages/Practice/index.jsx',
  '../pages/PracticeSession/index.jsx',
  '../pages/TypingPractice/index.jsx',
  '../pages/FlashcardPractice/index.jsx',
  '../pages/LearningSession/index.jsx',
  '../pages/LearnStructures/index.jsx',
  '../pages/StructureReview/index.jsx',
  '../pages/ExerciseImport/index.jsx',
  '../pages/Structures/index.jsx',
  '../pages/Structures/StructureDetail.jsx',
  '../pages/StructureSession/index.jsx',
  '../pages/Profile/index.jsx',
  '../layouts/PublicLayout.jsx',
  '../LearnLayout.jsx',
  '../Topbar.jsx',
];
// NOTE: must be static (literal path) calls for vitest's vi.mock hoisting.
vi.mock('../pages/Home/index.jsx', () => ({ default: () => null }));
vi.mock('../pages/AuthCallback/index.jsx', () => ({ default: () => null }));
vi.mock('../pages/Login/index.jsx', () => ({ default: () => null }));
vi.mock('../pages/Register/index.jsx', () => ({ default: () => null }));
vi.mock('../pages/App/index.jsx', () => ({ default: () => null }));
vi.mock('../pages/Import/index.jsx', () => ({ default: () => null }));
vi.mock('../pages/Practice/index.jsx', () => ({ default: () => null }));
vi.mock('../pages/PracticeSession/index.jsx', () => ({ default: () => null }));
vi.mock('../pages/TypingPractice/index.jsx', () => ({ default: () => null }));
vi.mock('../pages/FlashcardPractice/index.jsx', () => ({ default: () => null }));
vi.mock('../pages/LearningSession/index.jsx', () => ({ default: () => null }));
vi.mock('../pages/LearnStructures/index.jsx', () => ({ default: () => null }));
vi.mock('../pages/StructureReview/index.jsx', () => ({ default: () => null }));
vi.mock('../pages/ExerciseImport/index.jsx', () => ({ default: () => null }));
vi.mock('../pages/Structures/index.jsx', () => ({ default: () => null }));
vi.mock('../pages/Structures/StructureDetail.jsx', () => ({ default: () => null }));
vi.mock('../pages/StructureSession/index.jsx', () => ({ default: () => null }));
vi.mock('../pages/Profile/index.jsx', () => ({ default: () => null }));
vi.mock('../layouts/PublicLayout.jsx', () => ({ default: () => null }));
vi.mock('../LearnLayout.jsx', () => ({ default: () => null }));
vi.mock('../Topbar.jsx', () => ({ default: () => null }));

function mount(path) {
  return render(
    React.createElement(MemoryRouter, { initialEntries: [path] },
      React.createElement(AuthProvider, { initialUser: USER },
        React.createElement(AppRoutes)
      )
    )
  );
}

describe('Route collision: /vocabulary/library must NOT be treated as a Set UUID', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('/vocabulary/library renders the Vocabulary page and never fetches the set "library"', async () => {
    mount('/vocabulary/library');

    await waitFor(() => expect(screen.getByTestId('vocabulary-page')).toBeInTheDocument());
    expect(screen.queryByTestId('vocabulary-detail-page')).toBeNull();

    // The set-detail fetches must NOT be invoked with the literal "library".
    expect(getWordsInSetMock).not.toHaveBeenCalledWith('library', expect.anything());
    expect(getVocabularySetMock).not.toHaveBeenCalledWith('library');
    // VocabularyDetail never mounted, so they must not have been called at all.
    await waitFor(() => expect(getWordsInSetMock).not.toHaveBeenCalled());
    expect(getVocabularySetMock).not.toHaveBeenCalled();
  });

  it('/vocabulary/<UUID> still renders VocabularyDetail and calls getWordsInSet(UUID)', async () => {
    mount('/vocabulary/' + UUID);

    await waitFor(() => expect(screen.getByTestId('vocabulary-detail-page')).toBeInTheDocument());
    expect(screen.queryByTestId('vocabulary-page')).toBeNull();

    // Set-detail fetches use the real UUID, never "library".
    expect(getVocabularySetMock).toHaveBeenCalledWith(UUID);
    await waitFor(() => expect(getWordsInSetMock).toHaveBeenCalledWith(UUID, USER.id));
    expect(getWordsInSetMock).not.toHaveBeenCalledWith('library', expect.anything());
  });

  it('/vocabulary/sets and /vocabulary/priority also resolve to the Vocabulary page', async () => {
    mount('/vocabulary/sets');
    await waitFor(() => expect(screen.getByTestId('vocabulary-page')).toBeInTheDocument());
    expect(screen.queryByTestId('vocabulary-detail-page')).toBeNull();
    expect(getWordsInSetMock).not.toHaveBeenCalled();

    cleanup();
    mount('/vocabulary/priority');
    await waitFor(() => expect(screen.getByTestId('vocabulary-page')).toBeInTheDocument());
    expect(screen.queryByTestId('vocabulary-detail-page')).toBeNull();
    expect(getWordsInSetMock).not.toHaveBeenCalled();
  });
});
