/* connectors.js -- the Connect page's one static list: what Monal reads and writes, by category, and where each
 * row stands. Pure data and three small functions; nothing here is fetched, stored or drawn (connectui.js draws it).
 *
 * A row's state is one of four words, and only these (tests/connectors.test.js fails on any other):
 *   Built in             it works now and `opens` takes you to it
 *   Import file          your own export file goes into a Monal importer that exists; `opens` names it
 *   Coming soon          not built; `wait` says what it waits for (no date is promised)
 *   Needs your approval  not built, and the owner has to say yes first (cost, hosting, security or a licence); `wait` says which
 *   Ready                a free public source the browser reads when you ask (publicdata.js); `opens` names what it opens
 *   Needs a key          the same, once you give it your own free key (kept on this device, never in a backup)
 *   Not available from a browser   looked at and refused: `wait` says why
 * A row has no image or logo: the page draws a neutral monogram from the name (monogram()). Service names are
 * plain text, as docs/working-rules.md allows on this page. A row names a service only to say what file of
 * its own the broker may bring in, or that nothing is connected yet; it never says Monal reads a vendor's
 * file layout it does not read. `module` is the app file the feature lives in (the test checks it exists). */

import { PRODUCT } from './brand.js';

export const STATES = Object.freeze(['Built in', 'Import file', 'Coming soon', 'Needs your approval', 'Ready', 'Needs a key', 'Not available from a browser']);
/** The states in which the button opens something (the rest open a sheet that says what the row waits for). */
export const LIVE_STATES = Object.freeze(['Built in', 'Import file', 'Ready', 'Needs a key']);

/** What `opens` may be: connectui.js answers each one. */
export const OPENS = Object.freeze(['assistant', 'deals', 'home', 'comps-file', 'om-file', 'rent-roll', 't12', 'templates', 'my-data', 'tools', 'crm-file', 'deal-file', 'tenant-file', 'crm-export', 'mail-file', 'public-lookup', 'public-key', 'maps']);

const NEEDS_SERVER = 'It needs a server of ours to receive from outside, and nothing is hosted yet.';
const FILE_FIRST = 'Planned: bring its export file in first. A direct sign-in comes only after a security review.';

