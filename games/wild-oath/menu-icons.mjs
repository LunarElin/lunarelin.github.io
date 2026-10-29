// Original pictograms. The visible shape is decorative; its control owns the accessible name.
const paths = {
  home: '<path d="m3 11 9-8 9 8M6 10v10h12V10M10 20v-6h4v6"/>',
  menu: '<path d="M5 6h14M5 12h14M5 18h14"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 4h.01"/>',
  sound: '<path d="M3 9h4l5-4v14l-5-4H3zM16 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
  muted: '<path d="M3 9h4l5-4v14l-5-4H3zM16 9l6 6m0-6-6 6"/>',
  pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor"/>',
  play: '<path d="m7 4 14 8L7 20z" fill="currentColor"/>',
  deck: '<path d="M7 3h12v16H7zM4 6v16h12"/><path d="m13 7 3 4-3 4-3-4z" fill="currentColor"/>',
  chest: '<path d="M3 10h18v11H3zM3 10V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v3M3 13h18M10 11h4v5h-4z"/>',
  shop: '<path d="M4 10v11h16V10M2 10l3-7h14l3 7c-2 3-4 1-5 0-2 3-4 1-5 0-2 3-4 1-5 0-2 3-4 1-5 0ZM10 21v-7h5v7"/>',
  merge: '<path d="M3 4h7v10H3zM14 4h7v10h-7zM7 17l5 5 5-5M12 21v-9"/>',
  chart: '<path d="M3 3v18h18M7 16v-4m5 4V6m5 10v-7"/>',
  book: '<path d="M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-4-2-7-1-10 1Zm0 0v16M6 8l3 1m-3 4 3 1m6-5 3-1m-3 6 3-1"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  restart: '<path d="M4 10a8 8 0 1 1 1 8M4 3v7h7"/>',
  back: '<path d="m14 4-8 8 8 8M7 12h15"/>',
  next: '<path d="m10 4 8 8-8 8M17 12H2"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="m12 6 4 6-4 6-4-6z" fill="currentColor"/>',
  heart: '<path d="M12 21 3 12C-3 5 7-2 12 6c5-8 15-1 9 6Z" fill="currentColor"/>',
  energy: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="currentColor"/>',
  drain: '<path d="m9 2 2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path d="M12 20h10m-4-4 4 4-4 3"/>',
  attack: '<path d="m6 19 13-13 2-4-5 1L3 16m1-4 8 8M3 21l3-3"/>',
  defense: '<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6ZM12 6v11"/>',
  heal: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="currentColor"/>',
  support: '<path d="M12 21V9M12 14C3 14 2 7 3 3c7 0 10 4 9 11Zm0 3C12 8 19 7 22 8c0 6-4 9-10 9Z"/>',
  form: '<ellipse cx="12" cy="16" rx="6" ry="5"/><ellipse cx="4" cy="9" rx="2" ry="3" fill="currentColor"/><ellipse cx="9" cy="5" rx="2" ry="3" fill="currentColor"/><ellipse cx="15" cy="5" rx="2" ry="3" fill="currentColor"/><ellipse cx="20" cy="9" rx="2" ry="3" fill="currentColor"/>',
  top: '<path d="M4 3h16M12 20V7m-6 6 6-6 6 6"/>',
  bottom: '<path d="M4 21h16M12 4v13m-6-6 6 6 6-6"/>',
  shuffle: '<path d="M3 6h3l12 12h4m-4-4 4 4-4 4M3 18h3l4-4m4-4 4-4h4m-4-4 4 4-4 4"/>',
  remove: '<path d="M4 12h16"/>',
  sell: '<path d="M2 12 12 2h8v8L10 20ZM16 6h.01M14 19l4 3 4-6"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  eye: '<path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  speed: '<path d="m3 5 8 7-8 7zm10 0 8 7-8 7z" fill="currentColor"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 7 7"/>',
  poison: '<path d="M12 2s8 9 8 14a8 8 0 0 1-16 0c0-5 8-14 8-14Z"/><path d="m8 13 2 2m6-2-2 2m-4 3h4"/>',
  burn: '<path d="M12 2c3 6 0 6 2 9 1-1 3-2 3-5 7 7 5 16-5 16S0 13 6 7c0 4 2 5 3 5 2-3-1-5 3-10Z" fill="currentColor"/>',
  shock: '<path d="m14 2-9 12h6l-1 8 9-12h-6z" fill="currentColor"/>',
  focus: '<circle cx="12" cy="12" r="6"/><path d="M12 1v6m0 10v6M1 12h6m10 0h6"/>',
  combo: '<path d="m3 6 4-4m3 7 5-5m3 9 4-4M3 14l7 7 11-11M4 9l6 6"/>',
  pierce: '<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6M4 20 21 3m-6 0h6v6"/>',
  charge: '<path d="M4 5h11v16H4zM9 2h11v15M7 13h5m-2-3 3 3-3 3"/>',
  counter: '<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6M18 10h-8m3-4-4 4 4 4"/>',
  fire: '<path d="M12 2c3 6 0 6 2 9 1-1 3-2 3-5 7 7 5 16-5 16S0 13 6 7c0 4 2 5 3 5 2-3-1-5 3-10Z" fill="currentColor"/>',
};

export function icon(name, extraClass = '') {
  return `<svg class="menu-icon${extraClass ? ` ${extraClass}` : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.help}</svg>`;
}

// Call after a menu render. Existing nodes (including counters/listeners) stay in place.
export function decorateMenus(root = document) {
  for (const control of root.querySelectorAll('[data-ui-icon]')) {
    const name = control.id === 'sound' ? (control.getAttribute('aria-pressed') === 'true' ? 'sound' : 'muted') : control.dataset.uiIcon;
    const previous = control.querySelector(':scope > .menu-icon');
    if (previous?.dataset.iconName !== name) {
      previous?.remove();
      const template = document.createElement('template');
      template.innerHTML = icon(name);
      const svg = template.content.firstElementChild;
      svg.dataset.iconName = name;
      control.prepend(svg);
    }
    control.classList.add('icon-control');
    if (control.hasAttribute('data-icon-only')) {
      control.classList.add('icon-only-control');
      for (const child of [...control.childNodes]) {
        if (child.nodeType !== 3 || !child.textContent.trim()) continue;
        const label = document.createElement('span');
        label.className = 'menu-label';
        label.textContent = child.textContent;
        child.replaceWith(label);
      }
    }
    if (control.getAttribute('aria-label')) control.title = control.getAttribute('aria-label');
  }
}
