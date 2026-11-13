/* monal-vector.js -- the Himalayan monal, drawn by hand as SVG: the one place the bird's artwork lives. It replaces the voxel and
 * mesh bird (nothing is loaded or drawn in 3D any more). Original artwork: no outside images, fonts or models.
 *
 *   UWMonalArt.svg(prefix)   the markup of one bird: a side view (standing, blinking, hopping, dozing) and a top view (flight),
 *                            one <svg class="monal-svg"> with its own gradient ids (prefix), so any number can share a page
 *   UWMonalArt.dress(equipped, root)   shows the shop items on every bird in `root` (default: the document)
 *   UWMonalArt.items         every shop item and where it sits: head, eye, neck, feet, wings, colour
 *
 * The parts keep the class names the page's own greeting uses (monal-body, monal-head, monal-wing, monal-tail, monal-crest,
 * monal-eye, monal-happy-eye), so a greeting, a hop or a wing flick moves the new drawing without another script. Everything
 * that moves moves by transform or opacity (CSS in monal-vector.css; none of it runs under reduced motion or Pause motion).
 * The colours are custom properties on the svg (--mn-*), so the shop's Aurora and Sunset are a palette, not a filter.
 *
 * Plumage, as in the species: a metallic green head with a crest of fine shafts ending in small flat paddles; a bare blue patch
 * round the eye; a copper-gold nape going to violet across the back and shoulders; a white patch low on the back; blue and teal
 * wings with violet tips; velvet-black underparts; a broad rust tail; strong grey legs. */
