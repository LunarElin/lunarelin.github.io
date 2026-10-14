const titles = ['게임 클라이언트 개발', '성능과 안정성 개선', '클라이언트 아키텍처'];
const dialog = document.querySelector('#project-dialog');
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-filter]').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
  document.querySelectorAll('[data-type]').forEach(card => { card.hidden = button.dataset.filter !== 'all' && card.dataset.type !== button.dataset.filter; });
}));
document.querySelectorAll('[data-project]').forEach(button => button.addEventListener('click', () => { document.querySelector('#dialog-title').textContent = titles[Number(button.dataset.project)]; dialog.showModal(); }));
document.querySelector('.close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
