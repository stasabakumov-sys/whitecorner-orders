import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { describe, expect, it, vi } from 'vitest';
import { EmailComponent } from './email.component';
import { EmailService } from '../../core/services/email.service';
import { EmailAiService } from '../../core/services/email-ai.service';
import { OrdersService } from '../../core/services/orders.service';

const result = {
  needs_reply: true, intent: 'Spare parts / repair', intent_labels: ['Spare parts / repair'],
  linked_order: null, confidence: 0.9, summary: 'Replacement panel enquiry', draft_reply: 'Please confirm the original order number.',
  review_required: true, review_reason: 'Repair availability requires review.',
  conflicts: ['Earlier panels offered; later repairs declined.'], missing_information: ['Original model and order'],
  next_step: 'Ask production to assess compatibility.', facts: [
    { claim: 'Customer requests a new panel.', kind: 'customer_claim', source_ids: ['email:m1'] },
  ], claim_source_map: [], risk_flags: ['damage_or_remedy'],
};
const row = {
  id: 'm1', threadId: 't1', mailbox: 'info' as const, correspondent: 'Test Customer',
  email: 'customer@example.test', initials: 'TC', subject: 'Replacement panel',
  preview: 'Can I buy a new panel?', received_at: '2026-09-08T00:00:00Z', time: 'Today',
  direction: 'Incoming' as const, status: 'Inbox' as const, unread: true,
};
async function setup() {
  const email = {
    peekList: vi.fn(() => null), list: vi.fn(async () => []), isListStale: vi.fn(() => false),
    connectedCount: () => 2, isConnected: () => true, hasMore: () => false, error: signal(''),
    peekMessage: () => null, peekThread: () => null,
    getThread: vi.fn(async () => ({ id: 't1', messages: Array.from({ length: 25 }, (_, i) => ({
      id: i === 24 ? 'm1' : 'm' + (i + 2), from: 'customer@example.test', subject: 'Replacement panel',
      date: new Date(Date.UTC(2026, 8, 8, 0, i)).toISOString(), body: i === 0 ? '600\n900\n1200\n1400' : 'Can I buy a new panel?',
      attachments: [], outgoing: false,
    })) })),
    modify: vi.fn(), send: vi.fn(),
  };
  const ai = { runtimeStatus: vi.fn(async () => ({ connected: true, mode: 'draft_review' })), analyse: vi.fn(async () => result) };
  await TestBed.configureTestingModule({
    imports: [EmailComponent], providers: [
      provideNoopAnimations(), { provide: EmailService, useValue: email },
      { provide: EmailAiService, useValue: ai },
      { provide: OrdersService, useValue: { orders: signal([]) } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(EmailComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.componentInstance.rows.set([{ ...row, body: '' }]);
  return { fixture, email, ai, component: fixture.componentInstance };
}

describe('Email AI reader integration', () => {
  it('uses all original texts, renders review evidence and leaves Gmail read state unchanged', async () => {
    const { fixture, component, email, ai } = await setup();
    await component.openMail(component.rows()[0]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(ai.analyse).toHaveBeenCalledOnce();
    const request = ai.analyse.mock.calls[0] as unknown as [Record<string, unknown>];
    const thread = request[0]['thread'] as { body: string }[];
    expect(thread).toHaveLength(25);
    expect(thread[0].body).toBe('600\n900\n1200\n1400');
    expect(email.modify).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Conflicting information');
    expect(fixture.nativeElement.textContent).toContain('Customer statement');
    expect(fixture.nativeElement.textContent).toContain('Ask production to assess compatibility.');
    component.startReply(component.replyTarget(component.selected()!));
    expect(component.replyText()).toBe(result.draft_reply);
  });
  it('does not overwrite edited reply text or apply late analysis to a closed conversation', async () => {
    const { fixture, component, ai } = await setup();
    await component.openMail(component.rows()[0]);
    await fixture.whenStable();
    component.replyText.set('My edited response');
    await component.analyseMail(component.selected()!);
    expect(component.replyText()).toBe('My edited response');
    ai.analyse.mockRejectedValueOnce(new Error('Provider unavailable'));
    await component.analyseMail(component.selected()!);
    expect(component.selected()?.draft_reply).toBe('');
    expect(component.aiAnalysisError()).toContain('could not be completed');
    expect(component.replyText()).toBe('My edited response');
    let resolve!: (value: typeof result) => void;
    ai.analyse.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const pending = component.analyseMail(component.selected()!);
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    component.closeMail();
    resolve(result);
    await pending;
    expect(component.selected()).toBeNull();
    expect(component.aiAnalysisLoading()).toBe('');
  });
});
