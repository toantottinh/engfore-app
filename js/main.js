/*
  Initialize Lucide icons
  https://lucide.dev/guide/packages/lucide
*/
lucide.createIcons();

// ==========================================
// SIDEBAR TOGGLE (for mobile)
// ==========================================
(function() {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.querySelector('.sidebar-toggle');

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('sidebar-open');
        });

        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768) {
                if (!sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
                    sidebar.classList.remove('sidebar-open');
                }
            }
        });
    }
})();

// ==========================================
// SEARCH FUNCTIONALITY
// ==========================================
(function() {
    const searchInput = document.querySelector('.topbar-search input[type="search"]');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim().toLowerCase();
                if (!query) return;

                const currentPage = window.location.pathname.split('/').pop();

                // Route search to appropriate page
                if (currentPage === 'index.html' || currentPage === '') {
                    window.location.href = 'pages/vocabulary.html';
                } else if (currentPage.includes('vocabulary')) {
                    const searchEvent = new CustomEvent('vocabulary-search', { detail: query });
                    document.dispatchEvent(searchEvent);
                }
            }
        });
    }
})();

// ==========================================
// THEME TOGGLE
// ==========================================
(function() {
    // The app is dark mode only per design system.
    // Future light mode toggle can go here.
})();

// ==========================================
// PASSWORD VISIBILITY TOGGLE
// ==========================================
(function() {
    document.querySelectorAll('.password-toggle').forEach(btn => {
        btn.addEventListener('click', function() {
            const input = this.parentElement.querySelector('input');
            if (input) {
                const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
                input.setAttribute('type', type);
                this.querySelector('.icon').setAttribute('data-lucide', type === 'password' ? 'eye' : 'eye-off');
                lucide.createIcons();
            }
        });
    });
})();

// ==========================================
// ACTIVE NAV ITEM HIGHLIGHT
// ==========================================
(function() {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-item').forEach(item => {
        const href = item.getAttribute('href').split('/').pop();
        if (href === currentPath) {
            item.classList.add('active');
            item.setAttribute('aria-current', 'page');
        }
    });
})();

// ==========================================
// PROGRESS BAR ANIMATION
// ==========================================
(function() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const progress = entry.target.querySelector('.progress');
                if (progress) {
                    const width = progress.style.width;
                    progress.style.width = '0%';
                    requestAnimationFrame(() => {
                        progress.style.width = width;
                    });
                }
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.progress-bar').forEach(bar => {
        observer.observe(bar);
    });
})();

// ==========================================
// TOAST NOTIFICATION SYSTEM
// ==========================================
(function() {
    window.showToast = function(message, type = 'success', duration = 3000) {
        const existing = document.querySelector('.toast-container');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.className = 'toast-container';
        container.style.cssText = `
            position: fixed;
            bottom: var(--space-8);
            right: var(--space-8);
            z-index: var(--z-tooltip);
            animation: fade-in-up 0.3s ease-out forwards;
        `;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.cssText = `
            display: flex;
            align-items: center;
            gap: var(--space-3);
            padding: var(--space-4) var(--space-6);
            border-radius: var(--radius-lg);
            font-size: var(--font-size-sm);
            font-weight: var(--font-weight-medium);
        `;

        const icon = document.createElement('i');
        icon.className = 'icon';
        const iconName = type === 'success' ? 'check-circle-2' : type === 'error' ? 'x-circle' : 'alert-circle';
        icon.setAttribute('data-lucide', iconName);
        toast.appendChild(icon);

        const text = document.createElement('span');
        text.textContent = message;
        toast.appendChild(text);

        container.appendChild(toast);
        document.body.appendChild(container);
        lucide.createIcons();

        setTimeout(() => {
            container.style.opacity = '0';
            container.style.transition = 'opacity 0.3s ease';
            setTimeout(() => container.remove(), 300);
        }, duration);
    };
})();

// ==========================================
// KEYBOARD SHORTCUTS
// ==========================================
(function() {
    document.addEventListener('keydown', (e) => {
        // Don't trigger shortcuts when typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // Escape - close modals
        if (e.key === 'Escape') {
            const modals = document.querySelectorAll('.modal-overlay');
            modals.forEach(modal => modal.style.display = 'none');
        }

        // '/' - focus search
        if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            const search = document.querySelector('.topbar-search input');
            if (search) search.focus();
        }
    });
})();
