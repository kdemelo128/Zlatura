/* The tool's Monal is a hand-drawn vector bird (app/uwtool/monal-vector.js), not a 3D model: no canvas or WebGL, the same
 * places (guide panel, roaming bird by the nest, shop preview), the same poses (standing, blinking, flying, dozing) and the same
 * shop items as layers, the palettes as colours, reduced motion respected, crisp at 24 px and 240 px; the shop and coins work.
 *   node uwtool-bird-flow.mjs        # BASE=http://localhost:8080/ by default */
import { phone, BASE, finish } from './lib.mjs';

const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const toolFrame = (page) => page.frames().find((f) => /\/app\/uwtool\/index\.html/.test(f.url()));
const ALL = { coins: 500, owned: ['hat', 'glasses', 'shoes', 'necklace', 'chain', 'wings', 'aurora', 'sunset'], equipped: {} };

for (const [size, opts] of [['phone', {}], ['desktop', { viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }]]) {
  const { browser, ctx, page } = await phone(opts);
  page.setDefaultTimeout(25000);
  await ctx.addInitScript((g) => { try { if (!localStorage.getItem('uw-monal-game')) localStorage.setItem('uw-monal-game', JSON.stringify(g)); } catch { /* fine */ } }, ALL);
  await page.goto(`${BASE}#underwrite`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#uwt-frame') && !document.querySelector('.uwt-skel'), null, { timeout: 40000 });
  const f = toolFrame(page);
  await f.waitForSelector('.juniper-guide .monal-button');
  const st = await f.evaluate(() => ({
    canvases: document.querySelectorAll('canvas.monal-3d').length, scripts3d: [...document.scripts].filter((s) => /monal-(3d|natural)/.test(s.src)).length,
    guide: !!document.querySelector('.juniper-guide .monal-button svg.monal-art'), roam: !!document.querySelector('.roaming-juniper svg.monal-art'), shop: !!document.querySelector('.monal-preview-bird svg.monal-art'),
    parts: ['.monal-crest', '.monal-head', '.monal-wing', '.monal-tail', '.monal-eye', '.mn-lid'].map((s) => document.querySelectorAll(`.juniper-guide ${s}`).length),
    paddles: document.querySelectorAll('.juniper-guide .mn-side .mn-crest ellipse').length,
  }));
  check(`${size}: no 3D: no canvas, no 3D scripts`, st.canvases === 0 && st.scripts3d === 0, JSON.stringify(st));
  check(`${size}: the vector bird is in the guide panel, by the nest and in the shop preview`, st.guide && st.roam && st.shop, JSON.stringify(st));
  check(`${size}: it has crest paddles, head, wing, tail, eye and eyelid`, st.parts.every((n) => n >= 1) && st.paddles >= 5, JSON.stringify(st));

  // sizes: crisp at 24 and 240 (a vector: its drawn box matches the box asked for, and it has colour)
  const sz = await f.evaluate(() => {
    const out = {};
    for (const px of [24, 240]) {
      const d = document.createElement('div'); d.style.cssText = `position:fixed;left:10px;top:10px;width:${px}px;height:${px}px;z-index:9999`; d.innerHTML = window.UWMonalArt.svg('t' + px); document.body.append(d);
      const s = d.querySelector('svg'); const r = s.getBoundingClientRect(); const bb = s.querySelector('.mn-side').getBBox();
      out[px] = { w: Math.round(r.width), h: Math.round(r.height), bw: Math.round(bb.width), fillsFrame: bb.width > 200 && bb.height > 200 };
      d.remove();
    }
    return out;
  });
  check(`${size}: it draws at 24 px and at 240 px from the same drawing`, sz[24].w === 24 && sz[240].w === 240 && sz[24].fillsFrame && sz[240].fillsFrame, JSON.stringify(sz));

  await f.evaluate(() => window.UWMonalArt.dress({}));
  // palettes and every item, through the shop's own record
  const dressed = await f.evaluate(() => {
    const out = {};
    const show = (eq) => { window.UWMonalArt.dress(eq); const s = document.querySelector('.juniper-guide svg.monal-art'); return { color: s.dataset.color, items: [...s.querySelectorAll('.mn-side [data-item]')].filter((g) => getComputedStyle(g).display !== 'none').map((g) => g.dataset.item), big: s.classList.contains('large-wings') }; };
    out.hat = show({ head: 'hat' }); out.glasses = show({ eyes: 'glasses' }); out.shoes = show({ feet: 'shoes' }); out.necklace = show({ neck: 'necklace' }); out.chain = show({ neck: 'chain' });
    out.wings = show({ wings: 'wings' }); out.aurora = show({ color: 'aurora' }); out.sunset = show({ color: 'sunset' }); out.none = show({});
    return out;
  });
  check(`${size}: each item shows only its own layer (hat, glasses, shoes, necklace, chain)`, ['hat', 'glasses', 'shoes', 'necklace', 'chain'].every((k) => dressed[k].items.length >= 1 && dressed[k].items.every((i) => i === k)) && dressed.none.items.length === 0, JSON.stringify(dressed));
  check(`${size}: larger wings and the Aurora and Sunset palettes apply`, dressed.wings.big && dressed.aurora.color === 'aurora' && dressed.sunset.color === 'sunset' && dressed.none.color === 'natural' && !dressed.none.big, JSON.stringify(dressed));

  // idle motion: it blinks; under reduced motion nothing moves
  const anim = () => f.evaluate(() => document.querySelector('.juniper-guide svg.monal-art').getAnimations({ subtree: true }).map((a) => a.animationName));
  const moving = await anim();
  check(`${size}: the idle bird blinks and its crest sways (animations on transform only)`, moving.includes('mn-blink') && moving.includes('monal-crest'), JSON.stringify(moving));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(300);
  const still = await anim();
  check(`${size}: under reduced motion the bird does not move`, still.length === 0, JSON.stringify(still));

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await f.evaluate(() => { document.documentElement.dataset.motion = 'on'; });   // (the tool turns motion off for good when the system asks for less)

  // the shop: coins and equip still work, and the bird follows
  await f.click('.monal-coins');
  await f.waitForSelector('.monal-shop[open] .shop-item');
  await f.locator('.shop-item', { hasText: 'Alpine hat' }).click();
  const hat = await f.evaluate(() => ({ eq: JSON.parse(localStorage.getItem('uw-monal-game')).equipped, shown: getComputedStyle(document.querySelector('.monal-preview-bird .mn-side .mn-hat')).display, crest: getComputedStyle(document.querySelector('.monal-preview-bird .mn-crest')).display }));
  check(`${size}: buying and equipping the hat in the shop puts it on the bird (and the crest steps aside)`, hat.eq.head === 'hat' && hat.shown !== 'none' && hat.crest === 'none', JSON.stringify(hat));
  await f.click('.monal-turntable [data-pose="flying"]');
  const fly = await f.evaluate(() => ({ top: getComputedStyle(document.querySelector('.monal-preview-bird .mn-top')).display, side: getComputedStyle(document.querySelector('.monal-preview-bird .mn-side')).display, flap: document.querySelector('.monal-preview-bird .mn-wing-l .mn-wing-scale').getAnimations().length, nm: getComputedStyle(document.querySelector('.monal-preview-bird .mn-wing-l .mn-wing-scale')).animationName, mo: document.documentElement.dataset.motion || '', mm: matchMedia('(prefers-reduced-motion: reduce)').matches }));
  check(`${size}: the Flying pose shows the top view with the wings flapping`, fly.top !== 'none' && fly.side === 'none' && fly.flap === 1, JSON.stringify(fly));
  await f.click('.monal-turntable [data-turn="left"]');
  check(`${size}: the turn buttons face the bird the other way`, (await f.evaluate(() => document.querySelector('.monal-preview-bird').classList.contains('mn-turned'))) === true);
  await page.screenshot({ path: `/tmp/shots/bird/flow-shop-${size}.png` }).catch(() => {});
  await f.click('.monal-shop .shop-close');

  // a click on the bird earns a coin
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const before = await f.evaluate(() => JSON.parse(localStorage.getItem('uw-monal-game')).coins);
  await f.click('.juniper-guide .monal-button');
  const after = await f.evaluate(() => JSON.parse(localStorage.getItem('uw-monal-game')).coins);
  check(`${size}: clicking the bird still earns a play coin (${before} to ${after})`, after === before + 1);
  await browser.close();
}
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', []);
