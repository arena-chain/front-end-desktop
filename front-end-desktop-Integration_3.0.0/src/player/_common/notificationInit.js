'use strict';

if (!window.__ARENA_NOTIFICATIONS_BOOTSTRAPPED__) {
    window.__ARENA_NOTIFICATIONS_BOOTSTRAPPED__ = true;

    const CATEGORY_STYLES = {
        matches: { border: '#3b82f6', badge: 'bg-blue-500/15 text-blue-300 border-blue-400/20' },
        leagues: { border: '#a855f7', badge: 'bg-purple-500/15 text-purple-300 border-purple-400/20' },
        social: { border: '#ec4899', badge: 'bg-pink-500/15 text-pink-300 border-pink-400/20' },
        achievements: {
            border: '#eab308',
            badge: 'bg-yellow-500/15 text-yellow-300 border-yellow-400/20',
        },
        streams: { border: '#00ff87', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20' },
        security: { border: '#ef4444', badge: 'bg-red-500/15 text-red-300 border-red-400/20' },
        marketplace: {
            border: '#22c55e',
            badge: 'bg-green-500/15 text-green-300 border-green-400/20',
        },
        system: { border: 'rgba(255,255,255,0.18)', badge: 'bg-white/10 text-gray-300 border-white/10' },
    };

    const ARCHIVE_THRESHOLD = 100;
    let currentNotifications = [];
    let loadQueued = false;

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

    function formatCategory(category) {
        if (!category) return 'System';
        return category.charAt(0).toUpperCase() + category.slice(1);
    }

    function ensureToastHost() {
        let host = document.getElementById('arena-toast-host');
        if (host) return host;

        host = document.createElement('div');
        host.id = 'arena-toast-host';
        host.className =
            'fixed bottom-4 right-4 z-[10030] flex max-w-[22rem] flex-col gap-3 pointer-events-none';
        document.body.appendChild(host);
        return host;
    }

    function updateBadge(count) {
        const badge = document.getElementById('notif-badge');
        if (!badge) return;

        if (!count) {
            badge.textContent = '0';
            badge.classList.add('hidden');
            return;
        }

        badge.textContent = count > 99 ? '99+' : String(count);
        badge.classList.remove('hidden');
    }

    function updateUnreadCopy(count) {
        const copy = document.getElementById('notif-unread-copy');
        if (!copy) return;

        if (!count) {
            copy.textContent = 'Realtime alerts';
            return;
        }

        copy.textContent = `${count} unread`;
    }

    async function handleNotificationOpen(notification) {
        if (!notification) return;

        if (!notification.isRead) {
            try {
                await NotificationService.markRead(notification._id);
            } catch (error) {
                console.warn('Failed to mark notification as read:', error);
            }
        }

        if (notification.resourceDeleted) {
            window.alert('This content is no longer available.');
            return;
        }

        if (notification.link) {
            NotificationService.openNotificationLink(notification.link);
        }
    }

    function createNotificationItem(notification) {
        const item = document.createElement('div');
        const styles = CATEGORY_STYLES[notification.category] || CATEGORY_STYLES.system;
        const readStateClass = notification.isRead ? 'opacity-60 border-transparent' : '';

        item.className = `notif-item border-l-2 px-4 py-3.5 hover:bg-white/[0.04] transition-colors group ${readStateClass}`;
        item.style.borderLeftColor = notification.isRead ? 'transparent' : styles.border;
        item.dataset.notificationId = notification._id;

        item.innerHTML = `
            <div class="flex items-start gap-3">
                <button type="button" class="notif-open flex-1 min-w-0 text-left">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] ${styles.badge}">
                            ${escapeHtml(formatCategory(notification.category))}
                        </span>
                        ${notification.resourceDeleted ? '<span class="text-[10px] font-bold uppercase tracking-wide text-red-300">Deleted</span>' : ''}
                        ${notification.isRead ? '' : '<span class="h-2 w-2 rounded-full bg-[#00ff87]"></span>'}
                    </div>
                    <p class="mt-2 text-sm font-semibold text-white truncate">${escapeHtml(notification.title)}</p>
                    <p class="mt-1 text-xs leading-5 text-gray-400 line-clamp-2">${escapeHtml(notification.message)}</p>
                    <p class="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500">${escapeHtml(timeAgo(notification.createdAt))}</p>
                </button>
                <div class="flex shrink-0 items-center gap-1">
                    <button type="button" class="notif-delete rounded-lg p-1.5 text-gray-500 opacity-0 transition-all hover:bg-white/10 hover:text-red-300 group-hover:opacity-100" title="Remove notification" aria-label="Remove notification">
                        <span class="text-sm leading-none">&times;</span>
                    </button>
                </div>
            </div>
        `;

        item.querySelector('.notif-open')?.addEventListener('click', () => {
            void handleNotificationOpen(notification);
        });

        item.querySelector('.notif-delete')?.addEventListener('click', async (event) => {
            event.stopPropagation();

            try {
                await NotificationService.deleteOne(notification._id);
            } catch (error) {
                console.error('Unable to delete notification:', error);
            }
        });

        return item;
    }

    function renderNotificationList(notifications) {
        const list = document.getElementById('notif-list');
        const archivedLabel = document.getElementById('notif-archived-label');

        if (!list) return;

        const activeNotifications = notifications.filter((notification) => !notification.archived);
        const unreadCount = activeNotifications.filter((notification) => !notification.isRead).length;

        if (!activeNotifications.length) {
            list.innerHTML = `
                <div id="notif-empty" class="flex flex-col items-center justify-center px-4 py-10 text-center">
                    <p class="text-xs font-bold text-gray-500">All caught up.</p>
                </div>
            `;
        } else {
            list.innerHTML = '';
            activeNotifications.forEach((notification) => {
                list.appendChild(createNotificationItem(notification));
            });
        }

        updateBadge(unreadCount);
        updateUnreadCopy(unreadCount);

        if (archivedLabel) {
            const hasArchived =
                notifications.length > activeNotifications.length ||
                activeNotifications.length >= ARCHIVE_THRESHOLD;
            archivedLabel.classList.toggle('hidden', !hasArchived);
        }
    }

    async function loadNotifications() {
        try {
            currentNotifications = await NotificationService.fetchNotifications(true);
            renderNotificationList(currentNotifications);
        } catch (error) {
            console.warn('Could not load notifications:', error);
            renderNotificationList([]);
        }
    }

    function queueLoadNotifications() {
        if (loadQueued) return;
        loadQueued = true;

        setTimeout(() => {
            loadQueued = false;
            void loadNotifications();
        }, 40);
    }

    function showToast(notification) {
        const host = ensureToastHost();
        const toast = document.createElement('div');
        toast.className =
            'pointer-events-auto overflow-hidden rounded-2xl border border-white/10 bg-[#12141c]/95 shadow-2xl backdrop-blur';

        toast.innerHTML = `
            <div class="p-4">
                <div class="flex items-start gap-3">
                    <div class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#00ff87]"></div>
                    <div class="min-w-0 flex-1">
                        <p class="text-sm font-black text-white">${escapeHtml(notification.title)}</p>
                        <p class="mt-1 text-xs leading-5 text-gray-300">${escapeHtml(notification.message)}</p>
                    </div>
                    <button type="button" class="toast-close rounded-lg p-1 text-gray-500 transition hover:bg-white/10 hover:text-white" aria-label="Dismiss notification">
                        <span class="text-sm leading-none">&times;</span>
                    </button>
                </div>
                <div class="mt-3 flex items-center gap-2">
                    ${notification.link ? '<button type="button" class="toast-open rounded-xl bg-[#00ff87] px-3 py-2 text-[11px] font-black uppercase tracking-wide text-[#0a0b0f] transition hover:bg-[#00e67a]">Open</button>' : ''}
                    <span class="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500">${escapeHtml(formatCategory(notification.category))}</span>
                </div>
            </div>
        `;

        const dismiss = () => {
            toast.classList.add('opacity-0', 'translate-y-2');
            setTimeout(() => toast.remove(), 180);
        };

        toast.querySelector('.toast-close')?.addEventListener('click', dismiss);
        toast.querySelector('.toast-open')?.addEventListener('click', () => {
            dismiss();
            void handleNotificationOpen(notification);
        });

        host.prepend(toast);
        setTimeout(dismiss, 5500);
    }

    function showSystemNotification(notification) {
        if (typeof Notification !== 'function') return;
        if (!document.hidden && document.hasFocus()) return;

        const notify = () => {
            try {
                const systemNotification = new Notification(notification.title, {
                    body: notification.message,
                    tag: notification._id,
                    silent: true,
                });

                systemNotification.onclick = () => {
                    window.focus();
                    void handleNotificationOpen(notification);
                    systemNotification.close();
                };
            } catch (error) {
                console.warn('Desktop notification failed:', error);
            }
        };

        if (Notification.permission === 'granted') {
            notify();
            return;
        }

        if (Notification.permission === 'default') {
            Notification.requestPermission()
                .then((permission) => {
                    if (permission === 'granted') notify();
                })
                .catch((error) => {
                    console.warn('Notification permission request failed:', error);
                });
        }
    }

    function closeDropdown() {
        const dropdown = document.getElementById('notif-dropdown');
        const toggle = document.getElementById('notif-toggle');
        if (!dropdown || !toggle) return;

        dropdown.classList.add('hidden');
        toggle.setAttribute('aria-expanded', 'false');
    }

    function bindStaticActions() {
        const toggle = document.getElementById('notif-toggle');
        const dropdown = document.getElementById('notif-dropdown');
        const markAllButton = document.getElementById('notif-mark-read');
        const clearAllButton = document.getElementById('notif-clear-all');

        if (!toggle || !dropdown) return false;

        toggle.addEventListener('click', (event) => {
            event.stopPropagation();
            const nextOpenState = dropdown.classList.contains('hidden');
            dropdown.classList.toggle('hidden', !nextOpenState);
            toggle.setAttribute('aria-expanded', String(nextOpenState));
            if (nextOpenState) {
                queueLoadNotifications();
            }
        });

        dropdown.addEventListener('click', (event) => {
            event.stopPropagation();
        });

        document.addEventListener('click', (event) => {
            if (!dropdown.contains(event.target) && event.target !== toggle) {
                closeDropdown();
            }
        });

        markAllButton?.addEventListener('click', async () => {
            try {
                await NotificationService.markAllRead();
            } catch (error) {
                console.error('Failed to mark all notifications as read:', error);
            }
        });

        clearAllButton?.addEventListener('click', async () => {
            try {
                await NotificationService.clearAll();
            } catch (error) {
                console.error('Failed to clear notifications:', error);
            }
        });

        return true;
    }

    function handleIncomingNotification(notification) {
        currentNotifications = [notification, ...currentNotifications.filter((entry) => entry._id !== notification._id)];
        renderNotificationList(currentNotifications);
        showToast(notification);
        showSystemNotification(notification);
    }

    function init() {
        if (!bindStaticActions()) return;

        void loadNotifications();
        void NotificationService.connectSocket(handleIncomingNotification);

        window.addEventListener('arena:notifications-updated', () => {
            queueLoadNotifications();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}
