const { ipcRenderer } = require('electron');

// Enhanced Mouse Tracking for Parallax Effect
document.addEventListener('mousemove', (e) => {
    const cards = document.querySelectorAll('.glass-panel-hover');
    cards.forEach(card => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = (y - centerY) / 30;
        const rotateY = (centerX - x) / 30;

        if (x > 0 && x < rect.width && y > 0 && y < rect.height) {
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-2px)`;
        } else {
            card.style.transform = '';
        }
    });
});

// Smooth number counting animation
function animateNumber(element, target, duration = 1000) {
    const start = 0;
    const increment = target / (duration / 16);
    let current = start;

    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            element.textContent = target;
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(current);
        }
    }, 16);
}

// Handle logout button click
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        ipcRenderer.send('navigate-to', 'login');
    });
}

// Animate stats on page load
setTimeout(() => {
    const statNumbers = document.querySelectorAll('[data-stat-number]');
    statNumbers.forEach(el => {
        const target = parseInt(el.getAttribute('data-stat-number'));
        animateNumber(el, target, 1500);
    });
}, 300);
