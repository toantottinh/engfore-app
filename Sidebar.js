export const Sidebar = () => {
    const navItems = [
        { path: '/dashboard', label: 'Dashboard' },
        { path: '/library', label: 'Vocabulary Library' },
        { path: '/review', label: 'Review' },
        { path: '/settings', label: 'Settings' },
    ];

    return `
        <div class="sidebar-header">
            <a href="/app.html" class="sidebar-logo">EngFore</a>
        </div>
        <nav class="sidebar-nav">
            <ul>
                ${navItems.map(item => `
                    <li><a href="#${item.path}">${item.label}</a></li>
                `).join('')}
            </ul>
        </nav>
    `;
};