/* factsfile.js -- read a looked-at file with the small readers of factsread.js (tax bill, utility bill, unit mix): from its page
 * text (a PDF, or a scan already read by OCR: ocrpdf.js remembers it, so it is not read twice) or its workbook grids. Used by
 * Start from documents (intake.js) and the Documents card (ddui.js). The text and grids are kept in memory with the result so a
 * question the broker answers can be worked out again; nothing is stored or sent. */
import { readGrids } from './sheetread.js';
import { readFacts, FACT_TYPES } from './factsread.js';

/** The kind of small-reader document a verdict names (typed or only "looks like"), or null. */
export const factTypeOf = (verdict) => {
  const t = verdict && (verdict.type || verdict.looks);
  return t && FACT_TYPES.includes(t) ? t : null;
};

/**
 * @param {any} file @param {{ kind?: string, verdict?: any, refuse?: string | null, scanned?: boolean }} info what ddintake.intake said of it
 * @param {{ readPdf?: (bytes: Uint8Array) => Promise<{ pages: string[] }>, getXlsx?: () => Promise<any>, getFflate?: () => Promise<any> }} deps
 * @returns {Promise<{ type: string, src: { pages?: string[], grids?: any[] }, facts: ReturnType<typeof readFacts> } | null>}
 */
export async function factsOf(file, info, deps) {
  const type = factTypeOf(info && info.verdict);
  if (!type || !file || info.refuse || (info.verdict && info.verdict.scanned)) return null;
  try {
    let src = null;
    if (info.kind === 'pdf' && deps.readPdf) src = { pages: (await deps.readPdf(new Uint8Array(await file.arrayBuffer()))).pages };
    else if ((info.kind === 'xlsx' || info.kind === 'text') && deps.getXlsx) src = { grids: await readGrids(file, deps.getXlsx, { maxRows: 400, includeHidden: true, getFflate: deps.getFflate }) };
    if (!src) return null;
    return { type, src, facts: readFacts(type, src) };
  } catch { return null; }
}
