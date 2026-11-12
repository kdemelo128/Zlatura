/* ocrprogress.js -- the line shown while a scanned PDF is read by OCR: what page it is on, and a Cancel.
 * It sits at the foot of the screen and takes no focus and no input, so typing goes on while the reader works
 * (the engine runs in a Web Worker; only drawing a page touches the main thread). */
import { el } from './kit.js';

/** @returns {{ signal: { aborted: boolean }, say: (t: string) => void, end: () => void }} */
export function startOcrProgress() {
  const signal = { aborted: false };
  const bar = el('div', 'ocr-progress');
  bar.setAttribute('role', 'status');
  const text = el('span', 'ocr-progress-text', 'Reading a scanned PDF by OCR on this device…');
  const cancel = el('button', 'btn btn-sm btn-plain', 'Cancel');
  cancel.type = 'button';
  cancel.addEventListener('click', () => { signal.aborted = true; text.textContent = 'Cancelling…'; cancel.disabled = true; });
  bar.append(text, cancel);
  document.body.appendChild(bar);
  return { signal, say: (t) => { if (!signal.aborted) text.textContent = `Reading a scanned PDF by OCR: ${t}`; }, end: () => bar.remove() };
}
