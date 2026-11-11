// md5.js - small MD5 (hex) for Uint8Array input, used only to fingerprint source files (provenance)
(function(root){
  function md5(bytes){
    const K=new Int32Array(64),S=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
    for(let i=0;i<64;i++)K[i]=Math.floor(Math.abs(Math.sin(i+1))*4294967296)|0;
    const n=bytes.length,padLen=((n+8)>>6<<6)+64,buf=new Uint8Array(padLen);buf.set(bytes);buf[n]=0x80;
    const dv=new DataView(buf.buffer);dv.setUint32(padLen-8,(n*8)>>>0,true);dv.setUint32(padLen-4,Math.floor(n/536870912),true);
    let a0=0x67452301|0,b0=0xefcdab89|0,c0=0x98badcfe|0,d0=0x10325476|0;
    for(let o=0;o<padLen;o+=64){
      const M=new Int32Array(16);for(let i=0;i<16;i++)M[i]=dv.getInt32(o+i*4,true);
      let A=a0,B=b0,C=c0,D=d0;
      for(let i=0;i<64;i++){let F,g;
        if(i<16){F=(B&C)|(~B&D);g=i}else if(i<32){F=(D&B)|(~D&C);g=(5*i+1)%16}else if(i<48){F=B^C^D;g=(3*i+5)%16}else{F=C^(B|~D);g=(7*i)%16}
        F=(F+A+K[i]+M[g])|0;A=D;D=C;C=B;B=(B+((F<<S[i])|(F>>>(32-S[i]))))|0;}
      a0=(a0+A)|0;b0=(b0+B)|0;c0=(c0+C)|0;d0=(d0+D)|0;}
    const out=new DataView(new ArrayBuffer(16));out.setInt32(0,a0,true);out.setInt32(4,b0,true);out.setInt32(8,c0,true);out.setInt32(12,d0,true);
    let h='';for(let i=0;i<16;i++)h+=out.getUint8(i).toString(16).padStart(2,'0');return h;}
  if(typeof module!=='undefined'&&module.exports)module.exports=md5;else root.md5=md5;
})(typeof self!=='undefined'?self:this);

// pdftext.js - turns a pdf.js page into pdfplumber-style words {text,x0,x1,top,bottom,fontname}
// Works in node and the browser. Widths inside a text run are split with Helvetica metrics, then normalised to the run's exact width.
(function (root) {
  const REG = {' ':278,'!':278,'"':355,'#':556,'$':556,'%':889,'&':667,"'":191,'(':333,')':333,'*':389,'+':584,',':278,'-':333,'.':278,'/':278,':':278,';':278,'<':584,'=':584,'>':584,'?':556,'@':1015,
    A:667,B:667,C:722,D:722,E:667,F:611,G:778,H:722,I:278,J:500,K:667,L:556,M:833,N:722,O:778,P:667,Q:778,R:722,S:667,T:611,U:722,V:667,W:944,X:667,Y:667,Z:611,'[':278,'\\':278,']':278,'^':469,_:556,'`':333,
    a:556,b:556,c:500,d:556,e:556,f:278,g:556,h:556,i:222,j:222,k:500,l:222,m:833,n:556,o:556,p:556,q:556,r:333,s:500,t:278,u:556,v:500,w:722,x:500,y:500,z:500,'{':334,'|':260,'}':334,'~':584};
  const BOLD = Object.assign({}, REG, {'!':333,'"':474,"'":238,':':333,';':333,'?':611,'@':975,'&':722,A:722,B:722,C:722,D:722,E:667,F:611,G:778,H:722,I:278,J:556,K:722,L:611,M:833,N:722,O:778,P:667,Q:778,R:722,S:667,T:611,U:722,V:667,W:944,X:667,Y:667,Z:611,
    a:556,b:611,c:556,d:611,e:556,f:333,g:611,h:611,i:278,j:278,k:556,l:278,m:889,n:611,o:611,p:611,q:611,r:389,s:556,t:333,u:611,v:556,w:778,x:556,y:556,z:500});
  const r2 = x => Math.round(x * 100) / 100;

  async function pageWords(page) {
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    let fontWarning=null;try{await page.getOperatorList();}catch{fontWarning='Font metrics could not load; text retained with approximate word widths. Review table columns.';}
    const fname = {};
    for (const k of Object.keys(tc.styles)) { try { fname[k] = page.commonObjs.get(k).name; } catch (e) { fname[k] = k; } }
    const H = vp.height, out = [];
    let prev = null, sep = true;            // prev = last word emitted; sep = a space (or line break) came after it
    for (const it of tc.items) {
      if (it.str === '' ) { sep = true; continue; }
      const st = tc.styles[it.fontName] || {}, size = Math.hypot(it.transform[2], it.transform[3]) || it.height;
      const vt=vp.transform, px=it.transform[4],py=it.transform[5];
      const x=vt[0]*px+vt[2]*py+vt[4], y=vt[1]*px+vt[3]*py+vt[5], desc = st.descent == null ? -0.2119 : st.descent;
      const top = y - (desc * size + size), bottom = y - desc * size, font = fname[it.fontName] || it.fontName;
      const tbl = /bold/i.test(font) ? BOLD : REG, chars = Array.from(it.str);
      let tot = 0; const adv = chars.map(ch => { const a = tbl[ch] != null ? tbl[ch] : 556; tot += a; return a; });
      const k = tot ? it.width / tot : 0; let cx = x, cur = null;
      for (let j = 0; j < chars.length; j++) {
        const a = adv[j] * k;
        if (chars[j] === ' ') { if (cur) { out.push(cur); prev = cur; cur = null; } sep = true; }
        else {
          if (!cur) {
            // start of a new word: glue to the previous fragment when nothing separates them (pdfplumber x_tolerance = 3)
            if (prev && !sep && Math.abs(prev.top - top) < 1 && prev.fontname === font && cx - prev.x1 <= 3 && cx - prev.x1 > -1) { cur = prev; out.pop(); }
            else cur = { text: '', x0: cx, x1: cx, top, bottom, fontname: font };
          }
          cur.text += chars[j]; cur.x1 = cx + a; sep = false;
        }
        cx += a;
      }
      if (cur) { out.push(cur); prev = cur; }
    }
    for (const w of out) { w.x0 = r2(w.x0); w.x1 = r2(w.x1); w.top = r2(w.top); w.bottom = r2(w.bottom); }
    return { width: vp.width, height: vp.height, words: out, warnings:fontWarning?[fontWarning]:[] };
  }
  const api = { pageWords };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PdfText = api;
})(typeof self !== 'undefined' ? self : this);

