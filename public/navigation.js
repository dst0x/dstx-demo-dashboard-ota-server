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

        // Browser modern menangani perpindahan melalui CSS View Transitions.
        // Fallback ini memberi fade singkat pada browser yang belum mendukungnya.
        const supportsCrossDocumentTransition = 'onpageswap' in window;
        if (!supportsCrossDocumentTransition) {
            event.preventDefault();
            document.body.classList.add('nav-leaving');
            window.setTimeout(() => window.location.assign(target.href), 120);
        }
    });

    window.addEventListener('pageshow', () => {
        document.body.classList.remove('nav-leaving');
    });
})();
