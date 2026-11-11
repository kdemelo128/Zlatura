/* pointerfx.js -- the New look's pointer feel: tiles and cards lift a little and carry a soft highlight that follows
 * the pointer. One pointermove handler sets two CSS variables on the element under the pointer; the look itself is
 * CSS (styles.css, "pointer feel"), so there is no layout work and an edit stays well inside its 150 ms budget.
 * Off with the system's reduce-motion setting, with the Motion switch (Settings), on a touch screen and in Classic. */

const SEL = '.pipe-card, .cont-row, .tile-link, .wsp-toolbtn, .contact-row';
const on = () => {
  const d = document.documentElement.dataset;
  return d.look === 'new' && d.motion !== 'off' && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
};

export function initPointerFx() {
  let raf = 0, ev = null;
  const paint = () => {
    raf = 0;
    const t = ev && ev.target.closest ? ev.target.closest(SEL) : null;
    if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', `${Math.round(ev.clientX - r.left)}px`);
    t.style.setProperty('--my', `${Math.round(ev.clientY - r.top)}px`);
  };
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || !on()) return;
    ev = e;
    if (!raf) raf = requestAnimationFrame(paint);
  }, { passive: true });
}
