'use strict';

if (!window.NotificationService) {
    const nodeRequire = typeof require === 'function' ? require : null;
    let sharedApi = null;

    try {
        sharedApi = nodeRequire ? nodeRequire('../../../shared/api') : null;
    } catch (error) {
        console.warn('NotificationService: shared/api unavailable, using local fallbacks.', error);
    }

    const API_URL = (() => {
        if (sharedApi && typeof sharedApi.BASE_URL === 'string' && sharedApi.BASE_URL) {
            return sharedApi.BASE_URL;
        }

        const storedBaseUrl = localStorage.getItem('arena_base_url') || 'http://localhost:3000';
        return storedBaseUrl.replace(/\/api\/?$/, '').replace(/\/$/, '') + '/api';
    })();

    const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');
    const POLL_INTERVAL_MS = 20000;

    let socket = null;
    let pollTimer = null;
    let socketScriptPromise = null;
    let transportMode = 'idle';
    let latestSnapshot = [];
    const seenIds = new Set();
    const realtimeListeners = new Set();

    function getAccessToken() {
        if (sharedApi && typeof sharedApi.getAccessToken === 'function') {
            const token = sharedApi.getAccessToken();
            if (token) return token;
        }

        return (
            localStorage.getItem('arena_access_token') ||
            localStorage.getItem('token') ||
            ''
        );
    }

    function authHeaders(extraHeaders = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...extraHeaders,
        };

        const token = getAccessToken();
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        return headers;
    }

    async function parseJsonSafely(response) {
        const text = await response.text();
        if (!text) return null;

        try {
            return JSON.parse(text);
        } catch {
            return text;
        }
    }

    async function request(path, options = {}) {
        const response = await fetch(`${API_URL}${path}`, {
            ...options,
            headers: authHeaders(options.headers),
        });

        if (!response.ok) {
            const errorBody = await parseJsonSafely(response);
            const message =
                (errorBody && typeof errorBody === 'object' && errorBody.message) ||
                `Request failed (${response.status})`;
            throw new Error(message);
        }

        if (response.status === 204) {
            return null;
        }

        return parseJsonSafely(response);
    }

    function dispatchUpdate(reason, detail = {}) {
        window.dispatchEvent(
            new CustomEvent('arena:notifications-updated', {
                detail: { reason, ...detail },
            }),
        );
    }

    function dispatchRealtime(notification, source) {
        window.dispatchEvent(
            new CustomEvent('arena:notification-received', {
                detail: { notification, source },
            }),
        );
        dispatchUpdate('realtime', { notification, source });
    }

    function rememberNotifications(notifications) {
        notifications.forEach((notification) => {
            if (notification && notification._id) {
                seenIds.add(notification._id);
            }
        });
    }

    function getRelativeRoute(relativePath, search = '') {
        return search ? `${relativePath}${search}` : relativePath;
    }

    function resolveDesktopLink(link) {
        if (!link) return '';
        if (/^(?:\.\.?\/|[a-z]:\\|file:)/i.test(link) || /\.html(?:[?#].*)?$/i.test(link)) {
            return link;
        }

        let parsed;

        try {
            parsed = new URL(link, 'http://arena.local');
        } catch {
            return link;
        }

        const isExternal = /^https?:/i.test(link) && parsed.origin !== 'http://arena.local';
        if (isExternal) {
            return link;
        }

        const pathname = parsed.pathname.toLowerCase().replace(/\/+$/, '') || '/';
        const search = parsed.search || '';
        const segments = pathname.split('/').filter(Boolean);
        const lastSegment = segments[segments.length - 1] || '';

        if (
            pathname.includes('/settings/notifications') ||
            pathname.includes('/notification-settings')
        ) {
            return getRelativeRoute('../profile/notifications_settings.html', search);
        }

        if (pathname.includes('/notifications') || pathname.includes('/alerts')) {
            return getRelativeRoute('../profile/notifications_history.html', search);
        }

        if (pathname.includes('/profile')) {
            const params = new URLSearchParams(search);
            if (lastSegment && lastSegment !== 'profile') {
                params.set('userId', lastSegment);
            }
            const query = params.toString();
            return getRelativeRoute('../profile/profile.html', query ? `?${query}` : '');
        }

        if (pathname.includes('/friends')) {
            return getRelativeRoute('../freinds/freinds.html', search);
        }

        if (pathname.includes('/recent-games') || pathname.includes('/recent_games')) {
            return getRelativeRoute('../recent_games/recent_games.html', search);
        }

        if (
            pathname.includes('/matchmaking') ||
            pathname.includes('/matches') ||
            pathname.includes('/queue')
        ) {
            return getRelativeRoute('../match/matchmaking.html', search);
        }

        if (pathname.includes('/missions')) {
            return getRelativeRoute('../missions/missions.html', search);
        }

        if (pathname.includes('/events')) {
            return getRelativeRoute('../events/events.html', search);
        }

        if (pathname.includes('/rewards')) {
            return getRelativeRoute('../rewards/rewards.html', search);
        }

        if (
            pathname.includes('/marketplace') ||
            pathname.includes('/market') ||
            pathname.includes('/trading')
        ) {
            return getRelativeRoute('../market/market.html', search);
        }

        if (pathname.includes('/news')) {
            return getRelativeRoute('../news/news.html', search);
        }

        if (pathname.includes('/channel')) {
            return getRelativeRoute('../channel/channel_dashboard.html', search);
        }

        if (pathname.includes('/stream')) {
            return getRelativeRoute('../stream/stream_dashboard.html', search);
        }

        if (pathname.includes('/tournament')) {
            return getRelativeRoute('../tournemets/tournements.html', search);
        }

        if (pathname === '/' || pathname.includes('/dashboard')) {
            return getRelativeRoute('../dashboard/dashboard.html', search);
        }

        return link;
    }

    function normalizeNotification(notification) {
        if (!notification || typeof notification !== 'object') return null;

        return {
            ...notification,
            title: notification.title || 'Arena Chain',
            message: notification.message || '',
            category: notification.category || 'system',
            type: notification.type || 'system',
            isRead: Boolean(notification.isRead),
            archived: Boolean(notification.archived),
            resourceDeleted: Boolean(notification.resourceDeleted),
            link: resolveDesktopLink(notification.link || ''),
        };
    }

    function sortNotifications(notifications) {
        return [...notifications].sort((left, right) => {
            const rightTime = new Date(right.createdAt || 0).getTime();
            const leftTime = new Date(left.createdAt || 0).getTime();
            return rightTime - leftTime;
        });
    }

    async function fetchNotifications(includeArchived = false) {
        const query = includeArchived ? '?archived=true' : '';
        const data = await request(`/notifications${query}`);
        const notifications = Array.isArray(data)
            ? data.map(normalizeNotification).filter(Boolean)
            : [];

        latestSnapshot = sortNotifications(notifications);
        rememberNotifications(latestSnapshot);
        return latestSnapshot;
    }

    async function fetchNotificationsWithoutEmitting(includeArchived = true) {
        const query = includeArchived ? '?archived=true' : '';
        const data = await request(`/notifications${query}`);
        const notifications = Array.isArray(data)
            ? data.map(normalizeNotification).filter(Boolean)
            : [];
        return sortNotifications(notifications);
    }

    async function getUnreadCount() {
        const data = await request('/notifications/unread-count');

        if (typeof data === 'number') {
            return data;
        }

        if (data && typeof data === 'object') {
            if (typeof data.count === 'number') return data.count;
            if (typeof data.unreadCount === 'number') return data.unreadCount;
        }

        const notifications = latestSnapshot.length ? latestSnapshot : await fetchNotifications();
        return notifications.filter((notification) => !notification.isRead && !notification.archived)
            .length;
    }

    async function markRead(id) {
        await request(`/notifications/${id}/read`, { method: 'PATCH' });
        latestSnapshot = latestSnapshot.map((notification) =>
            notification._id === id ? { ...notification, isRead: true } : notification,
        );
        dispatchUpdate('mark-read', { id });
    }

    async function markAllRead() {
        await request('/notifications/read-all', { method: 'PATCH' });
        latestSnapshot = latestSnapshot.map((notification) => ({ ...notification, isRead: true }));
        dispatchUpdate('mark-all-read');
    }

    async function deleteOne(id) {
        await request(`/notifications/${id}`, { method: 'DELETE' });
        latestSnapshot = latestSnapshot.filter((notification) => notification._id !== id);
        dispatchUpdate('delete-one', { id });
    }

    async function clearAll() {
        await request('/notifications/clear-all', { method: 'DELETE' });
        latestSnapshot = [];
        dispatchUpdate('clear-all');
    }

    async function getPreferences() {
        return request('/notifications/preferences');
    }

    async function savePreferences(preferences) {
        const savedPreferences = await request('/notifications/preferences', {
            method: 'PATCH',
            body: JSON.stringify(preferences),
        });
        dispatchUpdate('preferences-saved');
        return savedPreferences;
    }

    async function registerDeviceToken(token, platform = 'fcm') {
        return request('/notifications/device-token', {
            method: 'POST',
            body: JSON.stringify({ token, platform }),
        });
    }

    async function ensureSocketClient() {
        if (typeof window.io === 'function') {
            return window.io;
        }

        if (socketScriptPromise) {
            return socketScriptPromise;
        }

        socketScriptPromise = new Promise((resolve, reject) => {
            const existingScript = document.querySelector('script[data-arena-socket-client="true"]');
            if (existingScript) {
                existingScript.addEventListener('load', () => resolve(window.io));
                existingScript.addEventListener('error', reject);
                return;
            }

            const script = document.createElement('script');
            script.src = `${SOCKET_URL}/socket.io/socket.io.js`;
            script.async = true;
            script.dataset.arenaSocketClient = 'true';
            script.onload = () => {
                if (typeof window.io === 'function') {
                    resolve(window.io);
                    return;
                }
                reject(new Error('socket.io client did not load correctly.'));
            };
            script.onerror = () => reject(new Error('Unable to load socket.io client script.'));
            document.head.appendChild(script);
        });

        return socketScriptPromise;
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    async function pollNotifications() {
        try {
            const notifications = await fetchNotificationsWithoutEmitting(true);
            const freshNotifications = notifications.filter(
                (notification) => notification && notification._id && !seenIds.has(notification._id),
            );

            latestSnapshot = notifications;

            if (!freshNotifications.length) {
                rememberNotifications(notifications);
                return notifications;
            }

            freshNotifications
                .sort(
                    (left, right) =>
                        new Date(left.createdAt || 0).getTime() -
                        new Date(right.createdAt || 0).getTime(),
                )
                .forEach((notification) => {
                    seenIds.add(notification._id);
                    dispatchRealtime(notification, 'polling');
                    realtimeListeners.forEach((listener) => listener(notification, 'polling'));
                });

            rememberNotifications(notifications);
            return notifications;
        } catch (error) {
            console.warn('Notification polling failed:', error);
            throw error;
        }
    }

    async function startPolling() {
        if (pollTimer) return;

        transportMode = 'polling';
        window.dispatchEvent(
            new CustomEvent('arena:notification-transport', {
                detail: { mode: transportMode },
            }),
        );

        try {
            await pollNotifications();
        } catch {
            // The periodic polling timer below will retry.
        }

        pollTimer = setInterval(() => {
            void pollNotifications();
        }, POLL_INTERVAL_MS);
    }

    function disconnectSocket() {
        stopPolling();

        if (socket) {
            socket.disconnect();
            socket = null;
        }

        transportMode = 'idle';
    }

    async function connectSocket(onNewNotification) {
        if (typeof onNewNotification === 'function') {
            realtimeListeners.add(onNewNotification);
        }

        const token = getAccessToken();
        if (!token) {
            transportMode = 'disabled';
            return { mode: transportMode };
        }

        if (socket) {
            return { mode: transportMode };
        }

        try {
            if (!latestSnapshot.length) {
                latestSnapshot = await fetchNotificationsWithoutEmitting(true);
                rememberNotifications(latestSnapshot);
            }

            const ioFactory = await ensureSocketClient();
            socket = ioFactory(`${SOCKET_URL}/notifications`, {
                auth: { token },
                transports: ['websocket', 'polling'],
            });

            socket.on('connect', () => {
                transportMode = 'socket';
                stopPolling();
                window.dispatchEvent(
                    new CustomEvent('arena:notification-transport', {
                        detail: { mode: transportMode },
                    }),
                );
            });

            socket.on('connect_error', (error) => {
                console.warn('Notification socket connection failed, falling back to polling.', error);
                void startPolling();
            });

            socket.on('disconnect', () => {
                void startPolling();
            });

            socket.on('notification:new', (notification) => {
                const normalized = normalizeNotification(notification);
                if (!normalized || !normalized._id || seenIds.has(normalized._id)) {
                    return;
                }

                seenIds.add(normalized._id);
                latestSnapshot = sortNotifications([normalized, ...latestSnapshot]);
                dispatchRealtime(normalized, 'socket');
                realtimeListeners.forEach((listener) => listener(normalized, 'socket'));
            });

            return { mode: 'socket' };
        } catch (error) {
            console.warn('Notification socket unavailable, using polling.', error);
            await startPolling();
            return { mode: 'polling' };
        }
    }

    function getTransportMode() {
        return transportMode;
    }

    function getSnapshot() {
        return [...latestSnapshot];
    }

    function openNotificationLink(link) {
        const resolvedLink = resolveDesktopLink(link);
        if (!resolvedLink) return;
        window.location.href = resolvedLink;
    }

    window.NotificationService = {
        API_URL,
        SOCKET_URL,
        fetchNotifications,
        getUnreadCount,
        markRead,
        markAllRead,
        deleteOne,
        clearAll,
        getPreferences,
        savePreferences,
        registerDeviceToken,
        connectSocket,
        disconnectSocket,
        resolveDesktopLink,
        openNotificationLink,
        getTransportMode,
        getSnapshot,
    };

    if (typeof module !== 'undefined') {
        module.exports = window.NotificationService;
    }
}
