'use strict';

(function () {
    const nodeRequire = typeof require === 'function' ? require : null;
    let sharedApi = null;

    try {
        sharedApi = nodeRequire ? nodeRequire('../../../shared/api') : null;
    } catch (error) {
        console.warn('notifications_history: shared/api unavailable.', error);
    }

    if (sharedApi && typeof sharedApi.requireAuth === 'function' && !sharedApi.requireAuth()) {
        throw new Error('Not authenticated');
    }

    const CATEGORY_STYLES = {
        matches: 'border-blue-400/20 bg-blue-500/10 text-blue-300',
        leagues: 'border-purple-400/20 bg-purple-500/10 text-purple-300',
        social: 'border-pink-400/20 bg-pink-500/10 text-pink-300',
        achievements: 'border-yellow-400/20 bg-yellow-500/10 text-yellow-300',
        streams: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300',
        security: 'border-red-400/20 bg-red-500/10 text-red-300',
        marketplace: 'border-green-400/20 bg-green-500/10 text-green-300',
        system: 'border-white/10 bg-white/5 text-gray-300',
    };

    const state = {
        filter: 'all',
        notifications: [],
    };

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function timeAgo(dateValue) {
        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime())) return 'Just now';

        const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
        if (diffMinutes < 1) return 'Just now';
        if (diffMinutes < 60) return `${diffMinutes}m ago`;

        const diffHours = Math.floor(diffMinutes / 60);
        if (diffHours < 24) return `${diffHours}h ago`;

        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) return `${diffDays}d ago`;

        return date.toLocaleDateString();
    }

    function categoryLabel(category) {
        if (!category) return 'System';
        return category.charAt(0).toUpperCase() + category.slice(1);
    }

    function applyFilter() {
        if (state.filter === 'unread') {
            return state.notifications.filter((notification) => !notification.isRead && !notification.archived);
        }

        if (state.filter === 'archived') {
            return state.notifications.filter((notification) => notification.archived);
        }

        return state.notifications;
    }

    function updateSummary() {
        const unread = state.notifications.filter((notification) => !notification.isRead && !notification.archived).length;
        const archived = state.notifications.filter((notification) => notification.archived).length;

        document.getElementById('history-total').textContent = String(state.notifications.length);
        document.getElementById('history-unread').textContent = String(unread);
        document.getElementById('history-archived').textContent = String(archived);
        document.getElementById('history-transport').textContent =
            (NotificationService.getTransportMode() || 'idle').toUpperCase();
    }

    function renderFilters() {
        document.querySelectorAll('.history-filter').forEach((button) => {
            const isActive = button.dataset.filter === state.filter;
            button.className =
                'history-filter rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wide transition ' +
                (isActive
                    ? 'border border-[#00ff87]/20 bg-[#00ff87]/15 text-[#00ff87]'
                    : 'border border-white/10 bg-white/5 text-white hover:bg-white/10');
        });
    }

    function renderList() {
        const list = document.getElementById('history-list');
        const empty = document.getElementById('history-empty');
        const filtered = applyFilter();

        list.innerHTML = '';
        empty.classList.toggle('hidden', filtered.length > 0);

        filtered.forEach((notification) => {
            const article = document.createElement('article');
            const categoryClass = CATEGORY_STYLES[notification.category] || CATEGORY_STYLES.system;

            article.className = 'px-6 py-5';
            article.innerHTML = `
                <div class="flex flex-wrap items-start justify-between gap-4">
                    <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${categoryClass}">
                                ${escapeHtml(categoryLabel(notification.category))}
                            </span>
                            ${notification.archived ? '<span class="rounded-full border border-yellow-400/20 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-yellow-300">Archived</span>' : ''}
                            ${notification.isRead ? '<span class="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Read</span>' : '<span class="rounded-full border border-[#00ff87]/20 bg-[#00ff87]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#00ff87]">Unread</span>'}
                            ${notification.resourceDeleted ? '<span class="rounded-full border border-red-400/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-red-300">Deleted</span>' : ''}
                        </div>
                        <h2 class="mt-3 text-lg font-black text-white">${escapeHtml(notification.title)}</h2>
                        <p class="mt-2 max-w-3xl text-sm leading-6 text-gray-400">${escapeHtml(notification.message)}</p>
                        <p class="mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500">${escapeHtml(timeAgo(notification.createdAt))}</p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        ${notification.isRead ? '' : '<button type="button" class="notif-read rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white transition hover:bg-white/10">Mark Read</button>'}
                        ${notification.link ? '<button type="button" class="notif-open rounded-xl border border-[#00ff87]/20 bg-[#00ff87]/10 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-[#00ff87] transition hover:bg-[#00ff87]/15">Open</button>' : ''}
                        <button type="button" class="notif-delete rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-red-300 transition hover:bg-red-500/15">Delete</button>
                    </div>
                </div>
            `;

            article.querySelector('.notif-read')?.addEventListener('click', async () => {
                try {
                    await NotificationService.markRead(notification._id);
                    await loadNotifications();
                } catch (error) {
                    console.error('Unable to mark notification as read:', error);
                }
            });

            article.querySelector('.notif-open')?.addEventListener('click', () => {
                NotificationService.openNotificationLink(notification.link);
            });

            article.querySelector('.notif-delete')?.addEventListener('click', async () => {
                try {
                    await NotificationService.deleteOne(notification._id);
                    await loadNotifications();
                } catch (error) {
                    console.error('Unable to delete notification:', error);
                }
            });

            list.appendChild(article);
        });
    }

    async function loadNotifications() {
        try {
            state.notifications = await NotificationService.fetchNotifications(true);
        } catch (error) {
            console.error('Unable to load notification history:', error);
            state.notifications = [];
        }

        updateSummary();
        renderFilters();
        renderList();
    }

    function bindEvents() {
        document.querySelectorAll('.history-filter').forEach((button) => {
            button.addEventListener('click', () => {
                state.filter = button.dataset.filter || 'all';
                renderFilters();
                renderList();
            });
        });

        document.getElementById('history-refresh').addEventListener('click', () => {
            void loadNotifications();
        });

        document.getElementById('history-mark-all').addEventListener('click', async () => {
            try {
                await NotificationService.markAllRead();
                await loadNotifications();
            } catch (error) {
                console.error('Unable to mark all notifications as read:', error);
            }
        });

        document.getElementById('history-clear-all').addEventListener('click', async () => {
            try {
                await NotificationService.clearAll();
                await loadNotifications();
            } catch (error) {
                console.error('Unable to clear notifications:', error);
            }
        });

        window.addEventListener('arena:notifications-updated', () => {
            void loadNotifications();
        });

        window.addEventListener('arena:notification-transport', () => {
            updateSummary();
        });
    }

    bindEvents();
    void loadNotifications();
})();
