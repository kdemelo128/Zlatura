# Read the text in a site photo (a sign, a name, an address) on your device

A site photo can carry the property's address, a business name or a "for lease" phone number. Each photo on the Site visit tab now has a "Read the text in this photo" button (Aa).

- **On request, on the device.** The OCR the app already ships (Tesseract, loaded only on that tap, from this site) reads the photo. No image leaves the device; no request goes to another site.
- **Shown, not kept.** The lines found appear in a sheet marked "Read from the photo", each with its confidence and a note where it looks like a phone number or a street address. Closing the sheet discards them. Nothing new is saved.
- **Used only on your tap.** Each line has Copy, "Use as address" and "Use as deal name". One line, one field, with Undo. Nothing is applied automatically.
- **No faces.** Nothing looks for people or faces; a test fails if face-detection code or a model appears in `app/` or `vendor/`.
- **Tested** with invented signs only: `photo-text.test.js` (line tidying, tagging, the no-face check) and `photoocr-flow` (a sign drawn on a canvas, read in Chromium, used and undone). Not tried on a real photo, an iPhone or Safari. Money, the engine and saved results are unchanged (golden 646 figures, 0 changed).
