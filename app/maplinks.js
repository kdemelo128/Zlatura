/* maplinks.js -- "Open in" links for an address or a name: plain URLs the broker clicks, built here and nowhere else.
 * Pure: nothing is fetched, no key is used, and nothing is sent until the broker opens a link. Every part goes through
 * encodeURIComponent, and each URL passes links.js's safeHref, so a pasted value can't change the host or the scheme.
 * tests/maplinks.test.js; maplinksui.js draws the menu. */

import { safeHref } from './links.js';

const MAX = 200;
/** One line of text, controls and runs of spaces collapsed, not absurdly long. '' for anything that is not text. */
const clean = (s) => (typeof s === 'string' || typeof s === 'number' ? String(s) : '').replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX);
const q = encodeURIComponent;
const inRange = (n, lim) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= lim;

export const GOOGLE_MAPS = (place) => `https://www.google.com/maps/search/?api=1&query=${q(place)}`;
export const APPLE_MAPS = (place) => `https://maps.apple.com/?q=${q(place)}`;
export const STREET_VIEW = (lat, lng) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${q(`${lat},${lng}`)}`;
export const GOOGLE_SEARCH = (text) => `https://www.google.com/search?q=${q(text)}`;

/**
 * The links for a place: [{ id, label, url }], only the ones its parts allow.
 * `address` is a one-line address (street, city, state ZIP), `name` the property or company name, `owner` an owner name,
 * `lat` and `lng` coordinates when they are known (Street View opens exactly there; without them it opens the map search).
 * @param {{ address?: string, name?: string, owner?: string, lat?: number, lng?: number }} p
 */
export function openInLinks(p = {}) {
  const address = clean(p.address); const name = clean(p.name); const owner = clean(p.owner);
  const place = address || name;
  const out = [];
  const add = (id, label, url) => { const u = safeHref(url); if (u) out.push({ id, label, url: u }); };
  if (place) {
    add('google-maps', 'Google Maps', GOOGLE_MAPS(place));
    add('apple-maps', 'Apple Maps', APPLE_MAPS(place));
    add('street-view', 'Street View', inRange(p.lat, 90) && inRange(p.lng, 180) ? STREET_VIEW(p.lat, p.lng) : GOOGLE_MAPS(place));
  }
  if (address) add('search-address', 'Search Google for the address', GOOGLE_SEARCH(address));
  if (name && name !== address) add('search-name', 'Search Google for the name', GOOGLE_SEARCH(name));
  if (owner) add('search-owner', 'Search Google for the owner', GOOGLE_SEARCH(owner));
  return out;
}
