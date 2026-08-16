import { authService } from './auth.service.js';
import { dbService } from './db.service.js';
import * as vocabularyService from './src/services/vocabulary.service.js';

// Module-level state
let rootElement;
let vocabSetListContainer;
let isAdmin = false;
let adminViewActive = false;

/**
 * Main function to render the Vocabulary Library component.
 */
export async function renderVocabularyLibrary(element) {
    rootElement = element;
    
    // Load CSS
    if (!document.querySelector('link[href="/vocabulary-library.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/vocabulary-library.css';
        document.head.appendChild(link);
    }

    // Load HTML
    const response = await fetch('/vocabulary-library.html');
    if (!response.ok) {
        rootElement.innerHTML = `<p class="error">Error loading vocabulary library.</p>`;
        return;
    }
    rootElement.innerHTML = await response.text();

    // Setup UI and event listeners
    await setupEventListeners();
    
    // Initial render of the set list
    await renderSetList();
}

/**
 * Sets up all event listeners and dynamically adds admin controls if applicable.
 */
async function setupEventListeners() {
    vocabSetListContainer = rootElement.querySelector('.vocab-set-list');
    if (!vocabSetListContainer) return;

    // --- Check for Admin Role ---
    const { data: { user } } = await authService.getUser();
    if (user) {
        const { data: profile } = await authService.getProfile(user.id);
        isAdmin = profile?.role === 'admin';
    }

    // --- Standard User Event Listeners ---
    rootElement.querySelector('.add-set-btn').addEventListener('click', handleCreateSet);
    vocabSetListContainer.addEventListener('click', handleCardActions);
    rootElement.querySelector('.search-input').addEventListener('input', debounce(renderSetList, 300));
    rootElement.getElementById('sort-sets-select').addEventListener('change', renderSetList);
    rootElement.getElementById('advanced-search-toggle').addEventListener('click', () => {
        rootElement.getElementById('advanced-search-panel').classList.toggle('hidden');
    });
    rootElement.getElementById('apply-advanced-search-btn').addEventListener('click', renderSetList);
    rootElement.getElementById('clear-advanced-search-btn').addEventListener('click', () => {
        rootElement.getElementById('contains-word-input').value = '';
        rootElement.getElementById('created-after-date').value = '';
        rootElement.getElementById('created-before-date').value = '';
        renderSetList();
    });

    // --- Admin-Specific UI and Listeners ---
    if (isAdmin) {
        const headerActions = rootElement.querySelector('.header-actions');
        
        const createPublicSetBtn = document.createElement('button');
        createPublicSetBtn.className = 'btn btn-secondary';
        createPublicSetBtn.textContent = '+ Public Set';
        createPublicSetBtn.addEventListener('click', handleCreatePublicSet);
        headerActions.appendChild(createPublicSetBtn);

        const adminToggleBtn = document.createElement('button');
        adminToggleBtn.className = 'btn btn-warning admin-toggle-btn';
        adminToggleBtn.textContent = 'Admin Dashboard';
        adminToggleBtn.addEventListener('click', () => {
            adminViewActive = !adminViewActive;
            adminToggleBtn.textContent = adminViewActive ? 'My Dashboard' : 'Admin Dashboard';
            adminToggleBtn.classList.toggle('active');
            renderSetList();
        });
        headerActions.insertAdjacentElement('afterend', adminToggleBtn);
    }
}

/**
 * Renders the list of vocabulary sets based on user role and view mode.
 */
async function renderSetList() {
    if (!vocabSetListContainer) return;
    vocabSetListContainer.innerHTML = `<p class="empty-state">Loading sets...</p>`;

    const { data: { user } } = await authService.getUser();
    if (!user) {
        vocabSetListContainer.innerHTML = `<p class="empty-state">Please log in to view vocabulary sets.</p>`;
        return;
    }

    let sets, error;

    if (adminViewActive && isAdmin) {
        // Admin View: Fetch all sets
        const result = await vocabularyService.getAdminAllSets();
        sets = result.data;
        error = result.error;
    } else {
        // Standard User View: Fetch user's sets with filters
        const filters = {
            nameQuery: rootElement.querySelector('.search-input').value.trim(),
            containsWord: rootElement.getElementById('contains-word-input').value.trim(),
            createdAfter: rootElement.getElementById('created-after-date').value || null,
            createdBefore: rootElement.getElementById('created-before-date').value || null,
            sortBy: rootElement.getElementById('sort-sets-select').value.split('-')[0],
            sortOrderAsc: rootElement.getElementById('sort-sets-select').value.split('-')[1] === 'asc'
        };
        const result = await dbService.advancedSearchVocabularySets(user.id, filters);
        sets = result.data;
        error = result.error;
    }

    if (error) {
        vocabSetListContainer.innerHTML = `<p class="empty-state error">Error loading sets: ${error.message}</p>`;
        return;
    }

    if (!sets || sets.length === 0) {
        vocabSetListContainer.innerHTML = `<p class="empty-state">No vocabulary sets found.</p>`;
        return;
    }

    vocabSetListContainer.innerHTML = sets.map(set => createSetCardHTML(set, adminViewActive)).join('');
}


/**
 * Creates HTML for a vocabulary set card, with a different template for admin view.
 * @param {object} set - The vocabulary set object.
 * @param {boolean} isForAdminView - Flag to render the admin version of the card.
 * @returns {string} HTML string for the card.
 */
function createSetCardHTML(set, isForAdminView) {
    const createdAt = new Date(set.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: 'short', year: 'numeric' });
    const mastery = set.mastery_level ? `${Math.round(set.mastery_level * 100)}%` : 'N/A';

    if (isForAdminView) {
        const statusClass = set.status === 'published' ? 'published' : 'draft';
        const ownerInfo = set.owner_username ? `By: ${escapeHTML(set.owner_username)}` : 'Public (Official)';
        
        return `
            <div class="vocab-set-card admin-card" data-set-id="${set.id}">
                <div class="card-actions">
                    <button class="btn-icon" data-action="edit" title="Edit">✏️</button>
                    ${set.status === 'draft' ? `<button class="btn-icon" data-action="publish" title="Publish">🚀</button>` : ''}
                    ${set.status === 'published' ? `<button class="btn-icon" data-action="unpublish" title="Unpublish">↩️</button>` : ''}
                    <button class="btn-icon" data-action="delete" title="Delete">🗑️</button>
                </div>
                <a href="#/set/${set.id}" class="vocab-set-card-link">
                    <h3 class="card-title">${escapeHTML(set.name)}</h3>
                    <div class="card-meta">
                        <span>${set.word_count || 0} words</span>
                        <span>•</span>
                        <span>${ownerInfo}</span>
                    </div>
                    <div class="card-footer">
                        <span class="status ${statusClass}">${set.status}</span>
                        <span>Created: ${createdAt}</span>
                    </div>
                </a>
            </div>
        `;
    }

    // Default card for regular users
    return `
        <div class="vocab-set-card" data-set-id="${set.id}">
            <div class="card-actions">
                <button class="btn-icon edit-set-btn" data-set-id="${set.id}" data-set-name="${escapeHTML(set.name)}" title="Edit Name">✏️</button>
                <button class="btn-icon delete-set-btn" data-set-id="${set.id}" data-set-name="${escapeHTML(set.name)}" title="Delete Set">🗑️</button>
            </div>
            <a href="#/set/${set.id}" class="vocab-set-card-link">
                <h3 class="card-title">${escapeHTML(set.name)}</h3>
                <div class="card-meta">
                    <span>${set.word_count || 0} words</span>
                    <span>•</span>
                    <span>Created: ${createdAt}</span>
                </div>
                <div class="card-footer">
                    <span>Mastery: ${mastery}</span>
                </div>
            </a>
        </div>
    `;
}

