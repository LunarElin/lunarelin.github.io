// The page and its native disclosures remain usable without JavaScript.
const navigation = [...document.querySelectorAll('.main-nav a')];
const sections = navigation.map(link => ({
  link,
  section: document.getElementById(link.hash.slice(1)),
})).filter(entry => entry.section);
const header = document.querySelector('.site-header');
let activeLink;
let frame = 0;
let listening = false;

function updateNavigation() {
  frame = 0;
  const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const boundary = Math.max(header?.getBoundingClientRect().bottom || 0, padding) + 1;
  const positions = sections.map(entry => ({ ...entry, top: entry.section.getBoundingClientRect().top }))
    .sort((a, b) => a.top - b.top);
  let current = null;
  for (const entry of positions) {
    if (entry.top <= boundary) current = entry.link;
  }
  if (current === activeLink) return;
  activeLink = current;
  for (const link of navigation) {
    if (link === current) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}

function queueUpdate() {
  if (listening && !frame) frame = requestAnimationFrame(updateNavigation);
}

function onAnchorClick(event) {
  if (event.target instanceof Element && event.target.closest('a[href^="#"]')) queueUpdate();
}

function startNavigation() {
  if (listening) return;
  listening = true;
  window.addEventListener('scroll', queueUpdate, { passive: true });
  window.addEventListener('resize', queueUpdate);
  window.addEventListener('hashchange', queueUpdate);
  window.addEventListener('load', queueUpdate);
  document.addEventListener('click', onAnchorClick);
  document.addEventListener('toggle', queueUpdate, true);
  queueUpdate();
}

function stopNavigation() {
  listening = false;
  cancelAnimationFrame(frame);
  frame = 0;
  window.removeEventListener('scroll', queueUpdate);
  window.removeEventListener('resize', queueUpdate);
  window.removeEventListener('hashchange', queueUpdate);
  window.removeEventListener('load', queueUpdate);
  document.removeEventListener('click', onAnchorClick);
  document.removeEventListener('toggle', queueUpdate, true);
}

window.addEventListener('pagehide', stopNavigation);
window.addEventListener('pageshow', startNavigation);
startNavigation();