// extract.js - JS port of extract_docs.py: deterministic, geometry-based extractors for AppFolio-style PDF reports.
// Input: pages = [{width,height,words:[{text,x0,x1,top,bottom,fontname}]}] from pdftext.js.  Output: same JSON schema as the Python extractor.
(function (root) {
  const NUM = /^-?\(?[\d,]+\.\d{2}\)?$/;
  class Unsupported extends Error { constructor(m) { super(m); this.name = 'UnsupportedLayout'; } }
  const tonum = s => { const neg = s.startsWith('-') || (s.startsWith('(') && s.endsWith(')')); const v = parseFloat(s.replace(/,/g, '').replace(/\(/g, '').replace(/\)/g, '').replace(/-/g, '')); return neg ? -v : v; };
  const todate = s => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || ''); return m ? m[3] + '-' + m[1] + '-' + m[2] : null; };
  const rnd = (x, n) => { const f = Math.pow(10, n); const y = Math.round(x * f) / f; return Object.is(y, -0) ? 0 : y; };
  const cell = (raw, page, w) => ({ raw, page, x0: rnd(w[0], 1), x1: rnd(w[1], 1), top: rnd(w[2], 1), bottom: rnd(w[3], 1) });
  const bb = ws => [Math.min(...ws.map(w => w.x0)), Math.max(...ws.map(w => w.x1)), Math.min(...ws.map(w => w.top)), Math.max(...ws.map(w => w.bottom))];
  const wb = w => [w.x0, w.x1, w.top, w.bottom];
  function linesByTop(words, tol) {
    const sorted = words.slice().sort((a, b) => a.top - b.top || a.x0 - b.x0), out = [];
    for (const w of sorted) { const l = out[out.length - 1]; if (l && Math.abs(l.top - w.top) <= tol) l.w.push(w); else out.push({ top: w.top, w: [w] }); }
    for (const l of out) l.w.sort((a, b) => a.x0 - b.x0);
    return out;
  }
  function pageText(page) {             // like pdfplumber extract_text: lines (3pt tolerance) joined by \n, words by space
    const ls = linesByTop(page.words, 3); return ls.map(l => l.w.map(w => w.text).join(' ')).join('\n');
  }
  const R = (re, s) => re.exec(s);

  function rentRollTieOut(res) {
    const tie = [];
    for (const tkey of ['subtotal', 'grand']) {
      const pt = res.printed_totals[tkey];
      if (!pt && tkey === 'subtotal' && res.source && res.source.method && res.source.method !== 'pdf') continue;     // spreadsheets rarely print both a subtotal and a grand total
      if (!pt) { tie.push({ name: 'printed ' + tkey + ' present', ok: false, detail: 'no ' + tkey + ' row found' }); continue; }
      tie.push({ name: tkey + ': unit count', printed: pt.units, computed: res.units.length, ok: pt.units === res.units.length });
      const lenient = res.source && res.source.method && res.source.method !== 'pdf';
      if (lenient && (pt.units === null || pt.units === undefined)) { tie.pop(); }
      for (const f of ['sqft', 'rent', 'charges', 'deposit', 'past_due']) {
        const comp = rnd(res.units.reduce((a, u) => a + (u[f] || 0), 0), 2), pr = pt[f];
        if (lenient && (pr === null || pr === undefined)) { if (!res._skipNote) res._skipNote = []; res._skipNote.push(f); continue; }
        tie.push({ name: tkey + ': sum ' + f, printed: pr === undefined ? null : pr, computed: comp, ok: pr !== undefined && pr !== null && Math.abs(pr - comp) < 0.005 });
      }
    }
    const gt = res.printed_totals.grand;
    if (gt && gt.monthly_total !== undefined && gt.monthly_total !== null) { const comp = rnd(res.units.reduce((a, u) => a + (u.rent || 0) + (u.charges || 0), 0), 2); tie.push({ name: 'grand: sum rent + charges (printed monthly total)', printed: gt.monthly_total, computed: comp, ok: Math.abs(gt.monthly_total - comp) < 0.011 * Math.max(1, res.units.length) }); }
    if (gt && gt.annual_rent !== undefined && gt.annual_rent !== null) { const comp = rnd(res.units.reduce((a, u) => a + (u.rent || 0), 0) * 12, 2); tie.push({ name: 'grand: sum rent x 12 (printed annual base rent)', printed: gt.annual_rent, computed: comp, ok: Math.abs(gt.annual_rent - comp) < 0.011 * 12 * Math.max(1, res.units.length) }); }
    if (res._skipNote && res._skipNote.length) { res.issues = res.issues || []; res.issues.push('no printed total for ' + res._skipNote.filter((x, i, a) => a.indexOf(x) === i).join(', ') + ' on the document, so those columns could not be tied out (not checked, not passed)'); delete res._skipNote; }
    return tie;
  }
  function statementTieOut(res) {
    const tie = [];
    const under = prefix => res.lines.filter(l => (l.path + ' > ').startsWith(prefix + ' > ') || l.path === prefix);
    for (const l of res.lines) { const d = rnd(l.values.reduce((a, b) => a + b, 0) - l.total, 2); tie.push({ name: 'line row-sum: ' + l.label, printed: l.total, computed: rnd(l.values.reduce((a, b) => a + b, 0), 2), ok: Math.abs(d) < 0.005 }); }
    let incP = res.subtotals.filter(s => /^Total Operating\s+Income$/.test(s.label)), expP = res.subtotals.filter(s => /^Total Operating\s+Expense$/.test(s.label));
    if (!incP.length) incP = res.subtotals.filter(s => /^Total\s+(Operating\s+)?(Income|Revenues?)$/i.test(s.label));
    if (!expP.length) expP = res.subtotals.filter(s => /^Total\s+(Operating\s+)?Expenses?$/i.test(s.label));
    for (const s of res.subtotals) {
      if (s.closes_header && s.label.startsWith('Total')) {
        const kids = under(s.path); const comp = Array.from({ length: 12 }, (_, j) => rnd(kids.reduce((a, k) => a + k.values[j], 0), 2)); const compt = rnd(kids.reduce((a, k) => a + k.total, 0), 2);
        const ok = comp.every((c, j) => Math.abs(c - s.values[j]) < 0.011) && Math.abs(compt - s.total) < 0.011 && kids.length > 0;
        tie.push({ name: 'subtotal: ' + s.label + ' (closes "' + s.closes_header + '", ' + kids.length + ' lines)', printed: s.total, computed: compt, ok });
      }
    }
    if (incP.length && expP.length) {
      const ti = incP[0], te = expP[0];
      for (const s of res.subtotals) {
        if (s.label.startsWith('NOI') || s.label.startsWith('Net Income')) { const comp = rnd(ti.total - te.total, 2); tie.push({ name: 'derived: ' + s.label, printed: s.total, computed: comp, ok: Math.abs(comp - s.total) < 0.011 }); }
        if (s.label === 'Total Income') tie.push({ name: 'derived: Total Income = Total Operating Income', printed: s.total, computed: ti.total, ok: Math.abs(s.total - ti.total) < 0.011 });
        if (s.label === 'Total Expense') tie.push({ name: 'derived: Total Expense = Total Operating Expense', printed: s.total, computed: te.total, ok: Math.abs(s.total - te.total) < 0.011 });
      }
      if (res.source && res.source.method && res.source.method !== 'pdf') {
        const side = t => rnd(res.lines.filter(l => l.path.split(' > ')[1] === t).reduce((a, l) => a + l.total, 0), 2);
        tie.push({ name: 'printed "' + ti.label + '" = sum of income lines', printed: ti.total, computed: side('Income'), ok: Math.abs(ti.total - side('Income')) < 0.011 });
        tie.push({ name: 'printed "' + te.label + '" = sum of expense lines', printed: te.total, computed: side('Expense'), ok: Math.abs(te.total - side('Expense')) < 0.011 });
      }
    } else tie.push({ name: 'Total Operating Income/Expense found', ok: false, detail: 'missing' });
    return tie;
  }

  function extractRentroll(pages, src) {
    const res = { source: Object.assign({ pages: pages.length, doc_type: 'rent_roll' }, src), units: [], printed_totals: {}, meta: {}, issues: [] };
    const text0 = pageText(pages[0]);
    let m = R(/As of:\s*(\d{2}\/\d{2}\/\d{4})/, text0); res.meta.as_of = m ? todate(m[1]) : null;
    m = R(/Created on\s*(\d{2}\/\d{2}\/\d{4})/, text0); res.meta.created_on = m ? todate(m[1]) : null;
    if (!/Rent roll/i.test(text0) || !res.meta.as_of) throw new Unsupported('unsupported layout: this is not an AppFolio "Rent roll with Monthly Charges" report (no title / "As of" date found). Nothing was imported.');
    m = R(/Properties:\s*(.+)/, text0); res.meta.property_line = m ? m[1].trim() : null;
    for (const [key, pat] of [['title', /^(Rent roll[^\n]*)/m], ['units_filter', /Units:\s*([^\n]+)/m], ['include_non_revenue', /Include Non-Revenue Units:\s*(\w+)/m], ['include_advertised', /Include Advertised Rent:\s*(\w+)/m], ['base_report', /Base Report:\s*([^\n]+)/m]]) {
      const mm = R(pat, text0); res.meta[key] = mm ? mm[1].trim() : null;
    }
    if (res.meta.property_line) {
      const pm = R(/^(.+?) - (.+?)\s+(Washington|[A-Z][a-z]+),\s*([A-Z]{2})\s+(\d{5})/, res.meta.property_line);
      if (pm) { res.meta.property = pm[1]; res.meta.address = pm[3] + ', ' + pm[4] + ' ' + pm[5]; }
    }
    let seq = 0;
    pages.forEach((page, pi0) => {
      const pi = pi0 + 1; const words = page.words.filter(w => w.top > 160 && w.top < 585); let cur = null;
      for (const ln of linesByTop(words, 2.0)) {
        const ws = ln.w;
        const sq = ws.filter(w => w.x1 < 142 && w.x0 > 100 && /^[\d,]+$/.test(w.text));
        const unitWords = ws.filter(w => w.x0 < 100);
        const label = unitWords.map(w => w.text).join(' ');
        const lineText = ws.map(w => w.text).join(' ');
        if (/\b\d{5}\b/.test(lineText) && lineText.includes(' - ') && !ws.some(w => NUM.test(w.text) && w.x0 > 290)) { (res.meta.property_groups = res.meta.property_groups || []).push(lineText); cur = null; continue; }
        const isTotal = /^(Total\s+)?\d+\s+Units?$/i.test(label.trim()) || label.trim().toLowerCase().startsWith('total');
        if (sq.length && unitWords.length && !isTotal) {
          seq++;
          const u = { id: 'RR' + String(seq).padStart(3, '0'), unit: label, cells: {}, tenant: '', page: pi };
          u.cells.unit = cell(label, pi, bb(unitWords)); u.cells.sqft = cell(sq[0].text, pi, bb(sq)); u.sqft = tonum(sq[0].text); const ten = [];
          for (const w of ws) {
            const t = w.text;
            if (unitWords.includes(w) || sq.includes(w)) continue;
            if (135 <= w.x0 && w.x0 < 300 && !NUM.test(t)) ten.push(w);
            else if (NUM.test(t)) {
              let key = null;
              if (330 < w.x1 && w.x1 < 352) key = 'rent'; else if (415 < w.x1 && w.x1 < 442) key = 'charges'; else if (515 < w.x1 && w.x1 < 540) key = 'next_amt';
              else if (590 < w.x1 && w.x1 < 612) key = 'deposit'; else if (745 < w.x1 && w.x1 < 775) key = 'past_due';
              if (key) { u[key] = tonum(t); u.cells[key] = cell(t, pi, wb(w)); } else res.issues.push('unmapped numeric ' + t + ' on ' + label + ' p' + pi);
            }
            else if (430 <= w.x0 && w.x0 < 495) { u.next_date = todate(t); u.cells.next_date = cell(t, pi, wb(w)); }
            else if (605 <= w.x0 && w.x0 < 668) { u.lease_from = todate(t); u.cells.lease_from = cell(t, pi, wb(w)); }
            else if (670 <= w.x0 && w.x0 < 715) { u._to = t; u.cells.lease_to = cell(t, pi, wb(w)); }
          }
          if (ten.length) { u.tenant = ten.map(w => w.text).join(' '); u.cells.tenant = cell(u.tenant, pi, bb(ten)); }
          res.units.push(u); cur = u;
        } else if (cur !== null && !isTotal) {
          for (const w of ws) {
            if (670 <= w.x0 && w.x0 < 715) { cur._to = (cur._to || '') + w.text; cur.cells.lease_to.raw = cur._to; cur.cells.lease_to.bottom = rnd(w.bottom, 1); }
            else if (135 <= w.x0 && w.x0 < 300) { cur.tenant = (cur.tenant + ' ' + w.text).trim(); if (!cur.cells.tenant) cur.cells.tenant = cell('', pi, wb(w)); cur.cells.tenant.raw = cur.tenant; }
            else if (w.x0 < 100) { cur.unit += ' ' + w.text; cur.cells.unit.raw = cur.unit; }
          }
        } else if (isTotal) {
          cur = null; const nums = {};
          for (const w of ws) {
            if (NUM.test(w.text) || /^[\d,]+$/.test(w.text)) {
              const v = /^[\d,]+$/.test(w.text) ? tonum(w.text.replace(/,/g, '')) : tonum(w.text);
              if (w.x1 < 142) nums.sqft = v; else if (330 < w.x1 && w.x1 < 352) nums.rent = v; else if (415 < w.x1 && w.x1 < 442) nums.charges = v;
              else if (590 < w.x1 && w.x1 < 612) nums.deposit = v; else if (745 < w.x1 && w.x1 < 775) nums.past_due = v;
            }
          }
          const mu = R(/(\d+)\s+Units?/, label); nums.units = mu ? parseInt(mu[1], 10) : null;
          res.printed_totals[label.toLowerCase().startsWith('total') ? 'grand' : 'subtotal'] = Object.assign({ label }, nums, { page: pi });
        }
      }
    });
    for (const u of res.units) {
      u.lease_to = null;
      if (u._to) { const t = u._to; delete u._to; u.lease_to = todate(t) || null; if (!u.lease_to) res.issues.push('unparsed lease-to "' + t + '" for ' + u.unit); }
      delete u._to;
    }
    res.tie_out = rentRollTieOut(res);
    if (!res.units.length) throw new Unsupported('rent roll parsed but no unit rows were found; nothing was imported');
    return res;
  }

  const SUMMARY_RE = /^(Total\b|NOI\b|Net Income\b|Net Operating)/i;
  function extractIncomeStatement(pages, src) {
    const res = { source: Object.assign({ pages: pages.length, doc_type: 'income_statement_12_month' }, src), meta: {}, months: [], lines: [], subtotals: [], issues: [] };
    const t0 = pageText(pages[0]);
    const g = pat => { const m = R(pat, t0); return m ? m[1].trim() : null; };
    res.meta = { title: g(/^(Income Statement[^\n]*)/m), manager: g(/^Income Statement[^\n]*\n([^\n]+)/m), property_line: g(/Properties:\s*(.+)/), period_range: g(/Period Range:\s*(.+)/), basis: g(/Accounting Basis:\s*(.+)/),
      level: g(/Level of Detail:\s*(.+)/), zero_balance: g(/Include Zero Balance GL Accounts:\s*(.+)/), fund: g(/Fund Type:\s*(.+)/), gl_map: g(/GL Account Map:\s*(.+)/) };
    let m = R(/Created on\s*(\d{2}\/\d{2}\/\d{4})/, t0); res.meta.created_on = m ? todate(m[1]) : null;
    const pl = res.meta.property_line;
    if (pl) { const pm = R(/^(.+?) - (.+?)\s+(Washington|[A-Z][a-z]+),\s*([A-Z]{2})\s+(\d{5})/, pl); if (pm) { res.meta.property = pm[1]; res.meta.address = pm[3] + ', ' + pm[4] + ' ' + pm[5]; } }
    const w0 = pages[0].words;
    const hdrOf = ws => ws.filter(w => w.text === 'Account' && ws.some(x => x.text === 'Name' && Math.abs(x.top - w.top) < 2));
    const hdr0 = hdrOf(w0);
    if (!hdr0.length) throw new Unsupported('column header row not found: this is not an AppFolio 12-month income statement. Nothing was imported.');
    const ht = hdr0[0].top; const hl = w0.filter(w => Math.abs(w.top - ht) < 2 && w.x0 > 105).sort((a, b) => a.x0 - b.x0); const toks = hl.map(w => w.text);
    for (let i = 0; i < toks.length - 1;) { if (/^[A-Z][a-z]{2}$/.test(toks[i]) && /^\d{4}$/.test(toks[i + 1])) { res.months.push(toks[i] + ' ' + toks[i + 1]); i += 2; } else i++; }
    if (res.months.length !== 12) res.issues.push('expected 12 month columns, found ' + res.months.length);
    let rows = [];
    pages.forEach((page, pi0) => {
      const pi = pi0 + 1, words = page.words, hdr = hdrOf(words), top0 = hdr.length ? hdr[0].top + 4 : 0;
      const body = words.filter(w => w.top > top0 && w.top < 585);
      const lab = body.filter(w => w.x1 < 150.5 && !(w.x0 > 140)), num = body.filter(w => w.x0 >= 140 && NUM.test(w.text));
      const llines = linesByTop(lab, 0.8), nlines = linesByTop(num, 1.2);
      for (const nl of nlines) {
        let best = null, bd = Infinity; for (const l of llines) { const d = Math.abs(l.top - nl.top); if (d < bd) { bd = d; best = l; } }
        if (best === null || bd > 2.2) { res.issues.push('numeric line p' + pi + ' top ' + nl.top.toFixed(1) + ' has no label'); continue; }
        best.nums = nl.w;
      }
      const grp = [];
      for (const l of llines) { const lastG = grp[grp.length - 1]; if (lastG && (l.top - lastG[lastG.length - 1].top) < 12.5 && !l.nums) lastG.push(l); else grp.push([l]); }
      for (const g_ of grp) {
        const first = g_[0]; let nums = null; for (const l of g_) if (l.nums) nums = l.nums;
        const labelWs = g_.flatMap(l => l.w), label = labelWs.map(w => w.text).join(' ');
        rows.push({ page: pi, top: first.top, x0: first.w[0].x0, label, bold: first.w[0].fontname.includes('Bold'), nums, num_bold: !!(nums && nums[0].fontname.includes('Bold')), bbox: bb(labelWs), first_on_page: g_ === grp[0] });
      }
    });
    const merged = [];
    for (const r of rows) {
      const last = merged[merged.length - 1];
      if (last && r.first_on_page && r.page > last.page && r.nums === null && last.nums !== null && last.bold && Math.abs(r.x0 - last.x0) < 0.5 && last.label.startsWith('Total')) {
        const headers = merged.filter(h => h.nums === null && h.bold).map(h => h.label);
        const cand = (last.label.slice(6) + ' ' + r.label).trim();
        if (headers.includes(cand)) { last.label = last.label + ' ' + r.label; last.merged_across_page = true; continue; }
      }
      merged.push(r);
    }
    rows = merged;
    const stack = []; let seq = 0; const pathOf = () => stack.map(h => h.label).join(' > ');
    for (const r of rows) {
      if (r.nums === null) {
        if (!r.bold) { res.issues.push('unlabelled non-numeric row p' + r.page + ' "' + r.label + '"'); continue; }
        while (stack.length && stack[stack.length - 1].x0 >= r.x0 - 0.1) stack.pop();
        stack.push({ label: r.label, x0: r.x0 }); continue;
      }
      const vals = r.nums.map(w => tonum(w.text)), raws = r.nums.map(w => w.text);
      if (vals.length !== 13) { res.issues.push('row "' + r.label + '" p' + r.page + ' has ' + vals.length + ' numeric cells (expected 13)'); continue; }
      const cells = raws.map((t, k) => cell(t, r.page, wb(r.nums[k])));
      const isSum = r.num_bold || SUMMARY_RE.test(r.label);
      if (isSum) {
        let closes = null; for (let i = stack.length - 1; i >= 0; i--) if (Math.abs(stack[i].x0 - r.x0) < 0.6) { closes = stack[i].label; break; }
        res.subtotals.push({ label: r.label, page: r.page, top: rnd(r.top, 1), values: vals.slice(0, 12), total: vals[12], cells, closes_header: closes, path: pathOf(), merged_across_page: !!r.merged_across_page });
        if (closes) { while (stack.length && stack[stack.length - 1].label !== closes) stack.pop(); if (stack.length) stack.pop(); }
      } else {
        seq++; res.lines.push({ id: 'IS' + String(seq).padStart(3, '0'), label: r.label, path: pathOf(), indent: rnd(r.x0, 1), page: r.page, top: rnd(r.top, 1), values: vals.slice(0, 12), total: vals[12], cells });
      }
    }
    res.tie_out = statementTieOut(res);
    if(blanks)res.tie_out.push({label:'Blank source month cells require review',ok:false,detail:blanks+' cells use zero only for calculation. Confirm that convention against the source, or correct/map the values.'});
    return res;
  }
  const api = { extractRentroll, extractIncomeStatement, rentRollTieOut, statementTieOut, Unsupported, pageText, tonum, todate, linesByTop, rnd };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Extract = api;
})(typeof self !== 'undefined' ? self : this);

