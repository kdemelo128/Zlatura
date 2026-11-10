/* hashes.js -- the package fingerprints this build will load. A package whose fingerprint (pkg.js, fingerprint())
 * is not listed here is refused: the filler's code runs on this origin with access to every deal, so only a version
 * the owner has approved is let in. A fingerprint is a SHA-256 of the sorted file list with each file's own SHA-256;
 * it reveals nothing of the contents. Add one line per approved release. */

export const APPROVED = [
  // an invented stand-in package (tests/fixtures/uwfiller-standin/): public, tiny, and what the public tests load
  { hash: '6d3107ab87111a7a4e31d13f62361d3c7952f137411e666171118e74502c2d7a', label: 'Invented stand-in (tests only)' },
  // the owner's underwriting tool, release of 2026-11-07 (approved by the owner 2026-11-10); the package itself is never committed
  { hash: '695a5b5c5d8ee44b38449dd18a439aeda8b567da56c4a40376f989fdfbc9dccb', label: 'Underwriting tool, 2026-11-07 release' },
];
