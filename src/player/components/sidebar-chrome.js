const { href, isDashboardPage } = require('./nav-config');

/**
 * Games section collapse + non-dashboard game tiles navigate to the home dashboard.
 */
function initSidebarChrome() {
    const gamesToggle = document.getElementById('games-toggle');
    const gamesToggleIcon = document.getElementById('games-toggle-icon');
    const gamesDropdown = document.getElementById('games-dropdown');
    if (gamesToggle && gamesDropdown && gamesToggleIcon) {
        gamesToggle.addEventListener('click', () => {
            const isOpen = !gamesDropdown.classList.contains('hidden');
            gamesDropdown.classList.toggle('hidden', isOpen);
            gamesToggleIcon.classList.toggle('rotate-180', !isOpen);
        });
    }

    const onDashboard = isDashboardPage();
    if (onDashboard) return;

    document.querySelectorAll('.game-select-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            window.location.href = href('dashboard');
        });
    });
}

module.exports = { initSidebarChrome };