(function (root) {
  'use strict';

  /** Each shop item: its slot (the shop's own) and the part of the bird it is anchored to. */
  const ITEMS = Object.freeze({
    hat: { slot: 'head', anchor: 'head' }, glasses: { slot: 'eyes', anchor: 'head' }, necklace: { slot: 'neck', anchor: 'neck' },
    chain: { slot: 'neck', anchor: 'neck' }, shoes: { slot: 'feet', anchor: 'feet' }, wings: { slot: 'wings', anchor: 'wings' },
    aurora: { slot: 'color', anchor: 'palette' }, sunset: { slot: 'color', anchor: 'palette' },
  });

  const attr = (o) => Object.entries(o).map(([k, v]) => `${k}="${v}"`).join(' ');
  const stop = (o, c) => `<stop offset="${o}" style="stop-color:${c}"/>`;
  const grad = (id, a, stops) => `<linearGradient id="${id}" ${attr(a)}>${stops.map(([o, c]) => stop(o, c)).join('')}</linearGradient>`;

  /** The gradients, by role. Colours come from --mn-* so a palette (natural, aurora, sunset) can swap them. */
  function defs(p) {
    const g = (n) => `${p}-${n}`;
    return `<defs>
${grad(g('head'), { x1: 0.1, y1: 0, x2: 0.9, y2: 1 }, [[0, 'var(--mn-head-a)'], [0.4, 'var(--mn-head-b)'], [0.75, 'var(--mn-head-c)'], [1, 'var(--mn-head-d)']])}
${grad(g('neck'), { x1: 0, y1: 0, x2: 0.4, y2: 1 }, [[0, 'var(--mn-neck-a)'], [0.35, 'var(--mn-neck-b)'], [0.7, 'var(--mn-neck-c)'], [1, 'var(--mn-neck-d)']])}
${grad(g('back'), { x1: 1, y1: 0, x2: 0, y2: 0.9 }, [[0, 'var(--mn-back-a)'], [0.3, 'var(--mn-back-b)'], [0.65, 'var(--mn-back-c)'], [1, 'var(--mn-back-d)']])}
${grad(g('wing'), { x1: 0.9, y1: 0, x2: 0.1, y2: 1 }, [[0, 'var(--mn-wing-a)'], [0.45, 'var(--mn-wing-b)'], [0.8, 'var(--mn-wing-c)'], [1, 'var(--mn-wing-d)']])}
${grad(g('tip'), { x1: 0.9, y1: 0, x2: 0, y2: 0.6 }, [[0, 'var(--mn-wing-c)'], [1, 'var(--mn-wing-d)']])}
${grad(g('belly'), { x1: 0.3, y1: 0, x2: 0.6, y2: 1 }, [[0, 'var(--mn-belly-a)'], [0.6, 'var(--mn-belly-b)'], [1, 'var(--mn-belly-c)']])}
${grad(g('tail'), { x1: 1, y1: 0, x2: 0, y2: 0.4 }, [[0, 'var(--mn-tail-a)'], [0.55, 'var(--mn-tail-b)'], [1, 'var(--mn-tail-c)']])}
${grad(g('tail2'), { x1: 1, y1: 0, x2: 0, y2: 0.4 }, [[0, 'var(--mn-tail-b)'], [0.6, 'var(--mn-tail-c)'], [1, 'var(--mn-tail-d)']])}
${grad(g('leg'), { x1: 0, y1: 0, x2: 1, y2: 0 }, [[0, '#b9b6bf'], [0.5, '#8a8791'], [1, '#5f5c69']])}
${grad(g('pad'), { x1: 0, y1: 0, x2: 1, y2: 1 }, [[0, 'var(--mn-pad-a)'], [1, 'var(--mn-pad-b)']])}
${grad(g('bill'), { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, '#e6dcc2'], [1, '#9b8d72']])}
${grad(g('gold'), { x1: 0, y1: 0, x2: 1, y2: 1 }, [[0, '#ffe08a'], [0.5, '#e0a93a'], [1, '#a9701c']])}
${grad(g('felt'), { x1: 0, y1: 0, x2: 1, y2: 1 }, [[0, '#8a63a8'], [1, '#4d2f6a']])}
${grad(g('boot'), { x1: 0, y1: 0, x2: 1, y2: 1 }, [[0, '#e0883f'], [1, '#9a4a1c']])}
<radialGradient id="${g('gloss')}" cx="0.5" cy="0.4" r="0.6"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<radialGradient id="${g('sheen')}" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>`;
  }

  /** The side view, facing right. 240 x 240; the ground is at y = 230. */
  function side(p) {
    const u = (n) => `url(#${p}-${n})`;
    // a paddle: the flat spatulate end of a crest shaft
    const paddle = (x, y, a, s = 1) => `<ellipse cx="${x}" cy="${y}" rx="${3.4 * s}" ry="${7 * s}" transform="rotate(${a} ${x} ${y})" fill="${u('pad')}" stroke="var(--mn-pad-edge)" stroke-width=".7"/><path d="M${x} ${y - 5.5 * s}V${y + 5 * s}" transform="rotate(${a} ${x} ${y})" stroke="var(--mn-pad-edge)" stroke-width=".6" opacity=".7"/>`;
    return `<g class="mn-side">
<ellipse class="mn-shadow" cx="118" cy="231" rx="78" ry="5" fill="#000" opacity=".16"/>
<g class="monal-body">
<g class="monal-tail" data-part="tail">
<path d="M72 146L100 176L58 178C54 168 58 154 72 146Z" fill="${u('tail')}"/>
<path d="M64 148C42 138 16 138 3 149C1 158 9 165 22 165L74 162Z" fill="${u('tail')}"/>
<path d="M66 157C44 157 19 165 8 179C8 189 18 192 31 188L80 174Z" fill="${u('tail2')}"/>
<path d="M70 165C52 171 30 185 22 201C24 210 35 210 45 204L88 180Z" fill="${u('tail')}"/>
<path d="M76 171C62 183 47 199 45 214C50 220 61 218 69 210L96 186Z" fill="${u('tail2')}"/>
<path d="M12 152C30 152 52 154 70 158M16 172C38 170 58 170 78 168M30 192C46 184 62 178 82 174M54 208C64 198 76 188 90 180" stroke="var(--mn-tail-d)" stroke-width=".9" fill="none" opacity=".45" stroke-linecap="round"/>
<path d="M4 152C6 159 12 164 22 165M9 181C10 188 19 191 31 188M23 203C26 210 36 209 45 204M46 216C51 220 61 218 69 210" stroke="var(--mn-tail-tip)" stroke-width="2" fill="none" stroke-linecap="round" opacity=".85"/>
</g>
<g class="mn-leg mn-leg-far" opacity=".85">
<path d="M148 188V222" stroke="#6b6874" stroke-width="5.5" stroke-linecap="round"/>
<path d="M148 223L168 226M148 223L162 230M148 223L132 227" stroke="#6b6874" stroke-width="3.2" stroke-linecap="round" fill="none"/>
<g class="mn-shoes" data-item="shoes" opacity=".9"><path d="M140 208H156L157 222C166 222 172 226 172 230H134C132 230 130 226 132 224L140 222Z" fill="${u('boot')}"/><path d="M140 208H156V212H140Z" fill="${u('gold')}"/></g>
</g>
<path d="M130 106C104 100 72 112 54 138C44 152 46 166 60 174C86 192 128 198 160 188C190 178 206 150 200 122C198 112 192 106 190 104C176 114 150 116 130 106Z" fill="${u('belly')}"/>
<path d="M130 106C104 100 72 112 54 138C50 146 50 152 54 158C82 144 112 130 148 118C140 114 134 110 130 106Z" fill="${u('back')}"/>
<path d="M56 140C50 147 51 155 57 160C62 154 64 147 63 141C61 138 58 138 56 140Z" fill="#efe8d4" opacity=".95"/>
<path d="M150 150C170 150 188 144 198 128" stroke="#2f4a63" stroke-width="1.4" fill="none" opacity=".55" stroke-linecap="round"/>
<g class="mn-fine" opacity=".9">
<path d="M96 116C90 120 82 126 76 134M108 114C100 120 92 128 86 138M120 110C112 118 104 126 98 136" stroke="#fff" stroke-width="1" fill="none" opacity=".18" stroke-linecap="round"/>
</g>
<g class="mn-leg mn-leg-near">
<path d="M122 190V222" stroke="#8e8b96" stroke-width="6.5" stroke-linecap="round"/><path d="M120.4 194V219" stroke="#c9c6d0" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>
<path d="M122 223L143 226M122 223L137 230M122 223L104 228" stroke="#77747f" stroke-width="3.6" stroke-linecap="round" fill="none"/>
<g class="mn-shoes" data-item="shoes"><path d="M114 208H130L131 222C142 222 150 226 150 230H108C106 230 104 226 106 224L114 222Z" fill="${u('boot')}"/><path d="M114 208H130V212H114Z" fill="${u('gold')}"/><path d="M108 229H150" stroke="#5e2a0e" stroke-width="1.6" opacity=".7"/></g>
</g>
<g class="monal-wing" data-part="wings"><g class="mn-wing-scale">
<path d="M136 112C150 114 158 130 154 146C146 168 100 178 44 172C78 164 110 146 136 112Z" fill="${u('tip')}"/>
<path d="M134 114C152 120 156 140 146 154C132 170 100 172 62 164C88 156 112 140 134 114Z" fill="${u('wing')}"/>
<path d="M134 114C148 120 150 136 140 146C126 158 100 156 82 150C104 142 120 132 134 114Z" fill="${u('wing')}"/>
<path d="M134 114C142 118 146 124 146 130C140 126 136 120 134 114Z" fill="var(--mn-wing-a)" opacity=".8"/>
<path d="M62 164C88 158 112 142 132 118M70 170C96 164 124 150 146 132M54 168C84 164 118 156 144 142" stroke="#fff" stroke-width="1.1" fill="none" opacity=".32" stroke-linecap="round"/>
<path d="M52 170C84 168 120 160 148 148" stroke="var(--mn-wing-d)" stroke-width="1.4" fill="none" opacity=".55" stroke-linecap="round"/>
<path d="M118 126C128 124 138 126 144 132" stroke="#c8fff3" stroke-width="2" fill="none" opacity=".35" stroke-linecap="round"/>
</g></g>
<path d="M156 76C150 92 140 102 128 108L150 118C170 126 192 122 198 106C200 96 194 86 188 78C182 82 164 84 156 76Z" fill="${u('neck')}"/>
<g class="mn-fine">
<path d="M150 96C156 100 164 100 170 96M146 104C154 110 166 110 176 104M158 112C166 116 178 114 186 108M184 92C190 96 194 100 194 104" stroke="#fff" stroke-width="1" fill="none" opacity=".22" stroke-linecap="round"/>
<ellipse cx="176" cy="104" rx="14" ry="6" transform="rotate(-24 176 104)" fill="url(#${p}-sheen)"/>
</g>
<g class="mn-necklace" data-item="necklace"><path d="M140 108Q166 128 196 108" stroke="#cfeaf5" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-dasharray="1.2 3.6"/><path d="M140 108Q166 128 196 108" stroke="#fff" stroke-width="1" fill="none" opacity=".6"/><path d="M168 123L173 117L178 123L173 131Z" fill="#2fc7c1" stroke="#0e7d79" stroke-width=".8"/><path d="M168 123H178" stroke="#fff" stroke-width=".7" opacity=".6"/></g>
<g class="mn-chain" data-item="chain"><path d="M138 112Q166 136 198 112" stroke="url(#${p}-gold)" stroke-width="4.2" fill="none" stroke-linecap="round" stroke-dasharray="5 1.6"/><path d="M138 111Q166 135 198 111" stroke="#fff3c4" stroke-width=".8" fill="none" opacity=".7"/></g>
<g class="monal-head" data-part="head">
<g class="monal-crest mn-crest">
<path d="M164 46C160 32 150 20 137 13M167 44C166 29 160 15 156 5M170 43C172 29 173 15 177 6M173 44C178 31 187 22 197 16M162 49C155 38 143 32 131 30" stroke="var(--mn-shaft)" stroke-width="1.7" fill="none" stroke-linecap="round"/>
${paddle(135, 12, -62)}${paddle(155, 3.5, -12)}${paddle(177, 5, 12)}${paddle(199, 15, 48)}${paddle(129, 30, -80, 0.9)}
</g>
<path d="M152 62C152 46 164 40 174 41C186 42 192 52 191 64C190 76 182 84 170 84C158 84 152 74 152 62Z" fill="${u('head')}"/>
<path d="M156 52C160 44 170 42 178 44C170 46 162 50 158 58Z" fill="#fff" opacity=".25"/>
<ellipse cx="166" cy="53" rx="9" ry="4" transform="rotate(-18 166 53)" fill="url(#${p}-gloss)"/>
<path d="M152 66C158 74 170 78 182 74" stroke="var(--mn-head-d)" stroke-width="1" fill="none" opacity=".5"/>
<g class="monal-eye"><ellipse cx="176" cy="61" rx="8" ry="6.8" fill="#3b83d6" opacity=".9"/><ellipse cx="176" cy="61" rx="8" ry="6.8" fill="none" stroke="#1e5aa8" stroke-width=".8" opacity=".7"/><circle cx="176.5" cy="61" r="3.6" fill="#0b1015"/><circle cx="177.8" cy="59.6" r="1.2" fill="#fff"/></g>
<path class="mn-lid" d="M168 61C168 55 184 55 184 61C184 67 168 67 168 61Z" fill="url(#${p}-head)"/>
<path class="monal-happy-eye" d="M170.5 62C173 57 180 57 182.5 62" stroke="#0b1015" stroke-width="2" fill="none" stroke-linecap="round"/>
<path d="M190 61C198 59 207 63 209 72C207 77 200 76 196 75C192 74 190 70 190 66Z" fill="${u('bill')}"/>
<path d="M200 64C206 65 209 69 209 72C205 70 201 68 199 66Z" fill="#6e6150" opacity=".8"/>
<path d="M193 63L196 63" stroke="#5c5040" stroke-width="1.4" stroke-linecap="round"/>
<g class="mn-glasses" data-item="glasses"><circle cx="176" cy="61" r="9.2" fill="#fff" fill-opacity=".12" stroke="url(#${p}-gold)" stroke-width="2"/><path d="M167.5 59C163 58 158 59 154 62" stroke="url(#${p}-gold)" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M171 56C173 54 176 53.6 178 54" stroke="#fff" stroke-width="1.2" fill="none" opacity=".7" stroke-linecap="round"/></g>
<g class="mn-hat" data-item="hat"><ellipse cx="168" cy="43" rx="27" ry="6.4" transform="rotate(-6 168 43)" fill="url(#${p}-felt)"/><path d="M152 43C152 30 156 18 166 16C176 15 182 28 183 42C174 46 160 46 152 43Z" fill="url(#${p}-felt)"/><path d="M152 38C162 42 174 42 183 37L183 42C174 46 160 46 152 43Z" fill="url(#${p}-gold)"/><path d="M178 22C186 12 196 8 204 10C198 14 192 18 184 28Z" fill="#e8574a"/><path d="M178 22C188 14 196 11 204 10" stroke="#9c2b24" stroke-width=".8" fill="none"/><path d="M160 20C164 17 170 17 174 20" stroke="#fff" stroke-width="1.2" fill="none" opacity=".25" stroke-linecap="round"/></g>
</g>
</g>
</g>`;
  }

  /** The top view, heading up, for flight. Same 240 x 240 frame, centred. */
  function top(p) {
    const u = (n) => `url(#${p}-${n})`;
    const wing = `<path d="M108 100C80 82 40 76 6 92C4 97 9 102 16 101C42 100 74 112 104 126Z" fill="${u('wing')}"/>
<path d="M104 110C78 100 46 98 16 108C16 113 22 114 28 113C54 113 82 120 104 130Z" fill="${u('tip')}" opacity=".95"/>
<path d="M104 104C84 92 50 88 20 96M104 112C80 106 50 106 24 110M104 120C84 118 60 120 36 122" stroke="#fff" stroke-width="1.1" fill="none" opacity=".3" stroke-linecap="round"/>
<path d="M8 93C12 90 18 90 22 92" stroke="var(--mn-wing-d)" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>`;
    return `<g class="mn-top">
<ellipse class="mn-shadow" cx="120" cy="236" rx="40" ry="4" fill="#000" opacity=".1"/>
<g class="monal-body">
<g class="mn-fan">
<path transform="translate(120 166) rotate(-50)" d="M0 0C-10 18 -11 48 0 68C11 48 10 18 0 0Z" fill="${u('tail2')}"/>
<path transform="translate(120 166) rotate(50)" d="M0 0C-10 18 -11 48 0 68C11 48 10 18 0 0Z" fill="${u('tail2')}"/>
<path transform="translate(120 166) rotate(-34)" d="M0 0C-10 18 -11 48 0 68C11 48 10 18 0 0Z" fill="${u('tail')}"/>
<path transform="translate(120 166) rotate(34)" d="M0 0C-10 18 -11 48 0 68C11 48 10 18 0 0Z" fill="${u('tail')}"/>
<path transform="translate(120 166) rotate(-17)" d="M0 0C-10 18 -11 48 0 68C11 48 10 18 0 0Z" fill="${u('tail2')}"/>
<path transform="translate(120 166) rotate(17)" d="M0 0C-10 18 -11 48 0 68C11 48 10 18 0 0Z" fill="${u('tail2')}"/>
<path transform="translate(120 166) rotate(0)" d="M0 0C-10 18 -11 48 0 68C11 48 10 18 0 0Z" fill="${u('tail')}"/>
<path d="M120 174V230" stroke="var(--mn-tail-d)" stroke-width="1" opacity=".45"/>
</g>
<g class="mn-wing-l monal-wing"><g class="mn-wing-scale">${wing}</g></g>
<g class="mn-wing-r"><g class="mn-wing-scale"><g transform="translate(240 0) scale(-1 1)">${wing}</g></g></g>
<path d="M120 84C102 88 98 124 104 156C108 172 132 172 136 156C142 124 138 88 120 84Z" fill="${u('belly')}"/>
<path d="M120 90C106 94 102 120 106 146C112 150 128 150 134 146C138 120 134 94 120 90Z" fill="${u('back')}"/>
<path d="M110 146C114 152 126 152 130 146C128 158 112 158 110 146Z" fill="#f6f2e4"/>
<path d="M120 62C108 64 106 86 108 98C112 106 128 106 132 98C134 86 132 64 120 62Z" fill="${u('neck')}"/>
<path d="M114 80C118 84 124 84 128 80M112 88C118 93 126 93 130 88" stroke="#fff" stroke-width="1" fill="none" opacity=".22" stroke-linecap="round"/>
<g class="monal-head mn-head-top">
<g class="mn-crest-top"><path d="M120 62C114 68 110 72 108 78M120 62V82M120 62C126 68 130 72 132 78" stroke="var(--mn-shaft)" stroke-width="1.4" fill="none" stroke-linecap="round"/><ellipse cx="107.5" cy="80" rx="2.6" ry="5" transform="rotate(-18 107.5 80)" fill="${u('pad')}"/><ellipse cx="120" cy="85" rx="2.6" ry="5" fill="${u('pad')}"/><ellipse cx="132.5" cy="80" rx="2.6" ry="5" transform="rotate(18 132.5 80)" fill="${u('pad')}"/></g>
<path d="M106 54C106 40 112 33 120 33C128 33 134 40 134 54C134 64 128 70 120 70C112 70 106 64 106 54Z" fill="${u('head')}"/>
<path d="M112 42C116 38 124 38 128 42" stroke="#fff" stroke-width="1.4" fill="none" opacity=".3" stroke-linecap="round"/>
<circle cx="111" cy="52" r="3.2" fill="#3b83d6"/><circle cx="111" cy="52" r="1.8" fill="#0b1015"/><circle cx="129" cy="52" r="3.2" fill="#3b83d6"/><circle cx="129" cy="52" r="1.8" fill="#0b1015"/>
<path d="M115 34C116 26 124 26 125 34C122 36 118 36 115 34Z" fill="${u('bill')}"/>
</g>
<path class="mn-chain-top" data-item="chain" d="M110 84Q120 96 130 84" stroke="url(#${p}-gold)" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-dasharray="4 1.4"/>
<path class="mn-necklace-top" data-item="necklace" d="M110 82Q120 92 130 82" stroke="#cfeaf5" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-dasharray="1.2 3.4"/>
<ellipse class="mn-hat-top" data-item="hat" cx="120" cy="52" rx="19" ry="17" fill="url(#${p}-felt)"/><ellipse class="mn-hat-top" data-item="hat" cx="120" cy="50" rx="10" ry="9" fill="#8a63a8"/>
<g class="mn-glasses-top" data-item="glasses"><circle cx="111" cy="52" r="5.6" fill="none" stroke="url(#${p}-gold)" stroke-width="1.6"/><circle cx="129" cy="52" r="5.6" fill="none" stroke="url(#${p}-gold)" stroke-width="1.6"/><path d="M116.6 52H123.4" stroke="url(#${p}-gold)" stroke-width="1.4"/></g>
</g>
</g>`;
  }

  const PALETTES = {
    natural: {
      'head-a': '#8cf5c0', 'head-b': '#19b97a', 'head-c': '#0c7a73', 'head-d': '#0a4a63',
      'neck-a': '#f2b83e', 'neck-b': '#d9702a', 'neck-c': '#a63a7b', 'neck-d': '#5b2aa8',
      'back-a': '#b4452f', 'back-b': '#8b2fa9', 'back-c': '#3a4fd0', 'back-d': '#12a9a4',
      'wing-a': '#2fe0cb', 'wing-b': '#1b87dc', 'wing-c': '#4b32b8', 'wing-d': '#1b1f5a',
      'belly-a': '#243a4e', 'belly-b': '#0c1822', 'belly-c': '#04070b',
      'tail-a': '#ee9a45', 'tail-b': '#cf5f22', 'tail-c': '#9a3414', 'tail-d': '#6a210c', 'tail-tip': '#f6cf98',
      'pad-a': '#c9f26a', 'pad-b': '#12a876', 'pad-edge': '#0a6b57', shaft: '#1f6b62',
    },
    aurora: {
      'head-a': '#b3fbe0', 'head-b': '#2fd3a0', 'head-c': '#0d8c92', 'head-d': '#0b4f78',
      'neck-a': '#9ef0c8', 'neck-b': '#39c6d6', 'neck-c': '#4a7fe0', 'neck-d': '#5a3fc4',
      'back-a': '#37c8c0', 'back-b': '#2c8fe6', 'back-c': '#6b45d8', 'back-d': '#1fa7b8',
      'wing-a': '#7bf2e6', 'wing-b': '#25a8ee', 'wing-c': '#6a45d6', 'wing-d': '#241f6a',
      'belly-a': '#1f3a52', 'belly-b': '#0a1a2c', 'belly-c': '#030812',
      'tail-a': '#7ee0c8', 'tail-b': '#3aa7c8', 'tail-c': '#2a5fa8', 'tail-d': '#1c2f6a', 'tail-tip': '#c9fff0',
      'pad-a': '#d6ff9a', 'pad-b': '#25c9a0', 'pad-edge': '#0b7a68', shaft: '#1a7d78',
    },
    sunset: {
      'head-a': '#ffd79a', 'head-b': '#f08a5a', 'head-c': '#c24a6a', 'head-d': '#6f2a63',
      'neck-a': '#ffd36a', 'neck-b': '#f2823a', 'neck-c': '#d4406a', 'neck-d': '#7a2aa0',
      'back-a': '#e0603a', 'back-b': '#c83a7a', 'back-c': '#7a3ab8', 'back-d': '#e08a3a',
      'wing-a': '#ffb27a', 'wing-b': '#e65a8a', 'wing-c': '#7a3ab8', 'wing-d': '#2e1a5a',
      'belly-a': '#3a2440', 'belly-b': '#1a0f24', 'belly-c': '#0a0610',
      'tail-a': '#ffc16a', 'tail-b': '#f08a3a', 'tail-c': '#c24a2a', 'tail-d': '#7a2a14', 'tail-tip': '#ffe6b8',
      'pad-a': '#ffe27a', 'pad-b': '#f0883a', 'pad-edge': '#a24a1a', shaft: '#8a3a2a',
    },
  };
  const paletteStyle = (name) => Object.entries(PALETTES[name] || PALETTES.natural).map(([k, v]) => `--mn-${k}:${v}`).join(';');

  /** One bird. `prefix` makes its gradient ids its own. */
  function svg(prefix = 'mn') {
    const p = String(prefix).replace(/[^A-Za-z0-9_-]/g, '') || 'mn';
    return `<svg class="monal-svg monal-art" viewBox="0 0 240 240" aria-hidden="true" focusable="false" data-color="natural" style="${paletteStyle('natural')}">${defs(p)}${side(p)}${top(p)}</svg>`;
  }

  /** Show the shop's items on every bird under `scope`: items on, the palette, bigger wings. `equipped` is { slot: itemId }. */
  function dress(equipped, scope) {
    const eq = equipped && typeof equipped === 'object' ? equipped : {};
    const on = new Set(Object.values(eq).filter((id) => ITEMS[id]));
    for (const s of (scope || document).querySelectorAll('svg.monal-art')) {
      const color = on.has('aurora') ? 'aurora' : on.has('sunset') ? 'sunset' : 'natural';
      s.style.cssText = paletteStyle(color);
      s.dataset.color = color;
      s.classList.toggle('large-wings', on.has('wings'));
      s.classList.toggle('has-hat', on.has('hat'));
      for (const g of s.querySelectorAll('[data-item]')) g.style.display = on.has(g.dataset.item) ? 'inline' : 'none';
    }
  }

  root.UWMonalArt = Object.freeze({ svg, dress, items: ITEMS, palettes: Object.freeze(Object.keys(PALETTES)) });
})(typeof window === 'undefined' ? globalThis : window);
