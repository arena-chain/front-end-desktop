const fs = require('fs');
const path = require('path');
const {
    href,
    isDashboardPage,
    resolveActiveSidebarNavId,
    resolveComponentFilename,
} = require('./nav-config');
const { initTopbarChrome } = require('./topbar-init');
const { initSidebarChrome } = require('./sidebar-chrome');

const COMPONENTS_DIR = __dirname;

function readComponentHtml(filename) {
    const componentPath = path.join(COMPONENTS_DIR, filename);
    const content = fs.readFileSync(componentPath, 'utf8');
    return content.replace(/<script[\s\S]*?<\/script>/gi, '');
}

function wireTopNavAnchors() {
    const league = document.getElementById('nav-league-standings');
    if (league) {
        league.setAttribute('href', `${href('dashboard')}#league`);
        league.addEventListener('click', (e) => {
            if (isDashboardPage()) {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('arena-shell-league-tab', { bubbles: true }));
            }
        });
    }

    const ev = document.getElementById('nav-page-events');
    if (ev) ev.setAttribute('href', href('events'));

    const rw = document.getElementById('nav-rewards');
    if (rw) rw.setAttribute('href', href('rewards'));

    const mk = document.getElementById('nav-page-market');
    if (mk) mk.setAttribute('href', href('market'));

    const chat = document.getElementById('nav-chat-link');
    if (chat) chat.setAttribute('href', href('chat'));
}

function navigateIfDifferent(targetHref) {
    const cur = window.location.href.split('#')[0];
    const next = String(targetHref).split('#')[0];
    if (cur !== next) window.location.href = targetHref;
}

function attachSidebarNavigation() {
    const routes = {
        'nav-play': () => href('dashboard'),
        'nav-matchmaking': () => href('matchmaking'),
        'nav-channel': () => href('channel'),
        'nav-streams': () => href('streams'),
        'nav-duel': () => href('duel'),
    };

    const allNavBtns = document.querySelectorAll('.sidebar-menu-btn.nav-menu-btn');

    function clearActive() {
        allNavBtns.forEach((b) => {
            b.classList.remove('active');
            b.classList.add('text-gray-400');
            b.classList.remove('text-white');
        });
    }

    function setActive(id) {
        clearActive();
        const btn = document.getElementById(id);
        if (btn) {
            btn.classList.add('active');
            btn.classList.remove('text-gray-400');
        }
    }

    setActive(resolveActiveSidebarNavId());

    for (const [id, getTarget] of Object.entries(routes)) {
        const btn = document.getElementById(id);
        if (!btn) continue;

        btn.addEventListener('click', () => {
            setActive(id);
            const target = getTarget();
            if (id === 'nav-play' && isDashboardPage()) {
                window.dispatchEvent(new CustomEvent('arena-shell-nav-play', { bubbles: true }));
                return;
            }
            navigateIfDifferent(target);
        });
    }

    const profileLink = document.getElementById('nav-profile-link');
    if (profileLink) {
        profileLink.setAttribute('href', href('profile'));
    }
}

class CommonNavbar extends HTMLElement {
    connectedCallback() {
        const raw = this.getAttribute('src');
        if (!raw) return;

        const filename = resolveComponentFilename(raw);
        if (!filename || !filename.endsWith('.html')) {
            console.error('[shell-loader] invalid component src:', raw);
            return;
        }

        try {
            const htmlOnly = readComponentHtml(filename);
            this.innerHTML = htmlOnly;

            if (filename === 'sidebar.html') {
                attachSidebarNavigation();
                try {
                    require(path.join(__dirname, '..', '_common', 'sidebarProfileInit.js')).initSidebarProfile();
                } catch (e) {
                    console.error('sidebarProfileInit failed', e);
                }
                try {
                    const apiPath = path.join(__dirname, '..', '..', '..', 'shared', 'api');
                    const { getAccessToken } = require(apiPath);
                    if (getAccessToken()) {
                        const { connectPresence } = require(path.join(__dirname, '..', '..', '..', 'shared', 'presence'));
                        connectPresence().catch((err) => console.warn('[Presence] bg connect failed:', err.message || err));
                    }
                } catch (e) {
                    console.warn('[Presence] Could not start presence from sidebar:', e.message || e);
                }
                initSidebarChrome();
            }

            if (filename === 'topbar.html') {
                wireTopNavAnchors();
                initTopbarChrome();
            }

            if (filename === 'right-rail.html') {
                const chat = document.getElementById('nav-chat-link');
                if (chat) chat.setAttribute('href', href('chat'));
                require(path.join(__dirname, '..', '_common', 'rightSidebarInit.js'));
            }
        } catch (err) {
            console.error('Failed to load component:', filename, err);
        }
    }
}

if (!customElements.get('common-navbar')) {
    customElements.define('common-navbar', CommonNavbar);
}

module.exports = { CommonNavbar };
