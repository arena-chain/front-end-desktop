const fs = require('fs');
const path = require('path');

class CommonNavbar extends HTMLElement {
    constructor() {
        super();
    }
    
    connectedCallback() {
        const file = this.getAttribute('src');
        if (file) {
            try {
                const commonDir = path.join(__dirname, '../_common');
                const componentPath = path.join(commonDir, file);
                const content = fs.readFileSync(componentPath, 'utf8');

                const htmlOnly = content.replace(/<script[\s\S]*?<\/script>/gi, '');
                this.innerHTML = htmlOnly;

                if (file === 'left_side_navbar.html') {
                    this.attachNavigation();
                }

                if (file === 'right_navbar.html') {
                    require(path.join(commonDir, 'rightSidebarInit.js'));
                }
            } catch (err) {
                console.error('Failed to load component: ' + file, err);
            }
        }
    }

    attachNavigation() {
        const routes = {
            'nav-play': '../dashboard/dashboard.html',
            'nav-matchmaking': '../match/matchmaking.html',
            'nav-channel': '../channel/channel_dashboard.html',
            'nav-streams': '../stream/stream_dashboard.html',
        };

        const pageToNav = {
            'dashboard': 'nav-play',
            'match': 'nav-matchmaking',
            'matchmaking': 'nav-matchmaking',
            'channel': 'nav-channel',
            'channel_dashboard': 'nav-channel',
            'stream': 'nav-streams',
            'stream_dashboard': 'nav-streams',
            'stream_studio': 'nav-streams',
            'missions': 'nav-play',
            'news': 'nav-play',
            'freinds': 'nav-play',
            'friends': 'nav-play',
            'recent_games': 'nav-play',
            'profile': 'nav-play',
            'training': 'nav-play',
            'chat': 'nav-play',
            'chat_detail': 'nav-play',
            'rewards': 'nav-play',
        };

        const allNavBtns = document.querySelectorAll('.sidebar-menu-btn.nav-menu-btn');

        function clearActive() {
            allNavBtns.forEach(b => {
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

        const currentPath = window.location.pathname.replace(/\\/g, '/');
        const segments = currentPath.split('/').filter(Boolean);
        const pageFolder = segments.length >= 2 ? segments[segments.length - 2] : '';
        const activeId = pageToNav[pageFolder] || 'nav-play';
        setActive(activeId);

        for (const [id, navPath] of Object.entries(routes)) {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', () => {
                    setActive(id);
                    window.location.href = navPath;
                });
            }
        }
    }
}

// Register the custom element
customElements.define('common-navbar', CommonNavbar);
