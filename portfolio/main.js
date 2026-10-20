// The page and its native disclosures remain usable without JavaScript.
const navigation = [...document.querySelectorAll('.main-nav a')];
const sections = [document.querySelector('.hero'), ...navigation.map(link => document.querySelector(link.hash))];

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const link of navigation) {
        if (link.hash === `#${entry.target.id}`) {
          link.setAttribute('aria-current', 'location');
        } else {
          link.removeAttribute('aria-current');
        }
      }
    }
  }, { rootMargin: '-20% 0px -55% 0px' });

  sections.forEach(section => observer.observe(section));
  window.addEventListener('pagehide', () => observer.disconnect());
  window.addEventListener('pageshow', event => {
    if (event.persisted) sections.forEach(section => observer.observe(section));
  });
}
