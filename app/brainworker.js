/* brainworker.js -- hosts Monal's on-device language model off the main thread, so the page stays quick to type in
 * while the model downloads and answers. It runs WebLLM's own message handler (vendor/web-llm-0.2.87/); brain.js
 * is the other end. The library is loaded here, and only here, when the broker has turned the brain on. */

const LIB = new URL('../vendor/web-llm-0.2.87/web-llm.js', import.meta.url).href;
// messages that arrive while the (large) library is still loading wait their turn, in order
const handler = import(LIB).then((m) => new m.WebWorkerMLCEngineHandler());
self.onmessage = (msg) => { handler.then((h) => h.onmessage(msg)); };
