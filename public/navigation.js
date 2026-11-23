(() => {
    const isPlainLeftClick = event => event.button === 0
        && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

    document.addEventListener('click', event => {
        const link = event.target.closest('.mac-dock a[href]');
        if (!link || !isPlainLeftClick(event)) return;

        const target = new URL(link.href, window.location.href);
        if (target.origin !== window.location.origin) return;
        if (target.pathname === window.location.pathname) {
            event.preventDefault();
            return;
        }

        document.querySelectorAll('.mac-dock .dock-item').forEach(item => {
            item.classList.toggle('active', item === link);
            if (item === link) item.setAttribute('aria-current', 'page');
            else item.removeAttribute('aria-current');
        });

        // Biarkan link berpindah langsung. Browser yang mendukung akan memakai
        // CSS View Transitions; browser lain melakukan navigasi normal tanpa delay.
    });

})();
