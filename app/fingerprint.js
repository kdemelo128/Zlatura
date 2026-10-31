/* fingerprint.js -- the SHA-256 of a file's bytes, as 64 lowercase hex characters, or null where the
 * browser has no crypto.subtle (an insecure origin). Never a made-up value: a caller treats null as
 * "not fingerprinted". Used by the Research briefs and the due-diligence registry (dd.js). */

/** @param {ArrayBuffer | Uint8Array} bytes @returns {Promise<string | null>} */
export async function sha256Hex(bytes) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle || typeof subtle.digest !== 'function') return null;
  try {
    return [...new Uint8Array(await subtle.digest('SHA-256', /** @type {BufferSource} */ (bytes)))].map((x) => x.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}
