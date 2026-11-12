/* Clarity pass: one small "what this does" bubble for anything under the tool library that carries a data-hint (the tool cards
 * and the analyst / advanced tabs). Mouse hover and keyboard focus show it; on touch a tap shows it for a few seconds while the
 * tap still does its normal action. The bubble only fades (opacity, 150 ms) and is off under reduced motion. */
(()=>{'use strict';
const bubble=document.createElement('div');bubble.id='uwHint';bubble.setAttribute('role','tooltip');bubble.hidden=true;document.body.append(bubble);
let cur=null,timer=0,frame=0;
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.dataset.motion==='off';
function place(el){const r=el.getBoundingClientRect(),w=Math.min(300,innerWidth-24);bubble.style.width=w+'px';const h=bubble.offsetHeight;let x=Math.max(12,Math.min(r.left,innerWidth-w-12)),y=r.bottom+8;if(y+h>innerHeight-8)y=Math.max(8,r.top-h-8);bubble.style.left=x+'px';bubble.style.top=y+'px';}
function show(el,ms){const text=el.dataset.hint;if(!text)return;clearTimeout(timer);cancelAnimationFrame(frame);if(cur&&cur!==el)cur.removeAttribute('aria-describedby');cur=el;bubble.textContent=text;bubble.hidden=false;place(el);el.setAttribute('aria-describedby','uwHint');if(reduced())bubble.classList.add('on');else frame=requestAnimationFrame(()=>bubble.classList.add('on'));if(ms)timer=setTimeout(hide,ms);}
function hide(){clearTimeout(timer);cancelAnimationFrame(frame);bubble.classList.remove('on');bubble.hidden=true;if(cur)cur.removeAttribute('aria-describedby');cur=null;}
const target=e=>e.target.closest?.('.tool-library [data-hint]');
document.addEventListener('pointerover',e=>{if(e.pointerType==='touch')return;const t=target(e);if(t)show(t);else if(cur&&!e.target.closest?.('#uwHint'))hide();});
document.addEventListener('pointerout',e=>{if(e.pointerType!=='touch'&&target(e)&&!(e.relatedTarget&&target({target:e.relatedTarget})))hide();});
document.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;const t=target(e);if(t)show(t,3500);else hide();},true);
document.addEventListener('focusin',e=>{const t=target(e);if(t&&t.matches(':focus-visible'))show(t);});
document.addEventListener('focusout',e=>{if(target(e))hide();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&cur)hide();});
addEventListener('scroll',()=>{if(!cur)return;if(cur.isConnected)place(cur);else hide();},true);   // keep it beside its control while the page scrolls (focus scrolls into view)
window.UWHint={show,hide};
})();
