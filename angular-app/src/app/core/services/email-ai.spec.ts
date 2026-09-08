import { describe, expect, it, vi } from 'vitest';
import {
  AnalysisError, candidateOrderNumbers, orderSources, prepareConversation, responseText,
  validateAnalysis,
} from '../../../../../supabase/functions/email-ai/domain';
import { EmailAiService } from './email-ai.service';

const conversation = () => prepareConversation({ thread_complete: true, thread: [
  { id: 'customer', from: 'customer@example.test', date: '2026-09-08T01:00:00Z', body: 'Please confirm my cart configuration.' },
  { id: 'staff', from: 'Admin <info@whitecorner.com.au>', date: '2026-09-08T02:00:00Z', body: 'Your selected finish is raw.' },
] });
const analysis = () => ({
  needs_reply: true, intent: 'Product question', intent_labels: ['Product question'],
  linked_order: null, confidence: 0.95, summary: 'Configuration enquiry', draft_reply: 'The selected finish is raw.',
  review_required: false, review_reason: '', facts: [
    { claim: 'Raw finish was confirmed by staff.', kind: 'staff_statement', source_ids: ['email:staff'] },
  ], conflicts: [], missing_information: [], risk_flags: [], next_step: 'Check the reply before sending.',
  claim_source_map: [{ claim: 'The selected finish is raw.', source_ids: ['email:staff'] }],
});

describe('Email AI evidence and review boundaries', () => {
  it('retains early approvals in a 61-message conversation and identifies staff by sender', () => {
    const messages = Array.from({ length: 61 }, (_, i) => ({
      id: String(i), from: i === 0 ? 'Admin <info@whitecorner.com.au>' : 'customer@example.test',
      direction: 'Incoming', date: new Date(Date.UTC(2026, 2, 10, 0, i)).toISOString(),
      body: i === 0 ? 'Approved original dimensions.' : 'Follow-up',
    })).reverse();
    const result = prepareConversation({ thread_complete: true, thread: messages });
    expect(result.messages).toHaveLength(61);
    expect(result.messages[0]['body']).toBe('Approved original dimensions.');
    expect(result.messages[0]['direction']).toBe('Outgoing');
    expect(result.complete).toBe(true);
  });
  it('rejects oversize or duplicate context instead of silently dropping evidence', () => {
    expect(() => prepareConversation({ body: 'a'.repeat(250001) })).toThrow(AnalysisError);
    expect(() => prepareConversation({ thread: Array.from({ length: 201 }, (_, i) => ({ id: String(i), body: 'x' })) })).toThrow(AnalysisError);
    expect(() => prepareConversation({ thread: [{ id: 'a', body: 'one' }, { id: 'a', body: 'two' }] })).toThrow('Duplicate');
    expect(prepareConversation({ body: 'Only a snippet' }).complete).toBe(false);
  });
  it('does not take client-provided prices or private raw payloads as order facts', () => {
    expect(candidateOrderNumbers([{ order_number: '100', total: 1 }, { order_number: '100' }, { order_number: '' }])).toEqual(['100']);
    const result = orderSources([{ order_number: '100', total: 400, phone: 'private', raw_order: { secret: 'private' }, delivery_address: 'private' }], '2026-09-08T00:00:00Z');
    expect(result[0]['total']).toBe(400);
    expect(JSON.stringify(result)).not.toContain('private');
  });
  it.each(['Claim / damage', 'Equipment / safety', 'Supplier onboarding', 'Spare parts / repair', 'Branding / finishing'])(
    'forces review of secondary %s intent even at high confidence', intent => {
      const value = { ...analysis(), intent_labels: ['Product question', intent] };
      expect(validateAnalysis(value, conversation().messages, true).review_required).toBe(true);
    },
  );
  it('forces review for conflicting history, missing evidence and financial decisions', () => {
    for (const patch of [
      { conflicts: ['Earlier panels offered; later blanket refusal.'] },
      { missing_information: ['Latest freight payment status'] },
      { risk_flags: ['financial_decision'] },
      { confidence: 0.6 },
    ]) expect(validateAnalysis({ ...analysis(), ...patch }, conversation().messages, true).review_required).toBe(true);
    expect(validateAnalysis(analysis(), conversation().messages, false).risk_flags).toContain('missing_context');
  });
  it('withholds drafts with invented sources, false staff attribution or historical-only support', () => {
    const sources = [...conversation().messages, { source_id: 'history:repair' }];
    for (const patch of [
      { claim_source_map: [{ claim: 'Replacement approved', source_ids: ['email:invented'] }] },
      { facts: [{ claim: 'Replacement approved', kind: 'staff_statement', source_ids: ['email:customer'] }] },
      { claim_source_map: [{ claim: 'We always offer replacements', source_ids: ['history:repair'] }] },
      { claim_source_map: [] },
    ]) {
      const result = validateAnalysis({ ...analysis(), ...patch }, sources, true);
      expect(result.draft_reply).toBe('');
      expect(result.risk_flags).toContain('unsupported_claim');
    }
  });
  it('withholds a reply when the linked order is not in the current candidates', () => {
    const result = validateAnalysis({ ...analysis(), linked_order: '999' }, conversation().messages, true);
    expect(result.linked_order).toBeNull();
    expect(result.draft_reply).toBe('');
    expect(result.review_required).toBe(true);
  });
  it('clears automated-mail replies and rejects malformed model output', () => {
    expect(validateAnalysis({ ...analysis(), needs_reply: false }, conversation().messages, true).draft_reply).toBe('');
    for (const patch of [{ confidence: NaN }, { needs_reply: 'false' }, { facts: null }, { risk_flags: ['made_up'] }]) {
      expect(() => validateAnalysis({ ...analysis(), ...patch }, conversation().messages, true)).toThrow('invalid analysis');
    }
  });
  it('handles incomplete/refused provider output without returning its content', () => {
    expect(() => responseText({ status: 'incomplete', output: [] })).toThrow('incomplete');
    expect(() => responseText({ status: 'completed', output: [{ content: [{ type: 'refusal', refusal: 'private' }] }] })).toThrow('Staff review');
    expect(responseText({ status: 'completed', output: [{ content: [{ type: 'output_text', text: '{}' }] }] })).toBe('{}');
  });
  it('reanalyses the same message so changed orders or new replies cannot use the old cache', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { analysis: analysis() }, error: null });
    const service = new EmailAiService({ client: { functions: { invoke } } } as never);
    await service.analyse({ id: 'same' }, []);
    await service.analyse({ id: 'same' }, []);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls.every(call => call[0] === 'email-ai' && call[1].body.action === 'analyse')).toBe(true);
  });
});
