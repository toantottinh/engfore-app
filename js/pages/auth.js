document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('.auth-form');
    if (!form) return;

    // Password visibility toggle
    form.querySelectorAll('.input[type="password"]').forEach((input, idx) => {
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'btn-icon-only';
        toggleBtn.setAttribute('aria-label', 'Toggle password visibility');
        toggleBtn.style.cssText = 'position:absolute;right:8px;top:50%;transform:translateY(-50%);background:transparent;border:none;color:var(--text-tertiary);cursor:pointer;padding:4px;';
        toggleBtn.innerHTML = '<i class="icon" data-lucide="eye"></i>';
        wrapper.appendChild(toggleBtn);

        toggleBtn.addEventListener('click', () => {
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            toggleBtn.querySelector('.icon').setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
            lucide.createIcons();
        });
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // Validate email
        const email = form.querySelector('input[type="email"]');
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (email && !emailPattern.test(email.value.trim())) {
            email.focus();
            if (typeof window.showToast === 'function') {
                window.showToast('Please enter a valid email address.', 'error');
            }
            return;
        }

        // Validate password strength on register
        const password = form.querySelector('#password');
        if (password && password.value.length < 6) {
            password.focus();
            if (typeof window.showToast === 'function') {
                window.showToast('Password must be at least 6 characters.', 'error');
            }
            return;
        }

        // Validate confirm password on register
        const confirm = form.querySelector('#confirm-password');
        if (confirm && confirm.value !== password.value) {
            confirm.focus();
            if (typeof window.showToast === 'function') {
                window.showToast('Passwords do not match.', 'error');
            }
            return;
        }

        // Determine page type
        const pageTitle = document.title.toLowerCase();

        if (pageTitle.includes('forgot')) {
            if (typeof window.showToast === 'function') {
                window.showToast('Reset link sent! Check your email.', 'success');
            }
            setTimeout(() => { window.location.href = 'login.html'; }, 1500);
        } else if (pageTitle.includes('register')) {
            if (typeof window.showToast === 'function') {
                window.showToast('Account created! Redirecting to dashboard...', 'success');
            }
            setTimeout(() => { window.location.href = '../index.html'; }, 1500);
        } else {
            if (typeof window.showToast === 'function') {
                window.showToast('Welcome back! Redirecting to dashboard...', 'success');
            }
            setTimeout(() => { window.location.href = '../index.html'; }, 1500);
        }
    });
});

