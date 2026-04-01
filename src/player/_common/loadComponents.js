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

        for (const [id, path] of Object.entries(routes)) {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', () => {
                    window.location.href = path;
                });
            }
        }
    }
}

// Register the custom element
customElements.define('common-navbar', CommonNavbar);