/** @type {ReadonlyArray<{ id: string, title: string, sub: string, rows: ReadonlyArray<{ id: string, name: string, desc: string, state: string, module?: string, opens?: string, wait?: string }> }>} */
export const CATEGORIES = Object.freeze([
  { id: 'assistants', title: 'Assistants', sub: 'Let an assistant answer from your figures, never change them',
    rows: [
      { id: 'monal-assistant', name: `${PRODUCT} assistant`, desc: 'Ask about the deal on screen; answers show where each figure came from.', state: 'Built in', module: 'assistantui.js', opens: 'assistant' },
      { id: 'ai-link', name: 'Claude and ChatGPT', desc: 'A read-only link so your own AI can look at deals, comps and contacts.', state: 'Coming soon', wait: 'Planned as a local, read-only link that always leaves confidential deals out. Not built.' },
    ] },
  { id: 'crm', title: 'CRM and contacts', sub: 'Bring contacts in, send them back',
    rows: [
      { id: 'monal-crm', name: `${PRODUCT} contacts`, desc: 'People on your deals, with tasks and activity, kept on this device.', state: 'Built in', module: 'crm.js', opens: 'home' },
      { id: 'salesforce', name: 'Salesforce', desc: 'Your own export of contacts, accounts and opportunities (CSV or Excel), matched by column name.', state: 'Import file', module: 'importui.js', opens: 'crm-file' },
      { id: 'hubspot', name: 'HubSpot', desc: 'Your own export of contacts, companies and deals (CSV or Excel), matched by column name.', state: 'Import file', module: 'importui.js', opens: 'crm-file' },
      { id: 'dynamics', name: 'Microsoft Dynamics 365', desc: 'Your own export of contacts and deals (CSV or Excel), matched by column name.', state: 'Import file', module: 'importui.js', opens: 'crm-file' },
      { id: 'zoho', name: 'Zoho CRM', desc: 'Your own export of contacts and deals (CSV or Excel), matched by column name.', state: 'Import file', module: 'importui.js', opens: 'crm-file' },
      { id: 'pipedrive', name: 'Pipedrive', desc: 'Your own export of people and deals (CSV or Excel), matched by column name.', state: 'Import file', module: 'importui.js', opens: 'crm-file' },
      { id: 'cre-crm', name: 'Apto, Buildout and other commercial real estate CRMs', desc: 'Your own export of contacts, companies and deals (CSV or Excel), matched by column name.', state: 'Import file', module: 'importui.js', opens: 'crm-file' },
      { id: 'crm-export', name: 'Export contacts, deals and tasks', desc: 'CSV files made here, in this app’s column names or the common CRM ones, to load into your CRM.', state: 'Built in', module: 'importui.js', opens: 'crm-export' },
    ] },
  { id: 'deals', title: 'Deal management', sub: 'Pipelines and the documents behind them',
    rows: [
      { id: 'monal-deals', name: `${PRODUCT} deals`, desc: 'Your pipeline, workbook and checklist for every deal.', state: 'Built in', module: 'dealui.js', opens: 'deals' },
      { id: 'om-file', name: 'Offering memorandum', desc: 'Choose an OM as a PDF; its figures are read on this device.', state: 'Import file', module: 'om.js', opens: 'om-file' },
      { id: 'dealpath', name: 'Dealpath', desc: 'Your own pipeline export (CSV or Excel): deal, stage, dates.', state: 'Import file', module: 'importui.js', opens: 'deal-file' },
      { id: 'juniper', name: 'Juniper Square', desc: 'Investors and entities.', state: 'Needs your approval', wait: 'Investor records are sensitive: a decision on data retention comes first.' },
    ] },
  { id: 'property', title: 'Property management', sub: 'Rent rolls and operating statements from the system that keeps them',
    rows: [
      { id: 'tenant-list', name: 'Tenant list', desc: 'A tenant list from your property-management system, as CSV or Excel: tenant, suite, lease end.', state: 'Import file', module: 'importui.js', opens: 'tenant-file' },
      { id: 'rent-roll', name: 'Rent roll file', desc: 'An export from Yardi, AppFolio, Entrata, RealPage, MRI or Buildium, as Excel, CSV or PDF.', state: 'Import file', module: 'rentrollui.js', opens: 'rent-roll' },
      { id: 't12', name: 'Operating statement (T-12)', desc: 'A trailing twelve-month statement as Excel or CSV; every line is filed to a category you confirm.', state: 'Import file', module: 't12ui.js', opens: 't12' },
    ] },
  { id: 'market', title: 'Market and property data', sub: 'Your own exports from services you pay for',
    rows: [
      { id: 'costar-file', name: 'CoStar', desc: 'Comp reports as PDF, or a spreadsheet of comps, from your own subscription.', state: 'Import file', module: 'compimportui.js', opens: 'comps-file' },
      { id: 'comps-sheet', name: 'Any comps spreadsheet', desc: `Excel or CSV with a header row; you map each column once and ${PRODUCT} remembers it.`, state: 'Import file', module: 'compimport.js', opens: 'comps-file' },
      { id: 'licensed-api', name: 'Licensed data (ATTOM, Regrid, Reonomy, CompStak)', desc: 'Parcels, tax and sales, owners and comps by key.', state: 'Needs your approval', wait: 'Each is a paid contract with its own licence terms: a money and licence decision, one source at a time.' },
    ] },
  { id: 'public', title: 'Public data (DC, Maryland, Virginia)', sub: 'Free government figures and maps, shown with their source and date. Looked up only when you ask.',
    rows: [
      { id: 'maps-search', name: 'Maps and search', desc: 'Open any address in Google Maps, Apple Maps or Street View, or search Google for the address, the property or the owner. No key.', state: 'Ready', module: 'maplinksui.js', opens: 'maps' },
      { id: 'public-lookup', name: 'Public data for an address', desc: 'Flood zone, census tract, parcel and assessed value, zoning and permits, and rates, for one address. Nothing is filled until you press Use.', state: 'Ready', module: 'publicdataui.js', opens: 'public-lookup' },
      { id: 'fema', name: 'FEMA flood maps', desc: 'The flood zone of an address and the date of the map. Any US address.', state: 'Ready', module: 'publicdataui.js', opens: 'public-lookup' },
      { id: 'dc-records', name: 'DC property, zoning and permits', desc: 'Tax lot, assessed value, zoning and building permits from DC GIS, with the District’s own address finder.', state: 'Ready', module: 'publicdataui.js', opens: 'public-lookup' },
      { id: 'md-records', name: 'Maryland real property and Montgomery County permits', desc: 'Parcel, year built and assessed value from the state assessor, and building permits in Montgomery County.', state: 'Ready', module: 'publicdataui.js', opens: 'public-lookup' },
      { id: 'rates', name: 'Treasury and NY Fed rates', desc: '5- and 10-year Treasury note yields (latest auction) and SOFR, with the date.', state: 'Ready', module: 'publicdataui.js', opens: 'public-lookup' },
      { id: 'census', name: 'Census American Community Survey', desc: 'Population, households and income for a tract and county, with margins of error. Needs your own free Census key.', state: 'Needs a key', module: 'publicdataui.js', opens: 'public-key' },
      { id: 'va-parcel', name: 'Virginia county parcel data (Fairfax, Arlington)', desc: 'Parcel and assessment for Virginia addresses.', state: 'Not available from a browser', wait: 'No county service that a web page is allowed to read was found: the official addresses do not answer a browser, and the one that did is marked deprecated by the county. Use Open in to reach the county’s own site.' },
    ] },
  { id: 'files', title: 'Files and productivity', sub: 'Read files, fill templates, keep the work on your device',
    rows: [
      { id: 'this-device', name: 'This device', desc: 'Everything is kept in this browser. See what is stored, and back it up.', state: 'Built in', module: 'backupui.js', opens: 'my-data' },
      { id: 'excel-templates', name: 'Excel templates', desc: 'Your firm’s workbooks, mapped to deal fields and filled from a deal.', state: 'Built in', module: 'library.js', opens: 'templates' },
      { id: 'tools', name: 'Tools and calculators', desc: 'Loan, yield, lease and closing tools, with saved scenarios.', state: 'Built in', module: 'toolsui.js', opens: 'tools' },
      { id: 'cloud-folder', name: 'Google Drive, OneDrive and Dropbox', desc: 'Files in and out of a cloud folder.', state: 'Coming soon', wait: 'Planned after a security review of the sign-in; today choose a file from the folder on your device.' },
      { id: 'mail-files', name: 'Calendar and email files', desc: 'Drop a calendar (.ics) or email (.eml) file: meetings and emails become activity, the people named become contacts to file, and attachments can go to Start from documents.', state: 'Import file', module: 'mailui.js', opens: 'mail-file' },
      { id: 'calendar-mail', name: 'Google and Microsoft calendar and mail', desc: 'Meetings and emails become activity and tasks.', state: 'Coming soon', wait: FILE_FIRST },
      { id: 'esign', name: 'DocuSign', desc: 'Envelope status to deal dates.', state: 'Coming soon', wait: 'Planned after the cloud sign-in is in.' },
    ] },
  { id: 'automation', title: 'Automation', sub: 'Send records to other tools',
    rows: [
      { id: 'zapier', name: 'Zapier', desc: 'Send a deal or contact to thousands of apps.', state: 'Needs your approval', wait: `A third party would handle your records, and it costs money. ${NEEDS_SERVER}` },
      { id: 'make', name: 'Make', desc: 'The same, with Make’s scenarios.', state: 'Needs your approval', wait: `A third party would handle your records, and it costs money. ${NEEDS_SERVER}` },
      { id: 'webhooks', name: 'Webhooks', desc: 'Post a record to an address you choose.', state: 'Needs your approval', wait: `Records would leave the device, so a security decision comes first. ${NEEDS_SERVER}` },
    ] },
  { id: 'api', title: 'API', sub: 'For your own scripts',
    rows: [
      { id: 'api-keys', name: 'Personal API keys', desc: 'A key of your own to read your deals from a script.', state: 'Coming soon', wait: NEEDS_SERVER },
    ] },
]);

/** Every row, each with its category's id. */
export const allRows = () => CATEGORIES.flatMap((c) => c.rows.map((r) => ({ ...r, category: c.id })));

/**
 * The categories that hold a match for `q`, each with only its matching rows: every word of the query must
 * appear in the row's name, description, state or category title (any case). An empty query returns all.
 */
export function filterCategories(q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return CATEGORIES.map((c) => ({ ...c, rows: [...c.rows] }));
  return CATEGORIES
    .map((c) => ({ ...c, rows: c.rows.filter((r) => { const hay = `${r.name} ${r.desc} ${r.state} ${c.title}`.toLowerCase(); return words.every((w) => hay.includes(w)); }) }))
    .filter((c) => c.rows.length);
}

/**
 * The neutral tile for a row: up to two initials of its name and a tone 1 to 4 (the page's own tint tokens, --tone-N and
 * --wash-N), chosen from the name so a row keeps its colour. Not a logo, and nothing to download.
 */
export function monogram(name) {
  const words = String(name || '').replace(/\([^)]*\)/g, ' ').split(/[^A-Za-z0-9]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2);
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { text: letters.toUpperCase(), tone: (h % 4) + 1 };
}
