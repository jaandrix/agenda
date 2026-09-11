        function keepApuntesWindowInViewport() {
            const w = document.getElementById('apuntesWindow');
            if (!w || !w.classList.contains('maximized')) return;
            w.style.left = '12px';
            w.style.top = '12px';
            w.style.right = '12px';
            w.style.bottom = '12px';
            w.style.width = 'auto';
            w.style.height = 'auto';
        }
        window.addEventListener('resize', keepApuntesWindowInViewport);
