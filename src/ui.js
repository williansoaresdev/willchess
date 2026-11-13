import { t } from './i18n.js';

/** Create an element from an HTML string. */
export function h(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Generic modal. Resolves with the value passed to close(). */
export function modal(contentEl) {
  return new Promise((resolve) => {
    const back = h('<div class="modal-back"><div class="modal" role="dialog" aria-modal="true"></div></div>');
    back.firstElementChild.appendChild(contentEl);
    const close = (v) => {
      back.classList.add('out');
      setTimeout(() => back.remove(), 200);
      resolve(v);
    };
    contentEl.close = close;
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add('in'));
  });
}

export function confirmBox(text) {
  const el = h(`<div><p class="modal-text">${esc(text)}</p>
    <div class="modal-actions"><button class="btn ghost" data-v="0">${esc(t('no'))}</button>
    <button class="btn primary" data-v="1">${esc(t('yes'))}</button></div></div>`);
  el.querySelectorAll('button').forEach((b) => (b.onclick = () => el.close(b.dataset.v === '1')));
  return modal(el);
}

export const KNIGHT_SVG = `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g fill="none" fill-rule="evenodd" stroke="#2a160a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#d9a066"/><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" fill="#d9a066"/><path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zm5.433-9.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5z" fill="#2a160a"/><path d="M24.55 10.4l-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75S35.75 29.06 35.25 39l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34-2.37-4.49-5.79-6.64-9.19-7.16l-.51-.1z" fill="#efc48c" stroke="none"/></g><polyline points="17.2,26 20.4,37 24.4,29 28.4,37 32,26" fill="none" stroke="#fff" stroke-width="2.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
