/* Invented stand-in: a window object shaped like a filler's, with no real content. */
window.UWFiller = { version: 'stand-in-1', files: [], addFiles(list) { this.files.push(...list); return this.files.length; }, result: null };
window.UWEditor = {
  model: { coins: Number(localStorage.getItem('uw-monal-coins') || 0) },
  commit() { localStorage.setItem('uw-monal-coins', String(this.model.coins)); },
};
