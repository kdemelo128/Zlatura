/* listingui.js -- the listing copy (listingcopy.js) as a sheet on the open
 * deal: each block with its character count, a Copy button, and one
 * "Save as .txt" for all of them. */

import { el, toast, copyText, deliver, deliveryError } from './kit.js';
import { listingBlocks, listingFile } from './listingcopy.js';

const TXT = 'text/plain;charset=utf-8';

/** `base` is the file name without its extension. */
export function openListingCopy({ sheetOpen, deal, m, base }) {
  const blocks = listingBlocks(deal, m);
  const save = el('button', 'btn btn-primary', 'Save as .txt');
  save.type = 'button';
  save.disabled = !blocks.length;
  save.addEventListener('click', async () => {
    try {
      if (await deliver(`${base.replace(/^Deal - /, 'Listing copy - ')}.txt`, listingFile(blocks), TXT, { map: 'listing-copy' }) === 'done') toast('Listing copy saved.');
    } catch (err) { deliveryError(err); }
  });
  const body = sheetOpen({
    eyebrow: 'Listing copy',
    title: deal.name || 'Deal',
    sub: deal.example
      ? 'This is the fictional sample deal: its figures are invented, so do not post this copy.'
      : 'A draft for you to review: it says only what this deal’s figures say. Check each figure against the OM before posting.',
    foot: [save],
  });
  if (!blocks.length) body.appendChild(el('p', 'hint-sm', 'This deal has no figures yet to write a listing from. Add the property’s figures first.'));
  for (const b of blocks) {
    const sec = el('section');
    sec.dataset.block = b.key;
    sec.appendChild(el('h3', null, b.label));
    sec.appendChild(el('div', 'snippet', b.text));
    const row = el('div');
    row.style.cssText = 'display:flex;gap:var(--s3);align-items:center;justify-content:space-between;margin:var(--s2) 0 var(--s5)';
    row.appendChild(el('span', `count ${b.over ? 'warn-text' : 'hint-sm'}`, b.over
      ? `${b.count} of ${b.limit} characters: ${b.count - b.limit} over the limit`
      : `${b.count} of ${b.limit} characters`));
    const copy = el('button', 'btn btn-sm', 'Copy');
    copy.type = 'button';
    copy.setAttribute('aria-label', `Copy ${b.label.toLowerCase()}`);
    copy.addEventListener('click', async () => toast((await copyText(b.text)) ? `${b.label} copied.` : 'The browser blocked copying here.'));
    row.appendChild(copy);
    sec.appendChild(row);
    body.appendChild(sec);
  }
}