// importer.js - JS port of uw_import.py: turns extracted JSON (rent roll, statement, CoStar) into workbook edits, review items and provenance.
// Every proposal (classification, rent evidence, exceptions) is deterministic and logged on the review sheet for an analyst to accept, modify or reject.
(function (root) {
  // python-style fixed formatting: exact binary ties round half-to-even ('%.0f' % 96.5 == '96'), unlike JS toFixed
  if (!Number.prototype.pyFixed) Object.defineProperty(Number.prototype, 'pyFixed', { value: function (dp) {
    const x = Number(this), f = Math.pow(10, dp), sc = x * f;
    if (Number.isFinite(sc) && Math.abs(sc - Math.trunc(sc)) === 0.5 && Math.abs(sc) < 1e15) { const fl = Math.floor(sc); return ((fl % 2 === 0 ? fl : fl + 1) / f).toFixed(dp); }
    return x.toFixed(dp); } });
  const EPOCH = Date.UTC(1899, 11, 30);
  const serial = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000);
  const dObj = n => new Date(EPOCH + Math.trunc(n) * 86400000);
  const ds = iso => { if (!iso) return null; const [y, m, d] = iso.split('-').map(Number); return serial(y, m, d); };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const Y = n => dObj(n).getUTCFullYear(), M = n => dObj(n).getUTCMonth() + 1, D = n => dObj(n).getUTCDate();
  const fmtD = n => n === null || n === undefined ? '' : String(M(n)).padStart(2, '0') + '/' + String(D(n)).padStart(2, '0') + '/' + Y(n);
  const monYr = n => MON[M(n) - 1] + ' ' + Y(n);
  const commas = (x, dp) => { const s = Math.abs(x).pyFixed(dp), [i, f] = s.split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : ''); };
  const money = v => v < 0 ? '-$' + commas(v, 2) : '$' + commas(v, 2);
  const sgn1 = x => (x < 0 ? '-' : '+') + Math.abs(x).pyFixed(1);
  const rnd2 = x => { const y = Number(x.pyFixed(2)); return Object.is(y, -0) ? 0 : y; };
  const median = a => { const s = a.slice().sort((x, y) => x - y), n = s.length, h = n >> 1; return n % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
  const monthSerial = label => { const [m, y] = label.split(' '); return serial(+y, MON.indexOf(m) + 1, 1); };
  const normName = s => (s || '').toLowerCase().replace(/inc/g, '').replace(/llc/g, '').replace(/[^a-z0-9]/g, '');
  const colnum = c => { let n = 0; for (const ch of c) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  const collet = n => { let s = ''; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  const truthy = v => v !== null && v !== undefined && v !== '' && v !== 0 && !Number.isNaN(v);

  // ------------------------------------------------------------------------------------------------ schema (rules table comes from spec.json)
  function makeSchema(spec) {
    const CODE2NAME = {}; for (const c of spec.categories) CODE2NAME[c[0]] = c[1];
    const rules = spec.rules.map(r => ({ rid: r[0], scope: r[1], rx: r[2], code: r[3], ml: r[4], meth: r[5], sev: r[6], why: r[7], re: r[2] === '.*' ? null : new RegExp(r[2]) }));
    function classify(type, label, path) {
      const txt = (label || '').toLowerCase(), ptx = (path || '').toLowerCase();
      for (const r of rules) {
        if (r.scope !== type) continue;
        if (r.rx === '.*') return [r.rid, CODE2NAME[r.code], r.ml, r.meth, r.sev, r.why];
        if (r.re.test(txt)) return [r.rid, CODE2NAME[r.code], r.ml, r.meth, r.sev, r.why];
        if (type === 'Expense' && r.rid === 'R20' && /common area|cam\b/.test(ptx)) return [r.rid, CODE2NAME[r.code], r.ml, r.meth, r.sev, r.why];
      }
      throw new Error('no rule');
    }
    return { classify, CATEGORIES: spec.categories, SPIKE_SHARE: spec.spike_share, SPIKE_MIN: spec.spike_min };
  }

  // ------------------------------------------------------------------------------------------------ CoStar page text
  function extractCostar(txt, file, md5hex, spec) {
    const out = { file, md5: md5hex, values: {}, tenants: [] };
    for (const [k, [rx, typ]] of Object.entries(spec.cs_patterns)) {
      const m = new RegExp(rx).exec(txt);
      if (!m) { out.values[k] = null; continue; }
      const g = m[1];
      if (k === 'tax_psf') { out.values[k] = '$' + m[1] + '/SF (' + m[2] + ')'; continue; }
      out.values[k] = typ === 'int' ? parseInt(g.replace(/,/g, ''), 10) : typ === 'float' ? parseFloat(g) : g.trim();
    }
    const tm = /Tenants\s*\nName\s*\nSF Occupied\s*\n([\s\S]*?)\nStable/.exec(txt);
    if (tm) { const parts = tm[1].split('\n').map(p => p.trim()).filter(p => p); for (let i = 0; i < parts.length - 1; i += 2) out.tenants.push([parts[i], parseInt(parts[i + 1].replace(/,/g, ''), 10)]); }
    return out;
  }

  // ------------------------------------------------------------------------------------------------ the importer
  const pyNum = v => Number.isInteger(v) ? v + '.0' : String(v);      // python str(float)
  const eQ = r => 'IF(C' + r + '="","",IF(O' + r + '="Rejected","",IF(M' + r + '<>"",M' + r + ',IF(OR(O' + r + '="Approved",O' + r + '="Not Applicable",O' + r + '="Corrected"),H' + r + ',IF(OR(UW_Mode="Draft",J' + r + '="Informational"),H' + r + ',"")))))';
  const api = { extractCostar, ds, fmtD, serial, collet, colnum, money };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.UWImporter = api;
})(typeof self !== 'undefined' ? self : this);

// xlpatch.js - edits an .xlsx package in place (XML level) so every existing part of the template workbook survives untouched.
// edits: [sheetName, cell, kind('n'|'s'|'f'|'x'|'h'), value, styleId?]   ('h': cell = any cell in the row; value 1 hides the row, 0 marks it collapsed)
(function (root) {
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const isNode = typeof process !== 'undefined' && process.versions && process.versions.node && typeof DOMParser === 'undefined';
  let DP, XS;
  if (isNode) { const x = require('@xmldom/xmldom'); DP = new x.DOMParser(); XS = new x.XMLSerializer(); } else { DP = new DOMParser(); XS = new XMLSerializer(); }
  const parse = s => DP.parseFromString(s, 'application/xml');
  const ser = d => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + XS.serializeToString(d).replace(/^<\?xml[^>]*\?>\s*/, '');
  const colnum = c => { let n = 0; for (const ch of c) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  const split = ref => { const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref); return [m[1], parseInt(m[2], 10)]; };
  const kids = (el, name) => Array.from(el.childNodes).filter(n => n.nodeType === 1 && n.localName === name);

  async function sheetMap(zip) {
    const wb = parse(await zip.file('xl/workbook.xml').async('string')), rel = parse(await zip.file('xl/_rels/workbook.xml.rels').async('string'));
    const rm = {}; for (const r of Array.from(rel.getElementsByTagName('Relationship'))) rm[r.getAttribute('Id')] = r.getAttribute('Target');
    const out = {};
    for (const s of Array.from(wb.getElementsByTagName('sheet'))) { let t = rm[s.getAttributeNS(RNS, 'id') || s.getAttribute('r:id')].replace(/^\//, ''); out[s.getAttribute('name')] = t.startsWith('xl/') ? t : 'xl/' + t; }
    return out;
  }

  async function applyEdits(zip, edits) {
    const sm = await sheetMap(zip), by = new Map();
    for (const e of edits) { if (!by.has(e[0])) by.set(e[0], []); by.get(e[0]).push(e.slice(1)); }
    for (const [sh, lst] of by) {
      if (!sm[sh]) throw new Error('template has no sheet "' + sh + '" - is this the selected template profile?');
      const p = sm[sh], doc = parse(await zip.file(p).async('string')), root_ = doc.documentElement, sd = kids(root_, 'sheetData')[0];
      const rows = new Map(); for (const r of kids(sd, 'row')) rows.set(parseInt(r.getAttribute('r'), 10), r);
      const touched = new Set(lst.map(x => x[0]));
      for (const [cell, kind, val, sty] of lst) {
        const [col, rn] = split(cell); let row = rows.get(rn);
        if (kind === 'h') {   // row visibility: 1 = hide (outline level 1), 0 = mark as the collapsed summary row
          if (!row) throw new Error('h edit: no row ' + rn + ' on ' + sh);
          if (val) { row.setAttribute('hidden', '1'); row.setAttribute('outlineLevel', '1'); } else row.setAttribute('collapsed', '1');
          continue;
        }
        if (!row) {
          row = doc.createElementNS(NS, 'row'); row.setAttribute('r', String(rn));
          const before = kids(sd, 'row').filter(r => parseInt(r.getAttribute('r'), 10) < rn);
          if (before.length) { const last = before[before.length - 1]; if (last.nextSibling) sd.insertBefore(row, last.nextSibling); else sd.appendChild(row); }
          else sd.insertBefore(row, sd.firstChild);
          rows.set(rn, row);
        }
        let c = kids(row, 'c').find(ce => ce.getAttribute('r') === cell);
        if (!c) {
          c = doc.createElementNS(NS, 'c'); c.setAttribute('r', cell);
          const after = kids(row, 'c').find(ce => colnum(split(ce.getAttribute('r'))[0]) > colnum(col));
          if (after) row.insertBefore(c, after); else row.appendChild(c);
          if (row.hasAttribute('spans')) row.removeAttribute('spans');
        }
        const fOld = kids(c, 'f')[0];
        if (fOld && fOld.getAttribute('t') === 'shared' && fOld.getAttribute('ref')) {
          const si = fOld.getAttribute('si');
          for (const ce of Array.from(root_.getElementsByTagName('c'))) { const fe = kids(ce, 'f')[0]; if (fe && fe.getAttribute('t') === 'shared' && fe.getAttribute('si') === si && !touched.has(ce.getAttribute('r'))) throw new Error('shared formula group on ' + sh + ' has untouched member ' + ce.getAttribute('r')); }
        }
        if (fOld && fOld.getAttribute('t') === 'array') throw new Error('refusing to overwrite array formula ' + sh + '!' + cell);
        while (c.firstChild) c.removeChild(c.firstChild);
        if (c.hasAttribute('t')) c.removeAttribute('t');
        if (sty !== undefined && sty !== null) c.setAttribute('s', String(sty));
        if (kind === 'n') { const v = doc.createElementNS(NS, 'v'); v.appendChild(doc.createTextNode(String(val))); c.appendChild(v); }
        else if (kind === 's') {
          c.setAttribute('t', 'inlineStr'); const is = doc.createElementNS(NS, 'is'), t = doc.createElementNS(NS, 't'); t.appendChild(doc.createTextNode(val));
          if (val !== val.trim()) t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve'); is.appendChild(t); c.appendChild(is);
        } else if (kind === 'f') { const f = doc.createElementNS(NS, 'f'); f.appendChild(doc.createTextNode(val.replace(/^=+/, ''))); c.appendChild(f); }
        else if (kind !== 'x') throw new Error('bad kind ' + kind);
      }
      zip.file(p, ser(doc), { createFolders: false });
    }
  }

  // blank template -> filled template. Cached formula results are dropped so no stale numbers survive; Excel recalculates on open (fullCalcOnLoad).
  async function fill(JSZip, templateBytes, edits) {
    const zip = await JSZip.loadAsync(templateBytes, { createFolders: false });
    await applyEdits(zip, edits);
    const wbp = 'xl/workbook.xml'; let wbx = await zip.file(wbp).async('string');
    if (!/fullCalcOnLoad/.test(wbx)) wbx = wbx.replace(/<calcPr /, '<calcPr fullCalcOnLoad="1" '); zip.file(wbp, wbx, { createFolders: false });
    if (zip.file('xl/calcChain.xml')) zip.remove('xl/calcChain.xml');
    return zip;
  }
  const api = { applyEdits, fill, sheetMap, parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.XlPatch = api;
})(typeof self !== 'undefined' ? self : this);

// tabular.js - deterministic readers for Excel / CSV rent rolls and operating statements, plus validation of AI-read JSON.
// Everything produced here has the same shape as the PDF extractors' output and runs through the SAME tie-out functions.
(function (root) {
  const EX = typeof require !== 'undefined' ? require('./extract.js') : root.Extract;
  const { rentRollTieOut, statementTieOut, Unsupported, rnd } = EX;
  const norm = s => String(s === null || s === undefined ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], MONC = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = n => String(n).padStart(2, '0');
  const isoOf = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);

  // ---------- cell helpers: grid cells are primitives, or {d:'YYYY-MM-DD'} for date-formatted Excel cells
  function sheetGrid(XLSX, ws) {
    const ref = ws['!ref']; if (!ref) return [];
    const rg = XLSX.utils.decode_range(ref), g = [];
    for (let r = rg.s.r; r <= rg.e.r; r++) {
      const row = [];
      for (let c = rg.s.c; c <= rg.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })]; let v = null;
        if (cell && cell.v !== undefined && cell.v !== null && cell.v !== '') {
          const p = cell.t === 'n' && cell.z && XLSX.SSF.is_date(cell.z) && cell.v > 20000 ? XLSX.SSF.parse_date_code(cell.v) : null;
          if (p) v = { d: isoOf(p.y, p.m, p.d), raw: cell.w || String(cell.v) };
          else if (cell.t === 'd' && cell.v instanceof Date) v = { d: isoOf(cell.v.getUTCFullYear(), cell.v.getUTCMonth() + 1, cell.v.getUTCDate()), raw: cell.w || '' };
          else v = cell.v;
        }
        row.push(v);
      }
      g.push(row);
    }
    return g;
  }
  const txt = v => v === null || v === undefined ? '' : (typeof v === 'object' && v.d ? v.raw || v.d : String(v)).trim();
  function toNum(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'object') return null;
    let s = String(v).trim(); if (!s || /^[-–—]+$/.test(s)) return null;
    const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s); s = s.replace(/[$,()\s-]/g, '');
    if (!/^\d*\.?\d+$/.test(s)) return null; const n = parseFloat(s); return neg ? -n : n;
  }
  function toDate(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'object' && v.d) return v.d;
    if (typeof v === 'number' && v > 20000 && v < 80000) { const t = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); return isoOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }
    const s = String(v).trim(); let m;
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) return isoOf(+m[3], +m[1], +m[2]);
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(s))) return isoOf(2000 + +m[3], +m[1], +m[2]);
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return isoOf(+m[1], +m[2], +m[3]);
    if ((m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s)) && MON.includes(m[1].toLowerCase())) return isoOf(+m[3], MON.indexOf(m[1].toLowerCase()) + 1, +m[2]);
    return null;
  }
  function monthOf(v) {            // month column header -> {y,m} or null
    if (v === null || v === undefined) return null;
    if (typeof v === 'object' && v.d) { const [y, m] = v.d.split('-').map(Number); return { y, m }; }
    if (typeof v === 'number' && v > 20000 && v < 80000) { const t = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 }; }
    const s = String(v).trim(); let m;
    if ((m = /^([A-Za-z]{3})[a-z]*[\s\-'\/\.]+(\d{2}|\d{4})$/.exec(s)) && MON.includes(m[1].toLowerCase())) return { y: m[2].length === 2 ? 2000 + +m[2] : +m[2], m: MON.indexOf(m[1].toLowerCase()) + 1 };
    if ((m = /^(\d{4})[-\/](\d{1,2})$/.exec(s))) return { y: +m[1], m: +m[2] };
    if ((m = /^(\d{1,2})\/(\d{4})$/.exec(s))) return { y: +m[2], m: +m[1] };
    const d = toDate(v); if (d) { const [y, mm] = d.split('-').map(Number); return { y, m: mm }; }
    return null;
  }

  // ---------- rent roll
  const RR_HDR = {
    unit: ['unit', 'suite', 'space', 'unitno', 'unitnumber', 'unitname', 'unitid', 'premises', 'suiteno', 'suitenumber', 'spaceid','suiteunit','unitcode','premisesid'],
    tenant: ['tenant', 'tenantname', 'lessee', 'occupant', 'leasename', 'tenantlessee', 'currenttenant', 'name','tenanttradename','tenantcompany'],
    sqft: ['sqft', 'sf', 'squarefeet', 'squarefootage', 'area', 'rsf', 'nsf', 'rentablesf', 'leasedsf', 'sqftleased', 'rentablearea', 'unitsf', 'sizesf', 'size','areasf','occupiedsf','leasablesf'],
    rent: ['rent', 'monthlyrent', 'baserent', 'currentrent', 'contractrent', 'monthlybaserent', 'basemonthlyrent', 'rentmonthly', 'currentmonthlyrent', 'annualrent', 'annualbaserent', 'baserentannual', 'rentannual', 'rentamount', 'marketrent','annualizedrent','annualizedbaserent','baserentperannum'],
    charges: ['monthlycharges', 'charges', 'cam', 'camcharges', 'nnn', 'nnncharges', 'recoveries', 'reimbursements', 'additionalrent', 'monthlycam', 'camnnn', 'opexrecovery'],
    next_date: ['nextrentincreasedate', 'nextincreasedate', 'nextstepdate', 'nextescalationdate', 'nextbumpdate', 'escalationdate', 'nextrentchangedate'],
    next_amt: ['nextrentincreaseamount', 'nextincreaseamount', 'nextrent', 'nextstepamount', 'nextrentamount', 'rentafterincrease'],
    lease_from: ['leasefrom', 'leasestart', 'leasestartdate', 'start', 'startdate', 'commencement', 'commencementdate', 'leasecommencement', 'leasecommencementdate', 'from', 'moveindate', 'begin', 'begindate'],
    lease_to: ['leaseto', 'leaseend', 'leaseenddate', 'end', 'enddate', 'expiration', 'expirationdate', 'expiry', 'leaseexpiration', 'leaseexpirationdate', 'leaseexpiry', 'termination', 'to', 'expires', 'maturity'],
    deposit: ['deposit', 'securitydeposit', 'secdeposit', 'depositheld'],
    past_due: ['pastdue', 'arrears', 'delinquent', 'balance', 'pastduebalance', 'amountpastdue', 'outstanding'],
  };
  function matchHeader(cell) {
    const n = norm(cell); if (!n) return null;
    if (/psf|persf|\/sf|sqftrate|persquare/.test(String(cell).toLowerCase().replace(/\s/g, '')) && /rent|charge|cam|nnn/.test(n)) return null;
    const n2 = n.replace(/annual|yearly|monthly|permonth|peryear|\bper\b/g, '');
    for (const [f, syns] of Object.entries(RR_HDR)) if (syns.includes(n) || (n2 && syns.includes(n2))) return f;
    return null;
  }
  function findAsOf(grid, maxRows) {
    for (let r = 0; r < Math.min(maxRows, grid.length); r++) for (let c = 0; c < grid[r].length; c++) {
      const t = txt(grid[r][c]); const m = /as\s*of[:\s]*(.*)$/i.exec(t);
      if (m) { const d = toDate(m[1].trim()) || toDate(grid[r][c + 1]) || toDate(grid[r][c + 2]); if (d) return d; }
      else if (/^as\s*of$/i.test(t)) { const d = toDate(grid[r][c + 1]); if (d) return d; }
    }
    return null;
  }
  function readRentRollGrid(grid, src, opts) {
    opts = opts || {};
    let hr = -1, map = null, headerCells=null, bestScore=0;
    for (let r = 0; r < Math.min(grid.length, 80); r++) for(let span=1;span<=3&&r+span<=grid.length;span++) {
      const cells=Array.from({length:Math.max(...grid.slice(r,r+span).map(row=>row.length))},(_,c)=>grid.slice(r,r+span).map(row=>txt(row[c])).filter(Boolean).join(' '));
      const m = {}; cells.forEach((c, i) => { const f = matchHeader(c); if (f && !(f in m)) m[f] = i; });
      const hasKey = ('unit' in m || 'tenant' in m) && ('rent' in m || 'sqft' in m),score=Object.keys(m).length+('rent'in m?3:0);
      if (Object.keys(m).length >= 3 && hasKey&&score>bestScore) { hr = r+span-1; map = m;headerCells=cells;bestScore=score; }
    }
    if (hr < 0) throw new Unsupported('no rent-roll header row found (need columns such as Unit/Suite, Tenant, SF, Rent). Nothing was imported.');
    const hdrText = f => txt(headerCells[map[f]]);
    const annual = /annual|yearly|\/yr|peryear|perannum|p\.?a\.?\b/i.test(hdrText('rent').replace(/\s/g, '').length ? hdrText('rent') : '');
    const annualChg = map.charges !== undefined && /annual|yearly|\/yr|per year/i.test(hdrText('charges'));
    const as_of = opts.asOf || findAsOf(grid, hr + 1);
    const res = { source: Object.assign({ doc_type: 'rent_roll', method: 'excel', sheet: src.sheet || '' }, src), units: [], printed_totals: {}, meta: { as_of, created_on: opts.createdOn || null, title: 'Rent roll (' + (src.file || '') + ')', property_line: null }, issues: [] };
    if (annual) res.issues.push('rent column "' + hdrText('rent') + '" is annual: divided by 12 to monthly');
    if (annualChg) res.issues.push('charges column "' + hdrText('charges') + '" is annual: divided by 12 to monthly');
    res.meta.annual_converted = annual;
    let seq = 0, blankRun = 0;
    for (let r = hr + 1; r < grid.length; r++) {
      const row = grid[r], get = f => map[f] === undefined ? null : row[map[f]];
      const unit = txt(get('unit')), tenant = txt(get('tenant'));
      const isBlank = row.every(c => c === null || txt(c) === '');
      if (isBlank) { if (++blankRun >= 3 && res.units.length) break; continue; } blankRun = 0;
      const label = unit || tenant;
      if (/^(grand\s+)?total\b|^subtotal\b|^totals?\b/i.test(label) || (!unit && /^total/i.test(txt(row[0])))) {
        const nums = {}; for (const f of ['sqft', 'rent', 'charges', 'deposit', 'past_due']) { const v = toNum(get(f)); if (v !== null) nums[f] = (f === 'rent' && annual) || (f === 'charges' && annualChg) ? v / 12 : v; }
        const mu = /(\d+)\s*units?/i.exec(label); nums.units = mu ? +mu[1] : null;
        res.printed_totals[/^total/i.test(label) || /^grand/i.test(label) ? 'grand' : 'subtotal'] = Object.assign({ label, page: 1 }, nums); continue;
      }
      const sqft = toNum(get('sqft')); if (!unit && sqft === null && toNum(get('rent')) === null) continue;
      if (!unit && !tenant) continue;
      seq++; const id = 'RR' + String(seq).padStart(3, '0'), addr = r + 1;
      const u = { id, unit: unit || tenant, cells: {}, tenant: unit ? tenant : '', page: 1 };
      const cellRef = (f, raw) => ({ raw: String(raw), page: 1, ref: (src.sheet ? src.sheet + '!' : '') + colLetter(map[f]) + addr });
      u.cells.unit = cellRef('unit' in map ? 'unit' : 'tenant', unit || tenant);
      u.sqft = sqft === null ? 0 : sqft; u.cells.sqft = cellRef('sqft', sqft === null ? '' : sqft);
      if (u.tenant) u.cells.tenant = cellRef('tenant', tenant);
      for (const f of ['rent', 'charges', 'next_amt', 'deposit', 'past_due']) {
        const raw = get(f); let v = toNum(raw); if (v === null) continue;
        if ((f === 'rent' && annual) || (f === 'charges' && annualChg)) v = rnd(v / 12, 2);
        u[f] = v; u.cells[f] = cellRef(f, raw);
      }
      for (const f of ['next_date', 'lease_from', 'lease_to']) {
        const raw = get(f); if (raw === null || raw === undefined || txt(raw) === '') continue;
        const d = toDate(raw);
        if (d) { u[f] = d; u.cells[f] = cellRef(f, typeof raw === 'object' ? raw.raw || raw.d : raw); }
        else { res.issues.push('unparsed ' + f + ' "' + txt(raw) + '" for ' + u.unit); u[f] = null; }
      }
      if (u.lease_to === undefined) u.lease_to = null;
      res.units.push(u);
    }
    if (!res.units.length) throw new Unsupported('rent roll header found but no unit rows were read; nothing was imported');
    if (!res.printed_totals.grand) {   // no printed totals: tie-out would be circular, so say so
      const sum = f => rnd(res.units.reduce((a, u) => a + (u[f] || 0), 0), 2);
      res.printed_totals.grand = { label: 'Total (computed here - the file has no totals row)', units: res.units.length, sqft: sum('sqft'), rent: sum('rent'), charges: sum('charges'), deposit: sum('deposit'), past_due: sum('past_due'), page: 1, computed: true };
      res.issues.push('the file has no totals row, so the tie-out against a printed total is circular and proves nothing');
    }
    res.tie_out = rentRollTieOut(res);
    const missingRent=res.units.filter(u=>u.tenant&&u.rent==null);if(missingRent.length){res.issues.push('Base rent is missing for '+missingRent.map(u=>u.unit).join(', ')+'. Enter the missing amounts; blank does not mean verified zero.');res.tie_out.push({name:'Occupied rows have readable base rent',ok:false,detail:missingRent.length+' occupied rows need rent review'});}
    if(!('charges' in map))res.issues.push('No CAM / reimbursement column was supplied. Confirm recovery obligations from leases or enter them manually.');
    return res;
  }
  const colLetter = i => { let n = i + 1, s = ''; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

  // ---------- operating statement
  function readStatementGrid(grid, src, opts) {
    opts = opts || {};
    let hr = -1, mcols = [];
    for (let r = 0; r < Math.min(grid.length, 60); r++) {
      const cols = []; grid[r].forEach((c, i) => { const m = monthOf(c); if (m) cols.push({ i, y: m.y, m: m.m }); });
      if (cols.length >= 12) {                                           // take the first 12 consecutive month columns
        for (let s = 0; s + 12 <= cols.length; s++) { const w = cols.slice(s, s + 12); let ok = true; for (let k = 1; k < 12; k++) { const a = w[k - 1].y * 12 + w[k - 1].m, b = w[k].y * 12 + w[k].m; if (b !== a + 1) ok = false; } if (ok) { hr = r; mcols = w; break; } }
        if (hr >= 0) break;
      }
    }
    if (hr < 0) throw new Unsupported('no 12-month header row found (need twelve consecutive month columns). Nothing was imported.');
    const first = mcols[0].i, totalCol = (() => { const t = grid[hr][mcols[11].i + 1]; return t !== undefined && /total|ytd|annual|12\s*mo/i.test(txt(t)) ? mcols[11].i + 1 : -1; })();
    const months = mcols.map(c => MONC[c.m - 1] + ' ' + c.y);
    const res = { source: Object.assign({ doc_type: 'income_statement_12_month', method: 'excel', sheet: src.sheet || '' }, src), meta: { title: 'Operating statement (' + (src.file || '') + ')', property_line: null, period_range: months[0] + ' - ' + months[11], basis: opts.basis || null, created_on: opts.createdOn || null }, months, lines: [], subtotals: [], issues: [] };
    const above = grid.slice(0, hr).map(r => r.map(txt).join(' ')).join('\n');
    const mb = /(cash|accrual)\s*basis/i.exec(above); if (!res.meta.basis && mb) res.meta.basis = mb[1][0].toUpperCase() + mb[1].slice(1).toLowerCase();
    const stack = []; let seq = 0, blanks = 0, noTotal = false;
    const pathOf = () => stack.map(h => h.label).join(' > ');
    for (let r = hr + 1; r < grid.length; r++) {
      const row = grid[r]; let li = -1; for (let i = 0; i < first; i++) if (txt(row[i]) !== '') { li = i; break; }
      const label0 = li >= 0 ? String(row[li]) : ''; const label = label0.trim();
      const vals = mcols.map(c => toNum(row[c.i])); const present = vals.filter(v => v !== null).length;
      const depth = li < 0 ? 0 : li * 100 + (label0.length - label0.trimStart().length);
      if (!label && present === 0) continue;
      if (!label) { res.issues.push('numbers without a label at row ' + (r + 1)); continue; }
      if (present === 0) {                                              // header
        if (/^(total|net|noi)\b/i.test(label)) continue;
        while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
        stack.push({ label, depth }); continue;
      }
      if (present < 12) blanks += 12 - present;
      const v12 = vals.map(v => v === null ? 0 : v); let total = totalCol >= 0 ? toNum(row[totalCol]) : null;
      if (total === null) { total = rnd(v12.reduce((a, b) => a + b, 0), 2); noTotal = true; }
      const cells = v12.map((v, k) => ({ raw: String(row[mcols[k].i] === null ? '' : txt(row[mcols[k].i])), page: 1, ref: (src.sheet ? src.sheet + '!' : '') + colLetter(mcols[k].i) + (r + 1) }));
      cells.push({ raw: totalCol >= 0 ? txt(row[totalCol]) : '(computed)', page: 1, ref: (src.sheet ? src.sheet + '!' : '') + (totalCol >= 0 ? colLetter(totalCol) : '') + (r + 1) });
      const isSum = /^(total|net\s+operating|net\s+income|noi\b)/i.test(label);
      if (isSum) {
        let closes = null; const want = norm(label.replace(/^total\s*/i, ''));
        for (let i = stack.length - 1; i >= 0 && !closes; i--) if (want && norm(stack[i].label) === want) closes = stack[i].label;
        for (let i = stack.length - 1; i >= 0 && !closes; i--) if (want && norm(stack[i].label).length >= 4 && want.includes(norm(stack[i].label))) closes = stack[i].label;   // "Total Operating Income" closes header "Income"
        res.subtotals.push({ label, page: 1, top: r + 1, values: v12, total, cells, closes_header: closes, path: pathOf(), merged_across_page: false });
        if (closes) { while (stack.length && stack[stack.length - 1].label !== closes) stack.pop(); if (stack.length) stack.pop(); }
      } else {
        seq++; res.lines.push({ id: 'IS' + String(seq).padStart(3, '0'), label, path: pathOf(), indent: depth, page: 1, top: r + 1, values: v12, total, cells });
      }
    }
    if (!res.lines.length) throw new Unsupported('statement header found but no account lines were read; nothing was imported');
    // build the "Operating Income & Expense > Income|Expense > ..." path the importer expects
    // Section = first path segment that is clearly income OR clearly expense (a container such as
    // "Operating Income & Expense" mentions both and is skipped).
    const segSec = g => { const x = g.toLowerCase(), inc = /income|revenue|receipt|sales/.test(x), exp = /expense|cost|disburse|opex/.test(x); return inc && !exp ? 'Income' : exp && !inc ? 'Expense' : null; };
    const reroot = p => { const segs = p ? p.split(' > ') : []; for (let i = 0; i < segs.length; i++) { const sec = segSec(segs[i]); if (sec) return { sec, path: 'Operating Income & Expense > ' + sec + (segs.length > i + 1 ? ' > ' + segs.slice(i + 1).join(' > ') : '') }; } return null; };
    for (const l of res.lines) {
      const rr = reroot(l.path); if (!rr) throw new Unsupported('cannot tell whether "' + l.label + '" is income or expense: its section "' + (l.path.split(' > ')[0] || '(none)') + '" is not recognisable. Nothing was imported.');
      l.path = rr.path;
    }
    for (const s of res.subtotals) { const rr = reroot(s.path); if (rr) s.path = rr.path; }
    res.meta.blank_cells = blanks; res.meta.no_total_column = noTotal;
    if (blanks) res.issues.push(blanks + ' blank month cells inside account rows were read as zero');
    if (noTotal) res.issues.push('no Total column: row totals were computed from the months, so the row-sum tie-out is circular');
    res.tie_out = statementTieOut(res);
    return res;
  }


  // ---------- single-period (annual / YTD) statement from PDF text lines: "Label  1,234.56" rows under INCOME / EXPENSES headings
  const MONTHS3 = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function spread12(total, k) { k = k || 12; const each = rnd(total / k, 2), v = Array(12).fill(0); for (let i = 0; i < k; i++) v[i] = each; v[k - 1] = rnd(total - each * (k - 1), 2); return v; }
  function readAnnualStatement(text, src) {
    if(/January\s+February\s+March/i.test(text)||/\bpro[ -]?forma\b/i.test(text))throw new Unsupported('Monthly or pro forma columns require their own reviewed reader; not a single annual actual.');
    const lines = String(text).split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const AMT = /^(.*?[A-Za-z\)].*?)\s+(\(?-?\$?[\d,]*\d\.\d{2}\)?-?)$/;
    const num = t => { const neg = /^\(.*\)$/.test(t) || /^-/.test(t) || /-$/.test(t); const v = parseFloat(t.replace(/[^\d.]/g, '')); return neg ? -v : v; };
    let ym = null, basis = null, created = null;
    for (const l of lines.slice(0, 25)) {
      let m = /(?:thru|through|ending|ended|as of|for the year(?: ended)?)[:\s]+([A-Za-z]{3})[a-z]*\.?\s+(?:\d{1,2},?\s+)?(\d{4})/i.exec(l); if (m && !ym) ym = { y: +m[2], m: MON.indexOf(m[1].toLowerCase()) + 1 };
      if (!ym && (m = /(?:december|year ended|fiscal year)\D{0,15}(\d{4})/i.exec(l))) ym = { y: +m[1], m: 12 };
      if (!basis && (m = /\b(accrual|cash)\b/i.exec(l)) && l.length < 40) basis = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
      if (!created && (m = /\bdate:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(l))) created = toDate(m[1]);
    }
    const hasInc = lines.some(l => /^(total\s+)?(operating\s+)?(income|revenues?)\b/i.test(l)), hasExp = lines.some(l => /^(total\s+)?(operating\s+)?expenses?\b/i.test(l));
    if (!ym || !hasInc || !hasExp || !lines.some(l => AMT.test(l))) throw new Unsupported('not a single-period income statement (no period-end, income and expense sections found). Nothing was imported.');
    const year = ym.y, months = MONTHS3.map(m => m + ' ' + year), covered = ym.m;
    const res = { source: Object.assign({ doc_type: 'income_statement_annual', method: 'pdf-annual', pages: 1 }, src), meta: { title: 'Operating statement, annual total (' + (src.file || '') + ')', property_line: null, period_range: 'Year to ' + MONTHS3[ym.m - 1] + ' ' + year, period_end: year * 100 + ym.m, basis, created_on: created }, months, lines: [], subtotals: [], issues: [] };
    const stack = []; let seq = 0, sec = null, belowNoi = false, noiSeen = false; const below = [], derived = [];
    const kidsSince = (h) => res.lines.filter(l => l._h === h);
    for (const l of lines) {
      const m = AMT.exec(l);
      if (!m) {
        if (/^(database|report|format|page|time|year-to-date|actual|accrual|cash|thru)\b/i.test(l) || /^[A-Za-z]+-\w+/.test(l)) continue;
        if (/^(income|revenues?|operating income|rental income)$/i.test(l)) { sec = 'Income'; belowNoi = false; stack.length = 0; stack.push({ label: l, h: l }); continue; }
        if (/^(operating\s+)?expenses?$/i.test(l)) { sec = 'Expense'; belowNoi = false; stack.length = 0; stack.push({ label: l, h: l }); continue; }
        if (noiSeen || /non-?operating|other expense|other income|below/i.test(l)) { belowNoi = true; stack.length = 0; stack.push({ label: l, h: l }); continue; }
        stack.push({ label: l, h: l }); continue;
      }
      const label = m[1].trim(), v = num(m[2]);
      if (/^total\b|^net\b|^noi\b/i.test(label)) {
        const want = norm(label.replace(/^total\s*/i, '')), top = stack[stack.length - 1];
        const kids = top && !belowNoi ? kidsSince(top.h) : [], ksum = rnd(kids.reduce((a, k) => a + k.total, 0), 2);
        if (/^total\b/i.test(label) && !belowNoi && top && kids.length && Math.abs(ksum - v) < 0.011) {
          res.subtotals.push({ label, page: 1, top: lines.indexOf(l) + 1, values: spread12(v, covered), total: v, cells: Array(13).fill({ raw: m[2], page: 1 }), closes_header: top.label, path: 'Operating Income & Expense > ' + sec + (stack.length > 1 ? ' > ' + stack.slice(1).map(x => x.label).join(' > ') : ''), merged_across_page: false });
          stack.pop(); continue;
        }
        if (/^total\b/i.test(label) && belowNoi) { below.push([label, v]); continue; }
        if (/^(net operating income|noi)\b/i.test(label)) { noiSeen = true; belowNoi = true; derived.push([label, v]); continue; }
        if (/^net\b/i.test(label) || /after/i.test(label)) { derived.push([label, v]); continue; }
        if (/^total\b/i.test(label) && !kids.length) { if (belowNoi) below.push([label, v]); else { /* a one-line total with no detail is itself an account */ } if (belowNoi) continue; }
      }
      if (belowNoi) { below.push([label, v]); continue; }
      if (!sec) { res.issues.push('line "' + label + '" appears before any INCOME / EXPENSES heading and was not loaded'); continue; }
      seq++;
      const path = 'Operating Income & Expense > ' + sec + (stack.length > 1 ? ' > ' + stack.slice(1).map(x => x.label).join(' > ') : '');
      const ln = { id: 'IS' + String(seq).padStart(3, '0'), label, path, indent: stack.length, page: 1, top: lines.indexOf(l) + 1, values: spread12(v, covered), total: v, cells: Array(13).fill({ raw: m[2], page: 1 }), _h: stack[stack.length - 1] ? stack[stack.length - 1].h : '' };
      res.lines.push(ln);
    }
    res.meta.source_period={mode:covered<12?'ytd':'annual',year,throughMonth:covered};
    res.lines.forEach(l => delete l._h);
    if (!res.lines.length) throw new Unsupported('no account lines were read; nothing was imported');
    const sumT = t => rnd(res.lines.filter(l => l.path.split(' > ')[1] === t).reduce((a, l) => a + l.total, 0), 2);
    const inc = sumT('Income'), exp = sumT('Expense');
    res.issues.push('this statement prints ONE annual total per account (' + res.meta.period_range + ', ' + covered + ' month' + (covered === 1 ? '' : 's') + ' assumed, counted from January), not monthly columns. Each total was spread evenly over those ' + covered + ' months so the model can run; the true monthly pattern, one-time items and seasonality cannot be seen. Treat annualization and spike checks as uninformative for this file');
    if (below.length) res.issues.push('lines below NOI were NOT loaded into the model (they are financing or non-operating): ' + below.map(b => b[0] + ' ' + b[1].toFixed(2)).join('; '));
    // tie-outs
    res.tie_out = statementTieOut(res).filter(t => !/Total Operating Income\/Expense found/.test(t.name));
    const nd = derived.find(d => /^(net operating income|noi)/i.test(d[0]));
    if (nd) res.tie_out.push({ name: 'printed ' + nd[0] + ' = income lines - expense lines', printed: nd[1], computed: rnd(inc - exp, 2), ok: Math.abs(nd[1] - (inc - exp)) < 0.011 });
    const ti = res.subtotals.find(s => /income|revenue/i.test(s.label)), te = res.subtotals.find(s => /expense/i.test(s.label));
    if (!ti) res.tie_out.push({ name: 'printed total income found and equal to the income lines', ok: false, detail: 'not found' });
    if (!te) res.tie_out.push({ name: 'printed total expenses found and equal to the expense lines', ok: false, detail: 'not found' });
    return res;
  }

  // ---------- AI-read JSON (Claude): same shape, validated before use
  const nz = v => { const n = toNum(v); return n === null ? null : n; };
  function fromAI(kind, obj, src) {
    if (!obj || typeof obj !== 'object') throw new Unsupported('the AI answer is not a JSON object');
    if (kind === 'rent_roll') {
      const us = obj.units; if (!Array.isArray(us) || !us.length) throw new Unsupported('AI answer has no "units" array');
      const res = { source: Object.assign({ doc_type: 'rent_roll', method: 'ai' }, src), units: [], printed_totals: {}, meta: { as_of: toDate(obj.as_of) || obj.as_of || null, created_on: toDate(obj.created_on) || obj.created_on || null, title: 'Rent roll (AI-read: ' + (src.file || '') + ')', property: obj.property || null, address: obj.address || null }, issues: ['read by an AI model, not a fixed parser: verify against the source document'] };
      us.forEach((x, i) => {
        const id = 'RR' + String(i + 1).padStart(3, '0'), u = { id, unit: String(x.unit || ''), cells: {}, tenant: (x.tenant || '').trim(), page: x.page || 1 };
        if (!u.unit) throw new Unsupported('AI answer: unit ' + (i + 1) + ' has no unit name');
        if(toNum(x.rent)===null)throw new Unsupported('Suite '+u.unit+' has no readable base rent. Enter a verified rent, or explicit zero for a vacant space, before applying.');
        u.sqft = toNum(x.sqft) === null ? 0 : toNum(x.sqft); u.cells.unit = { raw: u.unit, page: u.page }; u.cells.sqft = { raw: String(x.sqft === undefined ? '' : x.sqft), page: u.page }; if (u.tenant) u.cells.tenant = { raw: u.tenant, page: u.page };
        for (const f of ['rent', 'charges', 'next_amt', 'deposit', 'past_due']) { const v = toNum(x[f]); if (v !== null) { u[f] = v; u.cells[f] = { raw: String(x[f]), page: u.page }; } }
        for (const f of ['next_date', 'lease_from', 'lease_to']) { if (x[f] === null || x[f] === undefined || x[f] === '') { if (f === 'lease_to') u.lease_to = null; continue; } const d = toDate(x[f]); if (d) { u[f] = d; u.cells[f] = { raw: String(x[f]), page: u.page }; } else { res.issues.push('unparsed ' + f + ' "' + x[f] + '" for ' + u.unit); if (f === 'lease_to') u.lease_to = null; } }
        if (u.lease_to === undefined) u.lease_to = null;
        { const lt = String(x.lease_type || '').trim(), m = /^(nnn|triple)/i.test(lt) ? 'NNN' : /^(modified|mg)/i.test(lt) ? 'Modified Gross' : /^(gross|fs|full)/i.test(lt) ? 'Gross' : /^(nn)\b/i.test(lt) ? 'Modified Gross' : null; if (m) u.lease_type = m; }
        { const ep = toNum(x.escalation_pct); if (ep !== null && ep > 0 && ep < 30) u.escalation_pct = ep; }
        if (u.escalation_pct && u.lease_from && (res.meta.as_of) && !u.next_date && u.rent > 0) {
          const lf = /^(\d{4})-(\d{2})-(\d{2})$/.exec(u.lease_from), ao = /^(\d{4})-(\d{2})-(\d{2})$/.exec(res.meta.as_of);
          if (lf && ao) { let y = +ao[1]; const cand = yy => yy + '-' + lf[2] + '-' + lf[3]; if (cand(y) <= res.meta.as_of) y++; if (y > +lf[1]) { u.next_date = cand(y); u.next_amt = rnd(u.rent * (1 + u.escalation_pct / 100), 2); u.cells.next_date = { raw: '(computed from ' + u.escalation_pct + '% annual escalation)', page: u.page }; u.cells.next_amt = { raw: '(computed)', page: u.page }; res.issues.push('next rent step for ' + u.unit + ' (' + u.next_date + ', ' + u.next_amt.toFixed(2) + ') was COMPUTED from the stated ' + u.escalation_pct + '% annual escalation and the lease anniversary; it is not a printed step'); } }
        }
        res.units.push(u);
      });
      const pt = obj.printed_totals || obj.totals;
      if (pt) res.printed_totals.grand = { label: 'Total (as printed, AI-read)', units: pt.units === undefined ? null : pt.units, sqft: nz(pt.sqft), rent: nz(pt.rent), charges: nz(pt.charges), deposit: nz(pt.deposit), past_due: nz(pt.past_due), monthly_total: nz(pt.monthly_total), annual_rent: nz(pt.annual_rent), page: 1 };
      else { const sum = f => rnd(res.units.reduce((a, u) => a + (u[f] || 0), 0), 2); res.printed_totals.grand = { label: 'Total (computed here - none was printed)', units: res.units.length, sqft: sum('sqft'), rent: sum('rent'), charges: sum('charges'), deposit: sum('deposit'), past_due: sum('past_due'), page: 1, computed: true }; res.issues.push('no printed totals were supplied, so the tie-out is circular'); }
      if (obj.escalation_note) res.issues.push('escalation stated on the rent roll: ' + obj.escalation_note + '. The model does not apply it from the roll; it grows rent at its own growth rate after the last scheduled step. Compare');
      if (obj.column_used) res.issues.push('amount column used: ' + obj.column_used);
      (Array.isArray(obj.reader_notes) ? obj.reader_notes : []).slice(0, 8).forEach(n => res.issues.push('unclear or assumed by the reader: ' + n));
      if (obj.all_leases_nnn === true) res.meta.all_nnn = true;
      res.tie_out = rentRollTieOut(res); return res;
    }
    const annual = obj.period === 'annual' || obj.period === 'ytd';
    let lines = obj.lines, months = obj.months; const below = [];
    if (annual) {
      const yr = parseInt(obj.year, 10); if (!(yr > 1990 && yr < 2100)) throw new Unsupported('AI answer for an annual statement needs a "year"');
      months = MONTHS3.map(m => m + ' ' + yr); var cov = parseInt(obj.through_month, 10); cov = cov >= 1 && cov <= 12 ? cov : 12;
      const keep = (obj.lines || []);
      lines = keep.map(x => { const t = toNum(x.total); if (t === null) throw new Unsupported('AI answer: annual line "' + x.label + '" has no total'); return Object.assign({}, x, { values: spread12(t, cov), total: t }); });
      obj = Object.assign({}, obj, { subtotals: (obj.subtotals || []).filter(x => toNum(x.total) !== null && !x.below_noi).map(x => Object.assign({}, x, { values: spread12(toNum(x.total), cov), total: toNum(x.total) })) });
    }
    if (!Array.isArray(months) || months.length !== 12) throw new Unsupported('AI answer needs exactly 12 month labels like "Jan 2026"');
    if (!Array.isArray(lines) || !lines.length) throw new Unsupported('AI answer has no "lines" array');
    const res = { source: Object.assign({ doc_type: 'income_statement_12_month', method: 'ai' }, src), meta: { title: 'Operating statement (AI-read: ' + (src.file || '') + ')', period_range: obj.period_range || months[0] + ' - ' + months[11], basis: obj.basis || null, created_on: toDate(obj.created_on) || null, property: obj.property || null, address: obj.address || null }, months: months.map(String), lines: [], subtotals: [], issues: ['read by an AI model, not a fixed parser: verify against the source document'] };
    const secOf = s => /income|revenue|receipt/i.test(s) && !/expense/i.test(s) ? 'Income' : 'Expense';
    lines.forEach((x, i) => {
      if (!Array.isArray(x.values) || x.values.length !== 12) throw new Unsupported('AI answer: line "' + x.label + '" needs 12 monthly values');
      if(x.values.some(v=>toNum(v)===null))throw new Unsupported('Line "'+x.label+'" contains an unreadable or missing monthly amount. Correct it from the source; unknown amounts are not zero.');
      const vals = x.values.map(v => toNum(v)), total = toNum(x.total) === null ? rnd(vals.reduce((a, b) => a + b, 0), 2) : toNum(x.total);
      const sec = x.type === 'Income' || x.type === 'Expense' ? x.type : secOf(String(x.section || x.path || ''));
      const path = 'Operating Income & Expense > ' + sec + (x.group ? ' > ' + x.group : '');
      res.lines.push({ id: 'IS' + String(i + 1).padStart(3, '0'), label: String(x.label), group: x.group || null, monthly_due: toNum(x.monthly_due), path, indent: 0, page: x.page || 1, top: i + 1, values: vals, total, cells: vals.map(v => ({ raw: String(v), page: x.page || 1 })).concat([{ raw: String(total), page: x.page || 1 }]) });
    });
    (obj.subtotals || []).forEach(x => {
      const vals = (x.values || []).map(v => toNum(v) || 0); if (vals.length !== 12) return;
      const sec = x.type === 'Income' || x.type === 'Expense' ? x.type : secOf(String(x.label));
      res.subtotals.push({ label: String(x.label), page: 1, top: 0, values: vals, total: toNum(x.total) === null ? rnd(vals.reduce((a, b) => a + b, 0), 2) : toNum(x.total), cells: vals.map(v => ({ raw: String(v), page: 1 })).concat([{ raw: String(x.total), page: 1 }]), closes_header: x.closes_header || null, path: x.closes_header ? 'Operating Income & Expense > ' + sec + (x.group ? ' > ' + x.group : '') : '', merged_across_page: false });
    });
    if (obj.column_used) res.issues.push('amount column used: ' + obj.column_used + ' (other columns on the page were ignored)');
    (Array.isArray(obj.reader_notes) ? obj.reader_notes : []).slice(0, 8).forEach(n => res.issues.push('unclear or assumed by the reader: ' + n));
    if(annual)res.meta.source_period={mode:obj.period,year:parseInt(obj.year,10),throughMonth:cov};
    if (annual) { res.issues.push('this statement prints ONE total per account for ' + (cov < 12 ? 'January to ' + MONTHS3[cov - 1] : 'the year') + ' ' + obj.year + ' (' + cov + ' month' + (cov === 1 ? '' : 's') + (obj.period === 'ytd' ? ', year-to-date, start assumed January' : '') + '), not monthly columns. Each total was spread evenly over those ' + cov + ' months so the model can run; the true monthly pattern, one-time items and seasonality cannot be seen. Treat annualization and spike checks as uninformative for this file'); res.meta.period_end = parseInt(obj.year, 10) * 100 + cov; if (below.length) res.issues.push('lines below NOI were NOT loaded into the model (they are financing or non-operating): ' + below.join('; ')); }
    res.tie_out = statementTieOut(res); return res;
  }
  const api = { sheetGrid, readRentRollGrid, readStatementGrid, readAnnualStatement, fromAI, toNum, toDate, monthOf, matchHeader };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Tabular = api;
})(typeof self !== 'undefined' ? self : this);

