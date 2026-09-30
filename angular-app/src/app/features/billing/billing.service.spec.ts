import {BillingService} from './billing.service';

function service(respond: (body: any) => any) {
  return new BillingService({client: {functions: {invoke: async (_: string, {body}: any) => ({data: await respond(body)})}}} as any);
}
describe('billing migration feedback', () => {
  it('continues receipts if invoice access fails and keeps the actionable error', async () => {
    const actions: string[] = [];
    const billing = service(body => {
      actions.push(`${body.action}:${body.kind || ''}`);
      if (body.action === 'importPage') return body.kind === 'invoice' ? {ok: false, error: 'Invoices API not enabled'} : {ok: true, run: {saved_count: 6, scan_complete: true}};
      return {ok: true, documents: [], total: 0, sources: []};
    });
    await billing.importDocuments(false, ['invoice', 'receipt']);
    expect(actions).toContain('importPage:receipt'); expect(billing.error()).toContain('Invoices API not enabled');
    expect(billing.busy()).toBe(false); expect(billing.progress()).toContain('issues');
  });
  it('resumes pages without resetting the run on each request', async () => {
    const restarts: boolean[] = [];
    const billing = service(body => {
      if (body.action === 'importPage') { restarts.push(body.restart); return {ok: true, run: {saved_count: restarts.length * 50, scan_complete: restarts.length === 2}}; }
      return {ok: true, documents: [], total: 0, sources: []};
    });
    await billing.importDocuments(true);
    expect(restarts).toEqual([true, false]); expect(billing.progress()).toContain('Copy PDFs');
  });
  it('keeps saved rows visible when loading fails', async () => {
    const billing = service(() => ({ok: false, error: 'Database unavailable. Retry.'}));
    billing.documents.set([{id: 'saved'} as any]);
    await billing.load();
    expect(billing.documents()[0].id).toBe('saved'); expect(billing.error()).toContain('Retry'); expect(billing.loading()).toBe(false);
  });
  it('continues copying after a PDF failure, keeps its error and never claims everything succeeded', async () => {
    const copied: string[] = [];
    const billing = service(body => {
      if (body.action === 'copyPdf') { copied.push(body.id); return body.id === 'bad' ? {ok: false, error: 'PDF too large. Review.'} : {ok: true, copied: true}; }
      return {ok: true, documents: [{id: 'bad'}, {id: 'good'}, {id: 'existing', pdf_saved: true}], total: 3, sources: []};
    });
    await billing.copyPdfs();
    expect(copied).toEqual(['bad', 'good']); expect(billing.error()).toContain('too large'); expect(billing.progress()).toContain('1 PDFs copied; 1 need review');
  });
});
