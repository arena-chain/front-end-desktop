const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'src/player/dashboard.html');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    /<!-- Left Sidebar - Game Selection \(Faceit Style\) -->[\s\S]*?<\/aside>/,
    '<div id="left-sidebar-container" class="hidden xl:flex flex-col border-r border-white/5 z-20 h-full w-[104px]"></div>'
);

content = content.replace(
    /<!-- Top Navigation Bar \(Faceit Style\) -->[\s\S]*?<\/header>/,
    '<div id="top-navbar-container" class="w-full"></div>'
);

content = content.replace(
    /<!-- Right Sidebar - Currently Playing & Friends -->[\s\S]*?<\/aside>/,
    '<div id="right-sidebar-container" class="hidden 2xl:flex flex-col border-l border-white/5 h-full w-72"></div>'
);

const loaderScript = `
    <!-- Load Common Components -->
    <script>
        document.addEventListener("DOMContentLoaded", () => {
            const fs = require('fs');
            const path = require('path');
            try {
                const leftNav = fs.readFileSync(path.join(__dirname, 'src/player/components/sidebar.html'), 'utf8');
                const topNav = fs.readFileSync(path.join(__dirname, 'src/player/components/topbar.html'), 'utf8');
                const rightNav = fs.readFileSync(path.join(__dirname, 'src/player/components/right-rail.html'), 'utf8');
                
                document.getElementById('left-sidebar-container').innerHTML = leftNav;
                document.getElementById('top-navbar-container').innerHTML = topNav;
                document.getElementById('right-sidebar-container').innerHTML = rightNav;
                
                // Trigger event so other scripts know navbars are loaded
                document.dispatchEvent(new Event('navbars-loaded'));
            } catch (err) {
                console.error("Failed to load components:", err);
            }
        });
    </script>
`;

if (!content.includes('Load Common Components')) {
    content = content.replace('</body>', loaderScript + '\n</body>');
}

fs.writeFileSync(file, content);
console.log('Successfully updated dashboard.html');
