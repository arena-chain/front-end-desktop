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
                // Since this script is loaded via <script src="...">, __dirname represents the folder 
                // of the HTML file (e.g. src/player/dashboard). The common components are in ../_common/
                const componentPath = path.join(__dirname, '../_common', file);
                const content = fs.readFileSync(componentPath, 'utf8');
                this.innerHTML = content;
                
                // If we specifically loaded the left sidebar, attach the global navigation listeners
                if (file === 'left_side_navbar.html') {
                    this.attachNavigation();
                }
            } catch (err) {
                console.error('Failed to load component: ' + file, err);
            }
        }
    }

    attachNavigation() {
        // Map of button IDs to their relative destination URL
        // This works perfectly because all player pages are 1-level deep inside src/player/
        const routes = {
            'nav-play': '../dashboard/dashboard.html',
            'nav-news': '../news/news.html',
            'nav-recent-matches': '../recent_games/recent_games.html',
            'nav-matchmaking': '../match/matchmaking.html',
            'nav-streams': '../stream/stream_dashboard.html',
            'nav-chat': '../chat/chat.html',
            'nav-missions': '../missions/missions.html',
            'nav-rewards': '../rewards/rewards.html'
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
