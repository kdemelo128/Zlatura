/* Invented Home data for the pulse flows: `n` deals across the active stages (createdAt spread over the last 12 weeks, some
 * priced, some not) and a few tasks finished in different weeks. Nothing here is a real property or person. */
export async function seedPulse(page, { n = 30, tasks = true } = {}) {
  await page.evaluate(async ({ n, tasks }) => {
    const store = await import('./app/store.js');
    const crm = await import('./app/crm.js');
    const stages = ['prospect', 'listing', 'underwriting', 'marketing', 'offer', 'contract', 'diligence', 'closed'];
    const now = Date.now();
    for (let i = 0; i < n; i++) {
      const t = now - Math.floor((i / n) * 84 * 86400000) - 3600000;
      await store.saveDeal({
        id: `pl-fixture-${String(i).padStart(2, '0')}`, name: `Invented Property ${i + 1}`, createdAt: t, updatedAt: t,
        source: null, readAt: null, pages: 0, sources: {},
        figures: { ptype: i % 2 ? 'Office' : 'Retail', address: `${i + 1} Invented Lane`, city: 'Mapleview', price: i % 5 === 4 ? null : 1500000 + i * 410000, cap: 6.5, bsf: 20000 + i * 500 },
        stage: stages[i % stages.length], confidential: false,
        loan: {}, rentRoll: [], qDone: {}, myQuestions: [], live: {}, scenarios: [], visit: { notes: '', items: {}, photos: [], audio: [] },
      });
    }
    localStorage.removeItem('zlatura.deal.current');
    if (tasks) {
      for (let i = 0; i < 6; i++) {
        const k = await crm.addTask({ title: `Invented task ${i + 1}`, due: i < 2 ? '2020-01-01' : null });
        // updateTask stamps doneAt with now; restoreTask keeps the whole record, so the finish times can be spread over the weeks
        if (i >= 2) await crm.restoreTask({ ...k, done: true, doneAt: now - (i - 1) * 9 * 86400000 });
      }
    }
  }, { n, tasks });
}
