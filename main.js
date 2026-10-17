document.addEventListener('DOMContentLoaded', () => {
    const menuToggle = document.getElementById('menu-toggle');
    const mobileMenu = document.getElementById('mobile-menu');
    const iconMenu = document.getElementById('icon-menu');
    const iconClose = document.getElementById('icon-close');

    if (menuToggle && mobileMenu) {
        menuToggle.addEventListener('click', () => {
            const isOpen = mobileMenu.classList.toggle('hidden') === false;
            menuToggle.setAttribute('aria-expanded', String(isOpen));
            iconMenu.classList.toggle('hidden', isOpen);
            iconClose.classList.toggle('hidden', !isOpen);
        });

        mobileMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.add('hidden');
                menuToggle.setAttribute('aria-expanded', 'false');
                iconMenu.classList.remove('hidden');
                iconClose.classList.add('hidden');
            });
        });
    }

    // Carry the landing's UTM to the sign-up, so attribution survives blocked cookies.
    const utm = new URLSearchParams(
        [...new URLSearchParams(window.location.search)].filter(([key]) => key.startsWith('utm_'))
    );
    if (utm.toString()) {
        document.querySelectorAll('a[href^="https://app.kozy.com.br/auth/sign-up"]').forEach(link => {
            const url = new URL(link.href);
            utm.forEach((value, key) => url.searchParams.set(key, value));
            link.href = url.toString();
        });
    }

    const header = document.querySelector('header');
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const currentScroll = window.scrollY;
        if (currentScroll > 100) {
            header.classList.add('shadow-md');
        } else {
            header.classList.remove('shadow-md');
        }
        lastScroll = currentScroll;
    }, { passive: true });
});
