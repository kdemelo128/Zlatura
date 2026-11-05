/* The lease reader, run in a module worker so a long lease never freezes the page. One message in
 * ({ id, texts, ocr, name, as }: the page texts, the OCR pages { [n]: { text, conf } }, the file name, and the type the broker chose),
 * one out ({ id, ok: true, result } or { id, ok: false, message }). It imports only leaseread.js (pure), and reads nothing
 * from the network. The caller stops it with terminate() when it takes too long or is cancelled. */
/* global self */
import { pageModel, readLease } from './leaseread.js';

self.onmessage = (e) => {
  const { id, texts, ocr, name, as } = e.data || {};
  try {
    self.postMessage({ id, ok: true, result: readLease(pageModel(texts || [], { ocr: ocr || {} }), { name, as: as || null }) });
  } catch (err) {
    self.postMessage({ id, ok: false, message: String((err && err.message) || err) });
  }
};
