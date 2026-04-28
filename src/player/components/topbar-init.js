/**
 * Notification dropdown + upgrade modal (shared top bar behavior).
 * Safe to call once per navigation; idempotent via guard flag per document.
 */
function initTopbarChrome() {
    if (document.documentElement.dataset.arenaTopbarChromeInit === '1') return;
    document.documentElement.dataset.arenaTopbarChromeInit = '1';

    const notifToggle = document.getElementById('notif-toggle');
    const notifDropdown = document.getElementById('notif-dropdown');
    const notifBadge = document.getElementById('notif-badge');
    const markRead = document.getElementById('notif-mark-read');
    const upgradeBtn = document.getElementById('btn-upgrade');
    const upgradeModal = document.getElementById('upgrade-modal');
    const upgradeModalClose = document.getElementById('upgrade-modal-close');
    const upgradeCancel = document.getElementById('upgrade-cancel');
    const upgradeConfirm = document.getElementById('upgrade-confirm');
    const upgradeCurrentBadge = document.getElementById('upgrade-current-badge');

    if (notifToggle && notifDropdown) {
        notifToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const willOpen = notifDropdown.classList.contains('hidden');
            if (willOpen) {
                notifDropdown.classList.remove('hidden');
                notifToggle.setAttribute('aria-expanded', 'true');
            } else {
                notifDropdown.classList.add('hidden');
                notifToggle.setAttribute('aria-expanded', 'false');
            }
        });
        document.addEventListener('click', () => {
            notifDropdown.classList.add('hidden');
            notifToggle.setAttribute('aria-expanded', 'false');
        });
        notifDropdown.addEventListener('click', (e) => e.stopPropagation());
    }

    if (markRead && notifBadge) {
        markRead.addEventListener('click', () => {
            document.querySelectorAll('.notif-item').forEach((el) => {
                el.classList.remove('border-[#00ff87]');
                el.classList.add('border-transparent');
            });
            notifBadge.classList.add('hidden');
        });
    }

    function closeUpgrade() {
        if (upgradeModal) upgradeModal.classList.add('hidden');
    }

    if (upgradeBtn && upgradeModal) {
        upgradeBtn.addEventListener('click', () => upgradeModal.classList.remove('hidden'));
        if (upgradeModalClose) upgradeModalClose.addEventListener('click', closeUpgrade);
        if (upgradeCancel) upgradeCancel.addEventListener('click', closeUpgrade);
        upgradeModal.addEventListener('click', (e) => {
            if (e.target === upgradeModal) closeUpgrade();
        });
        if (upgradeConfirm && upgradeCurrentBadge) {
            upgradeConfirm.addEventListener('click', () => {
                upgradeCurrentBadge.textContent = 'ARENA PLUS';
                upgradeCurrentBadge.style.background = 'linear-gradient(135deg, #00ff87, #22d3ee)';
                upgradeCurrentBadge.style.color = '#0a0b0f';
                closeUpgrade();
            });
        }
    }
}

module.exports = { initTopbarChrome };