// docs.js - leases, plats / drawings (area takeoff) and property lookups -> workbook edits.
// Claude only READS these documents into small JSON objects (prompts below). All arithmetic (traverse closure, polygon area, unit
// conversion, rent-schedule selection) is plain deterministic code here, and every result keeps its source and a flag when it is unsure.
(function (root) {
  const EPOCH = Date.UTC(1899, 11, 30);
  const serial = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000);
  const ds = iso => { if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null; const [y, m, d] = iso.split('-').map(Number); return serial(y, m, d); };
  const num = v => { if (typeof v === 'number') return Number.isFinite(v) ? v : null; if (typeof v === 'string') { const n = Number(v.replace(/[$,%\s]/g, '')); return v.trim() !== '' && Number.isFinite(n) ? n : null; } return null; };
  const r2 = x => Math.round(x * 100) / 100;
  const commas = x => Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const STOP = new Set(['inc', 'llc', 'ltd', 'corp', 'company', 'the', 'and', 'group', 'holdings', 'suite', 'unit', 'tenant', 'lp', 'llp']);
  const toks = s => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w));
  const normUnit = s => String(s || '').toLowerCase().replace(/\b(suite|unit|ste|space|bldg|building|apt|#)\b/g, '').replace(/[^a-z0-9]/g, '');

  // ============================================================================================== area math
  const FT = { ft: 1, feet: 1, foot: 1, "'": 1, m: 3.280839895, meter: 3.280839895, meters: 3.280839895, metre: 3.280839895, chain: 66, chains: 66, rod: 16.5, rods: 16.5, perch: 16.5, pole: 16.5, link: 0.66, links: 0.66, in: 1 / 12, inch: 1 / 12 };
  function toFeet(v, unit) { const n = num(v); if (n === null) return null; const f = FT[String(unit || 'ft').toLowerCase()]; return f === undefined ? n : n * f; }

  // bearing text -> azimuth degrees clockwise from north. Handles N 45°30'15" E, S12-30E, N45.5E, due east, North, "azimuth 135".
  function parseBearing(b) {
    if (b === null || b === undefined) return null;
    if (typeof b === 'number') return ((b % 360) + 360) % 360;
    let s = String(b).trim().toLowerCase().replace(/due\s+/, '').replace(/[º˚]/g, '°');
    const word = { north: 0, northeast: 45, east: 90, southeast: 135, south: 180, southwest: 225, west: 270, northwest: 315, n: 0, e: 90, s: 180, w: 270 };
    if (word[s] !== undefined) return word[s];
    let m = /^az(?:imuth)?\.?\s*([\d.]+)/.exec(s); if (m) return ((Number(m[1]) % 360) + 360) % 360;
    m = /^([ns])\s*([\d.]+)\s*(?:[°\-\s]\s*(\d+(?:\.\d+)?)?\s*(?:['’\-\s]\s*(\d+(?:\.\d+)?)?\s*(?:["”]|'')?)?)?\s*([ew])$/.exec(s.replace(/\s+/g, ' ').replace(/(\d)\s*°/g, '$1°'));
    if (!m) { m = /^([ns])\s*(\d+(?:\.\d+)?)\s*°?\s*(?:(\d+(?:\.\d+)?)\s*['’]?)?\s*(?:(\d+(?:\.\d+)?)\s*(?:["”]|'')?)?\s*([ew])$/.exec(s); }
    if (!m) return null;
    const deg = Number(m[2]) + (m[3] ? Number(m[3]) / 60 : 0) + (m[4] ? Number(m[4]) / 3600 : 0);
    if (deg > 90.0001) return null;
    const ns = m[1], ew = m[5];
    return ns === 'n' ? (ew === 'e' ? deg : 360 - deg) : (ew === 'e' ? 180 - deg : 180 + deg);
  }

  // courses: [{bearing | azimuth_deg, distance, unit?, curve?: {direction:'left'|'right', radius, unit?}}]
  // Returns {area (sf), perimeter (ft), misclosure (ft), ratio (perimeter/misclosure), points, flags}
  function traverse(courses) {
    const flags = []; let x = 0, y = 0, per = 0, A2 = 0, segs = [];
    const pts = [[0, 0]];
    for (let i = 0; i < courses.length; i++) {
      const c = courses[i], az = c.azimuth_deg !== undefined && c.azimuth_deg !== null ? parseBearing(Number(c.azimuth_deg)) : parseBearing(c.bearing);
      const d = toFeet(c.distance_ft !== undefined ? c.distance_ft : c.distance, c.distance_ft !== undefined ? 'ft' : c.unit);
      if (az === null || d === null || !(d >= 0)) return { error: 'course ' + (i + 1) + ' has no readable bearing or distance (' + JSON.stringify(c.bearing || c.azimuth_deg) + ', ' + JSON.stringify(c.distance_ft !== undefined ? c.distance_ft : c.distance) + ')' };
      const th = az * Math.PI / 180, nx = x + d * Math.sin(th), ny = y + d * Math.cos(th);
      A2 += x * ny - nx * y; per += d;
      if (c.curve && num(c.curve.radius) > 0 && /^(left|right)$/i.test(c.curve.direction || '')) {
        const R = toFeet(c.curve.radius, c.curve.unit), s = Math.min(1, d / (2 * R)), th2 = 2 * Math.asin(s);
        segs.push({ seg: R * R / 2 * (th2 - Math.sin(th2)), left: /^left$/i.test(c.curve.direction) });
      }
      x = nx; y = ny; pts.push([x, y]);
    }
    const mis = Math.hypot(x, y);
    // the closing edge (x,y)->(0,0) adds x*0 - 0*y = 0 to the shoelace sum, so nothing to add
    let area = A2 / 2, ccw = area >= 0;
    area = Math.abs(area);
    for (const s of segs) area += (s.left === ccw) ? s.seg : -s.seg;       // outward bulge adds, inward bulge subtracts
    const ratio = mis < 1e-9 ? Infinity : per / mis;
    if (ratio < 1000) flags.push('does not close: misclosure ' + r2(mis) + ' ft over a ' + r2(per) + ' ft perimeter (1:' + commas(ratio) + '). Check the courses against the document');
    else if (ratio < 5000) flags.push('closes to only 1:' + commas(ratio));
    if (courses.length < 3) flags.push('fewer than 3 courses');
    return { area, perimeter: per, misclosure: mis, ratio, points: pts, flags, curves: segs.length };
  }

  // One takeoff item from the drawing reader -> {area, method, flags, note}
  function itemArea(it) {
    const flags = [], printed = (() => { const sf = num(it.printed_area_sf), ac = num(it.printed_area_acres); return sf > 0 ? sf : ac > 0 ? ac * 43560 : null; })();
    let area = null, method = null, note = '', floors = Math.max(1, Math.round(num(it.floors) || 1));
    const courses = Array.isArray(it.courses) ? it.courses.filter(c => c && (c.bearing || c.azimuth_deg !== undefined)) : [];
    if (courses.length >= 3) {
      const t = traverse(courses);
      if (t.error) flags.push(t.error); else {
        area = t.area * floors; method = 'Polygon (scaled drawing)'; t.flags.forEach(f => flags.push(f));
        note = courses.length + ' courses, perimeter ' + r2(t.perimeter) + ' ft' + (t.curves ? ', ' + t.curves + ' curve(s) as circular segments' : '') + (floors > 1 ? ', x' + floors + ' floors' : '');
        if (floors > 1) note += ' (area = footprint x floors)';
      }
    }
    if (area === null) {
      const L = toFeet(it.length_ft !== undefined ? it.length_ft : it.length, it.unit_len), W = toFeet(it.width_ft !== undefined ? it.width_ft : it.width, it.unit_len);
      if (L > 0 && W > 0) { area = L * W * floors; method = 'Length x width'; note = r2(L) + ' ft x ' + r2(W) + ' ft' + (floors > 1 ? ' x ' + floors + ' floors' : ''); }
    }
    if (area === null && printed) { area = printed; method = 'Printed on document'; note = 'area as printed on the document (not measured)'; }
    if (area !== null && printed && method !== 'Printed on document') {
      const dv = area / printed - 1;
      if (Math.abs(dv) > 0.05) flags.push('computed ' + commas(area) + ' SF differs from the printed ' + commas(printed) + ' SF by ' + (dv * 100).toFixed(1) + '%');
    }
    if (area === null) flags.push('no usable dimensions, courses or printed area');
    return { area: area === null ? null : r2(area), printed, method, flags, note, floors };
  }

  // ============================================================================================== prompts
  const COMMON = 'You are extracting data from a commercial real estate document for an underwriting workbook. Return ONLY one JSON object, no commentary, no code fence. Copy numbers exactly as printed. Never estimate, round or infer: use null when a value is not printed. If a value is hard to read, give your best reading and list it in "reader_notes" (array of strings). Dates are YYYY-MM-DD.';
  const LEASE_SCHEMA = '{"doc_type":"lease","tenant":string|null,"landlord":string|null,"property":string|null,"unit":string|null (suite / space / building named in the lease),"sqft":number|null,"sqft_basis":"rentable"|"usable"|"gross"|null,"lease_type":"NNN"|"Modified Gross"|"Gross"|"Absolute NNN"|"Ground"|null,"commencement":date|null,"expiration":date|null,"base_rent":[{"from":date|null,"to":date|null,"monthly":number|null,"annual":number|null,"psf_annual":number|null,"page":number|null}],"annual_escalation_pct":number|null (a fixed yearly increase written as a percent, e.g. 3 for 3%),"reimbursements":[{"category":"tax"|"insurance"|"cam"|"utilities"|"repairs"|"management"|"trash"|"pest"|"telecom"|"other","share":"pro_rata"|"fixed_pct"|"none"|"unclear","pct":number|null,"cap":string|null,"base_year":string|null,"note":string|null,"page":number|null}],"security_deposit":number|null,"renewal_options":string|null,"termination_rights":string|null,"notes":[string],"reader_notes":[string]}';
  function leasePrompt(text) {
    return COMMON + '\nDocument type: LEASE (or lease abstract / amendment). One object for the whole document. List every base rent period in "base_rent" in date order (a rent schedule table gives one entry per row; a flat rent gives one entry). "share": pro_rata = tenant pays its proportionate share (square footage divided by building area) of that cost; fixed_pct = tenant pays a stated percentage (put it in "pct" as a number such as 25 for 25%); none = landlord pays / excluded; unclear = the lease mentions it but the split is not clear. Put caps, base years, exclusions and administrative fees in "cap", "base_year" or "note". If the lease is triple net and does not list categories, include one entry per category the lease says the tenant pays.\nSCHEMA: ' + LEASE_SCHEMA + '\n\nDOCUMENT TEXT:\n' + text;
  }
  const DRAWING_SCHEMA = '{"doc_type":"drawing","kind":"plat"|"site_plan"|"floor_plan"|"elevation"|"survey"|"other","scale":string|null,"scale_is_printed":boolean,"items":[{"label":string (lot / building / suite / floor as labelled),"area_type":"land"|"building"|"floor"|"suite"|"other" (land = a lot or parcel; building = a whole building footprint or gross area; floor = one floor of a building; suite = one leasable space),"unit":string|null (suite or building name that matches a tenant or rent-roll unit),"page":number|null,"floors":number|null,"printed_area_sf":number|null,"printed_area_acres":number|null,"length_ft":number|null,"width_ft":number|null,"courses":[{"bearing":string,"distance":number,"unit":"ft"|"m"|"chain"|"rod"|"link","curve":null|{"direction":"left"|"right","radius":number}}]|null,"confidence":"high"|"medium"|"low","notes":string|null}],"reader_notes":[string]}';
  function drawingPrompt(text) {
    return COMMON + '\nDocument type: PLAT, SURVEY, SITE PLAN, FLOOR PLAN or ARCHITECTURAL DRAWING (image or text). One entry in "items" per lot, building, suite or floor that has a stated area or dimensions. Only copy what is PRINTED: printed areas (square feet or acres), printed dimensions along the edges (feet), and metes-and-bounds calls (bearing and distance, in order around the boundary, e.g. "N 45°30\'00\\" E", 100.00 ft). Put a rectangle\'s printed length and width in length_ft and width_ft; put a non-rectangular outline as ordered "courses" from a stated bearing and distance (for a rectilinear building use bearings such as N, E, S, W with the printed dimension of each side). Do NOT measure anything on the picture with a ruler or by pixel position and do NOT use the scale to invent dimensions; if a dimension is not printed, leave it null. "floors" = number of floors the area applies to (for a floor plan of one floor use 1). Use "confidence":"low" when text is blurry or you were unsure which dimension belongs to which shape.\nSCHEMA: ' + DRAWING_SCHEMA + '\n\nDOCUMENT TEXT (may be empty for a pure image; read the attached images):\n' + text;
  }
  const LOOKUP_KEYS = [['year_built', 'Year built', 'integer'], ['stories', 'Number of stories', 'integer'], ['land_sf', 'Land area in square feet (convert acres x 43,560)', 'number'], ['zoning', 'Zoning designation', 'text'],
    ['max_far', 'Maximum floor area ratio allowed by that zoning', 'number'], ['parcel', 'Parcel / APN / lot number (SSL in DC)', 'text'], ['assessed', 'Current total assessed value (land + improvements) in dollars', 'number'],
    ['tax_rate', 'Real property tax rate for this property class and jurisdiction as a decimal fraction of assessed value (1.65% = 0.0165)', 'number'], ['tax_bill', 'Most recent annual real estate tax bill in dollars', 'number'],
    ['walk', 'Walk Score (0-100) from walkscore.com', 'integer'], ['transit', 'Transit Score (0-100) from walkscore.com', 'integer'], ['bike', 'Bike Score (0-100) from walkscore.com', 'integer'], ['submarket', 'Commercial real estate submarket name', 'text']];
  function lookupPrompt(address, name) {
    return COMMON + '\nTask: use web search to find public facts about the property at: ' + address + (name ? ' (' + name + ')' : '') + '. Use official or primary sources where possible (county / city tax assessor and tax bill pages, zoning map or code, walkscore.com). Return {"doc_type":"lookup","values":{KEY:{"value":..., "source":"page title or site","url":string|null,"note":string|null}}} with these KEYS (omit a key or set value null when you cannot find it from a credible page; NEVER guess): ' +
      LOOKUP_KEYS.map(k => k[0] + ' = ' + k[1] + ' (' + k[2] + ')').join('; ') + '. Also add "matched_address": the address the pages actually describe, so a wrong-property match can be caught.';
  }
  const CLASSIFY_PROMPT = 'Look at this document (text and/or page images from a commercial real estate file). Answer with ONLY one word: rent_roll, statement (operating or income statement), lease (a lease, amendment or lease abstract), drawing (plat, survey, site plan, floor plan or architectural drawing), or other.';

  // ============================================================================================== normalizers (Claude JSON -> clean objects)
  function normLease(o, file) {
    const sched = (Array.isArray(o.base_rent) ? o.base_rent : []).map(r => ({ from: /^\d{4}-\d{2}-\d{2}$/.test(r && r.from || '') ? r.from : null, to: /^\d{4}-\d{2}-\d{2}$/.test(r && r.to || '') ? r.to : null, monthly: num(r && r.monthly), annual: num(r && r.annual), psf: num(r && r.psf_annual), page: num(r && r.page) }));
    const reimb = (Array.isArray(o.reimbursements) ? o.reimbursements : []).filter(r => r && r.category).map(r => ({ category: String(r.category).toLowerCase(), share: String(r.share || 'unclear').toLowerCase(), pct: num(r.pct), cap: r.cap || null, base_year: r.base_year || null, note: r.note || null, page: num(r.page) }));
    const dt = v => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
    return { file, tenant: o.tenant || null, landlord: o.landlord || null, property: o.property || null, unit: o.unit || null, sqft: num(o.sqft), sqft_basis: o.sqft_basis || null, lease_type: normLT(o.lease_type), commencement: dt(o.commencement), expiration: dt(o.expiration), schedule: sched,
      esc: num(o.annual_escalation_pct), reimb, deposit: num(o.security_deposit), renewal: o.renewal_options || null, termination: o.termination_rights || null, notes: Array.isArray(o.notes) ? o.notes.map(String) : [], reader_notes: Array.isArray(o.reader_notes) ? o.reader_notes.map(String) : [] };
  }
  function normLT(s) { const t = String(s || '').toLowerCase(); if (!t) return null; if (/absolute/.test(t)) return 'NNN'; if (/triple|nnn|net/.test(t) && !/modified/.test(t)) return 'NNN'; if (/modified/.test(t)) return 'Modified Gross'; if (/gross|full service/.test(t)) return 'Gross'; return null; }
  function normDrawing(o, file) {
    const items = (Array.isArray(o.items) ? o.items : []).filter(i => i && typeof i === 'object').map(i => Object.assign({}, i, { file }));
    return { file, kind: o.kind || 'other', scale: o.scale || null, items, reader_notes: Array.isArray(o.reader_notes) ? o.reader_notes.map(String) : [] };
  }
  function normLookup(o, file) {
    const out = { file, matched_address: o.matched_address || null, values: {} };
    const vals = o.values && typeof o.values === 'object' ? o.values : {};
    for (const [k, , typ] of LOOKUP_KEYS) {
      const e = vals[k]; if (!e || typeof e !== 'object') continue; let v = e.value; if (v === null || v === undefined || v === '') continue;
      if (typ !== 'text') { v = num(v); if (v === null) continue; }
      if (k === 'tax_rate' && v > 0.2) v = v / 100;          // 1.65 given as a percent
      if ((k === 'walk' || k === 'transit' || k === 'bike') && (v < 0 || v > 100)) continue;
      if (k === 'year_built' && (v < 1700 || v > 2100)) continue;
      out.values[k] = { value: typ === 'integer' ? Math.round(v) : v, source: e.source || null, url: e.url || null, note: e.note || null };
    }
    return out;
  }

  // ============================================================================================== matching + edits
  function matchUnits(units, leases) {
    const taken = new Set(), res = leases.map(() => -1);
    leases.forEach((l, li) => {                       // 1. unit label
      const nu = normUnit(l.unit); if (!nu) return;
      const i = units.findIndex((u, ui) => !taken.has(ui) && normUnit(u.unit) === nu);
      if (i >= 0) { taken.add(i); res[li] = i; }
    });
    leases.forEach((l, li) => {                       // 2. tenant name overlap
      if (res[li] >= 0) return; const lt = toks(l.tenant); if (!lt.length) return;
      let best = -1, bs = 0;
      units.forEach((u, ui) => { if (taken.has(ui) || !u.tenant) return; const ut = toks(u.tenant), ov = lt.filter(w => ut.some(x => x === w || x.startsWith(w) || w.startsWith(x))).length; const sc = ov / Math.min(lt.length, ut.length); if (ov >= 1 && sc > bs) { bs = sc; best = ui; } });
      if (best >= 0 && bs >= 0.5) { taken.add(best); res[li] = best; }
    });
    return res;
  }
  // rent in place on the as-of date, and later steps, from a lease schedule
  function scheduleAt(l, asofSerial) {
    const rows = l.schedule.map(r => ({ d: ds(r.from), m: r.monthly !== null ? r.monthly : r.annual !== null ? r.annual / 12 : (r.psf !== null && l.sqft ? r.psf * l.sqft / 12 : null), page: r.page })).filter(r => r.m !== null && r.m > 0);
    rows.sort((a, b) => (a.d === null ? -1e9 : a.d) - (b.d === null ? -1e9 : b.d));
    if (!rows.length) return { cur: null, future: [] };
    let cur = null, future = [];
    if (asofSerial === null) { cur = rows[0]; future = rows.slice(1).filter(r => r.d !== null); }
    else {
      for (const r of rows) { if (r.d === null || r.d <= asofSerial) cur = r; else future.push(r); }
      if (!cur) { cur = rows[0]; future = rows.slice(1); }          // lease starts after the as-of date: the first period is the starting rent
    }
    return { cur: { monthly: r2(cur.m), from: cur.d }, future: future.map(r => ({ date: r.d, monthly: r2(r.m) })) };
  }
  const CAT_COL = { tax: 0, insurance: 1, utilities: 2, repairs: 3, management: 4, other: 5, trash: 6, pest: 7, cam: 8, telecom: 9 };       // index into the matrix columns (spec.layout.EXP_CATS order)

  // plan(spec, units, extras, opts) -> {edits, items, notes}
  //   units: [{unit, tenant, sqft, rent, lease_type, ...}] already on the rent roll (may be empty);  extras: {leases:[{...normLease}], drawings:[...normDrawing], lookup: normLookup|null}
  //   opts: {asof: serial|null, startRow: first free Inputs tenant index (== units.length)}

  const api = { parseBearing, traverse, itemArea, toFeet, leasePrompt, drawingPrompt, lookupPrompt, CLASSIFY_PROMPT, LOOKUP_KEYS, normLease, normDrawing, normLookup, matchUnits, scheduleAt, normUnit };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DocReaders = api;
})(typeof self !== 'undefined' ? self : this);

// pipeline.js - glue: classify uploaded files, read them with the right deterministic reader, build the filled workbook.
(function (root) {
  const req = n => (typeof require !== 'undefined' ? require(n) : null);
  const EX = req('./extract.js') || root.Extract, PT = req('./pdftext.js') || root.PdfText, TB = req('./tabular.js') || root.Tabular, DOC = req('./docs.js') || root.DocReaders, IM = req('./importer.js') || root.UWImporter, XP = req('./xlpatch.js') || root.XlPatch, md5 = req('./md5.js') || root.md5;

  async function pdfPages(pdfjs, bytes) {
    const doc = await pdfjs.getDocument({ data: bytes.slice(0), useSystemFonts: false, isEvalSupported: false }).promise, out = [];
    try{for (let i = 1; i <= doc.numPages; i++) out.push(await PT.pageWords(await doc.getPage(i)));return out;}finally{await doc.destroy();}
  }
  // Which Claude reader to preselect for a file the fixed readers could not place
  function hintKind(text, scanned, name) {
    { const n = String(name || '').toLowerCase().replace(/[_\-.]+/g, ' ');
      if (/rent ?roll|tenant ledger|rr\b/.test(n)) return 'rent_roll'; if (/operating|income statement|p&l|profit|t-?12|\bt12\b|ytd/.test(n)) return 'statement';
      if (/\blease|amendment|\bloi\b/.test(n)) return 'lease'; if (/\bplat\b|survey|site ?plan|floor ?plan|building[ _-]*(?:plans?|layouts?)|drawing|elevation|architect|\bsheet\b/.test(n)) return 'drawing'; }
    const t = String(text || ''), words = new Set((t.match(/\b(landlord|tenant|demised premises|commencement date|lease agreement|security deposit|permitted use|quiet enjoyment|holdover)\b/gi) || []).map(w => w.toLowerCase())), lease = words.has('landlord') ? words.size : 0;
    const draw = (t.match(/\b(plat|survey|site plan|floor plan|scale|north arrow|bearing|sheet no|setback|lot \d+|square feet|elevation|architect)\b/gi) || []).length;
    if (lease >= 4) return 'lease'; if (draw >= 4) return 'drawing'; return 'auto';
  }
  const looksCostar = t => ['SF RBA', 'Year Built', 'Land SF', 'Zoning', 'True Owner', 'Bldg FAR', 'Sold Price'].filter(k => t.includes(k)).length >= 3;

  // Returns {kind, doc, text?, error?}. kind: rent_roll | statement | costar | unknown
  async function readFile(ctx, file) {
    const name = file.name, bytes = file.bytes, ext = (name.split('.').pop() || '').toLowerCase(), src = { file: name, md5: md5(bytes) };
    const notes = [];
    try {
      if (ext === 'pdf') {
        const pages = await pdfPages(ctx.pdfjs, bytes);
        for(const [i,p]of pages.entries())for(const warning of p.warnings||[])notes.push('Page '+(i+1)+': '+warning);const pageTexts=pages.map(p=>EX.pageText(p));const pageCoverage=pageTexts.map((t,i)=>({page:i+1,characters:t.replace(/\s/g,'').length,needsOCR:t.replace(/\s/g,'').length<40}));const text = pageTexts.map((t,i)=>'PAGE '+(i+1)+'\n'+t).join('\n');const coverage={text,pageCoverage,pages:pages.length,wordPages:pages,layoutText:root.UWDocumentReader?.layoutText(pages)||text};const audited=doc=>root.UWLocalReader?.audit?root.UWLocalReader.audit(doc,pageCoverage):doc;
        if(/\bpro[ -]?forma\b/i.test(text))return {kind:'unknown',name,text,notes:['Broker projection detected. Review as assumptions; not imported as historical actuals.'],src,hint:'supporting',...coverage};
        try { return { kind: 'rent_roll', doc: audited(EX.extractRentroll(pages, Object.assign({}, src))), name,...coverage }; } catch (e) { if (e.name !== 'UnsupportedLayout') throw e; notes.push('rent roll: ' + e.message); }
        if(root.UWDocumentReader){const local=root.UWDocumentReader.parse(text,name,TB,DOC,'auto',ctx.opts||{},pages);if(local?.doc)return {...local,name,...coverage};}
        try { return { kind: 'statement', doc: audited(EX.extractIncomeStatement(pages, Object.assign({}, src))), name,...coverage }; } catch (e) { if (e.name !== 'UnsupportedLayout') throw e; notes.push('statement: ' + e.message); }
        if(root.UWLocalReader){const ledger=root.UWLocalReader.monthly(text,name,TB);if(ledger)return {kind:'statement',doc:audited(ledger),name,...coverage};}
        try { return { kind: 'statement', doc: audited(TB.readAnnualStatement(text, Object.assign({}, src, { pages: pages.length }))), name,...coverage }; } catch (e) { if (e.name !== 'UnsupportedLayout') throw e; notes.push('annual statement: ' + e.message); }
        if (looksCostar(text)) return { kind: 'costar', text, name, src,...coverage };
        { const scanned = text.replace(/\s/g, '').length < 40; return { kind: 'unknown', name, text, notes, src, pages: pages.length, scanned, pageCoverage, hint: hintKind(text, scanned, name) }; }
      }
      if (['xlsx', 'xlsm', 'xls', 'csv', 'tsv'].includes(ext)) {
        const wb = ctx.XLSX.read(ext === 'csv' || ext === 'tsv' ? new TextDecoder().decode(bytes) : bytes, { type: ext === 'csv' || ext === 'tsv' ? 'string' : 'array', cellNF: true, raw: ext === 'csv' || ext === 'tsv' });
        const development=globalThis.UWDevelopmentReader?.workbook(wb,ctx.XLSX,name);if(development)return {kind:'supporting',name,doc:development,src};
        let firstText = '';const candidates=[];
        for (const sh of wb.SheetNames) {
          const grid = TB.sheetGrid(ctx.XLSX, wb.Sheets[sh]); if (!grid.length) continue;
          firstText += '\n### sheet ' + sh + '\n' + grid.slice(0, 400).map(r => r.map(c => c === null ? '' : (typeof c === 'object' ? c.d : c)).join('\t')).join('\n');
          const s2 = Object.assign({}, src, { sheet: sh });
          try { candidates.push({ kind: 'rent_roll', doc: TB.readRentRollGrid(grid, s2, ctx.opts), name, sheet: sh });continue; } catch (e) { if (e.name !== 'UnsupportedLayout') throw e; notes.push(sh + ' as rent roll: ' + e.message); }
          try { candidates.push({ kind: 'statement', doc: TB.readStatementGrid(grid, s2, ctx.opts), name, sheet: sh });continue; } catch (e) { if (e.name !== 'UnsupportedLayout') throw e; notes.push(sh + ' as statement: ' + e.message); }
        }
        if(candidates.length)return {...candidates[0],alternatives:candidates.slice(1)};
        return { kind: 'unknown', name, text: firstText, notes, src, hint: 'auto' };
      }
      if (['txt', 'md', 'text'].includes(ext)) {
        const text = new TextDecoder().decode(bytes);
        if (looksCostar(text)) return { kind: 'costar', text, name, src };
        return { kind: 'unknown', name, text, notes: ['text file is not a recognised CoStar page'], src, hint: hintKind(text, false, name) };
      }
      if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return { kind: 'unknown', name, text: '', notes: ['Picture file. Claude reads pictures (leases, plats, drawings, rent rolls); choose the document type below.'], src, scanned: true, image: true, mime: ext === 'jpg' ? 'image/jpeg' : 'image/' + ext, hint: 'auto' };
      if (['tif', 'tiff', 'heic', 'bmp'].includes(ext)) return { kind: 'unknown', name, notes: ['.' + ext + ' pictures cannot be opened in a browser. Save the file as JPG or PNG (or PDF) and add it again.'], src };
      if (ext === 'docx') {
        const z = await ctx.JSZip.loadAsync(bytes), f = z.file('word/document.xml'); if (!f) return { kind: 'unknown', name, notes: ['This Word file has no readable text.'], src };
        const xml = await f.async('string'), text = xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
        return { kind: 'unknown', name, text, notes: ['Word document: read with Claude (choose the document type below).'], src, hint: hintKind(text, false, name) };
      }
      return { kind: 'unknown', name, notes: ['unsupported file type .' + ext + ' (PDF, Word, Excel, CSV, pictures and pasted text are supported)'], src };
    } catch (e) { return { kind: 'error', name, error: e.message, src }; }
  }

  // docs: {rr, st, costarText?, costarName?, extras?: {leases, drawings, lookup}}; returns {bytes, importer, edits}
  //  - rent roll + statement present: the full importer runs, then lease / takeoff / lookup edits are applied on top
  //  - neither present but extras are: a "shell" build fills only the Inputs, Area Takeoff and site-data cells (units typed from the leases)
  // hide the unused suite rows on Summary and Building Stack (same rule as layout.hide_edits in the Python build); rows stay grouped, click + to show
  // Prior-rent hints: if an OLDER statement printed a different monthly base rent for a tenant than the rent roll shows now, and the
  // lease anniversary (with a stated escalation) falls between them, the rent before the anniversary was the older figure.
  function priorHints(rr, statements) {
    const hints = {}, tok = s => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !['donuts', 'baskin', 'robbins', 'tenant', 'street', 'avenue'].includes(w));
    const asof = rr.meta && rr.meta.as_of; if (!asof) return hints;
    for (const u of rr.units) {
      if (!(u.escalation_pct > 0) || !u.lease_from || !(u.rent > 0)) continue;
      const lf = /^(\d{4})-(\d{2})-(\d{2})$/.exec(u.lease_from), ao = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asof); if (!lf || !ao) continue;
      let y = +ao[1]; const cand = yy => yy + '-' + lf[2] + '-' + lf[3]; if (cand(y) > asof) y--; const A = cand(y); if (y <= +lf[1]) continue;
      const aKey = y * 100 + +lf[2], ut = tok(u.tenant);
      let best = null;
      for (const st of statements) {
        const pe = st.meta && st.meta.period_end; if (!pe || pe >= aKey) continue;
        for (const l of st.lines) { if (l.monthly_due === null || l.monthly_due === undefined || !(l.monthly_due > 0)) continue; const gt = tok((l.group || '') + ' ' + l.label); if (!ut.some(w => gt.includes(w))) continue; if (!best || pe > best.pe) best = { pe, due: l.monthly_due, file: st.source && st.source.file }; }
      }
      if (best && Math.abs(best.due - u.rent) > 0.01 && best.due < u.rent) { const d = new Date(Date.UTC(y, +lf[2] - 1, +lf[3]) - 86400000); hints[u.id] = { prior: best.due, prior_to: d.toISOString().slice(0, 10), from: best.file, anniversary: A }; }
    }
    return hints;
  }
  async function build() { throw new Error("This template doesn't match the selected template profile."); }
  const api = { readFile, build, pdfPages, looksCostar, priorHints };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Pipeline = api;
})(typeof self !== 'undefined' ? self : this);

