import {TestBed} from '@angular/core/testing';
import {signal} from '@angular/core';
import {provideRouter} from '@angular/router';
import {BillingComponent} from './billing.component';
import {SupabaseService} from '../../core/services/supabase.service';
import {HubMembersService} from '../../core/services/hub-members.service';

describe('billing screen', () => {
  it('renders saved data, actionable access errors and a failed PDF without clearing the table', async () => {
    const invoke = async (_: string, {body}: any) => ({data: body.action === 'checkAccess'
      ? {ok: true, results: [{kind: 'invoice', available: false, error: 'Invoice access denied. Review Wix permissions.'}]}
      : {ok: true, total: 1, sources: [], documents: [{id: 'fixture', number: 'INV-1', kind: 'invoice', pdf_saved: false, pdf_error: 'PDF unavailable. Retry later.'}]}});
    TestBed.configureTestingModule({imports: [BillingComponent], providers: [provideRouter([]),
      {provide: SupabaseService, useValue: {client: {functions: {invoke}}}},
      {provide: HubMembersService, useValue: {manager: signal(true)}}]});
    const fixture = TestBed.createComponent(BillingComponent);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('INV-1');
    expect(element.textContent).toContain('PDF unavailable. Retry later.');
    const button = [...element.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Check Wix access')!;
    button.click(); await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Review Wix permissions');
    expect(element.textContent).toContain('INV-1');
    expect(button.disabled).toBe(false);
  });
});