// --- Action Handlers ---

async function handleCardActions(event) {
    const target = event.target;
    // Regular user buttons
    const deleteBtn = target.closest('.delete-set-btn');
    const editBtn = target.closest('.edit-set-btn');
    // Admin buttons
    const actionBtn = target.closest('[data-action]');

    if (adminViewActive && actionBtn) {
        const action = actionBtn.dataset.action;
        const card = actionBtn.closest('.vocab-set-card');
        const setId = card.dataset.setId;
        const setName = card.querySelector('.card-title')?.textContent || 'this set';

        switch(action) {
            case 'delete':
                handleDeleteSet(setId, setName);
                break;
            case 'edit':
                alert(`Admin edit for ${setName} (ID: ${setId}) is not implemented yet.`);
                break;
            case 'publish':
                handleSetStatus(setId, 'published');
                break;
            case 'unpublish':
                handleSetStatus(setId, 'draft');
                break;
        }
    } else if (deleteBtn) {
        handleDeleteSet(deleteBtn.dataset.setId, deleteBtn.dataset.setName);
    } else if (editBtn) {
        handleEditSet(editBtn.dataset.setId, editBtn.dataset.setName);
    }
}

async function handleDeleteSet(setId, setName) {
    if (confirm(`Are you sure you want to delete the set "${setName}"? This cannot be undone.`)) {
        // Note: RLS policies will determine if the user has permission.
        const { error } = await vocabularyService.deleteVocabularySet(setId);
        if (error) {
            alert(`Could not delete set: ${error.message}`);
        } else {
            await renderSetList();
        }
    }
}

async function handleEditSet(setId, currentName) {
    const newName = prompt("Enter new name for the set:", currentName);
    if (newName && newName.trim() && newName.trim() !== currentName) {
        // Note: RLS policies will determine permission.
        const { error } = await vocabularyService.updateVocabularySet(setId, { name: newName.trim() });
        if (error) {
            alert(`Could not rename set: ${error.message}`);
        } else {
            await renderSetList();
        }
    }
}

async function handleSetStatus(setId, status) {
    if (!isAdmin) return;
    const { error } = await vocabularyService.updateVocabularySet(setId, { status });
    if (error) {
        alert(`Could not update status: ${error.message}`);
    } else {
        await renderSetList();
    }
}

async function handleCreateSet() {
    const setName = prompt("Enter name for your new vocabulary set:");
    if (setName && setName.trim()) {
        const { data: { user } } = await authService.getUser();
        if (!user) {
            alert('You must be logged in to create a set.');
            return;
        }
        const { error } = await vocabularyService.createVocabularySet({ name: setName.trim(), userId: user.id });
        if (error) {
            alert(`Could not create set: ${error.message}`);
        } else {
            await renderSetList();
        }
    }
}

async function handleCreatePublicSet() {
    if (!isAdmin) return;
    const setName = prompt("[Admin] Enter name for new PUBLIC set:");
    if (setName && setName.trim()) {
        // user_id is null for public sets. RLS policy allows this for admins.
        const { error } = await vocabularyService.createVocabularySet({ name: setName.trim(), description: 'An official EngFore set.' });
        if (error) {
            alert(`Could not create public set: ${error.message}`);
        } else {
            await renderSetList();
        }
    }
}

/** Helper to escape HTML to prevent XSS */
const escapeHTML = str => String(str).replace(/[&<>'"]/g, tag => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[tag]));

/** Debounce utility */
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}
