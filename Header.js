export const Header = (user) => {
    const getInitials = (email) => {
        return email ? email.charAt(0).toUpperCase() : '?';
    }

    return `
        <div class="header-content">
            <div class="header-title" id="header-title">
                <!-- Tiêu đề trang sẽ được cập nhật ở đây -->
            </div>
            <div class="user-menu" id="user-menu">
                <div class="user-avatar">
                    ${getInitials(user.email)}
                </div>
                <div class="user-menu-dropdown">
                    <a href="#" id="logout-button">Logout</a>
                </div>
            </div>
        </div>
    `;
};