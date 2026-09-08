export type KnowledgeSourceKind = 'Hub' | 'Website' | 'FAQ / Terms' | 'Correspondence';

export interface AgentKnowledgeSource {
  kind: KnowledgeSourceKind;
  name: string;
  priority: number;
  status: 'Live' | 'Seeded' | 'Planned';
  notes: string;
}

export interface AgentPolicyRule {
  topic: string;
  rule: string;
  source: KnowledgeSourceKind;
}

export const EMAIL_AGENT_SOURCES: AgentKnowledgeSource[] = [
  { kind: 'Hub', name: 'Order + fulfilment data', priority: 1, status: 'Live', notes: 'Server refreshes candidate order and production facts under user RLS. Snapshot time does not prove recent Wix sync.' },
  { kind: 'Website', name: 'whitecorner.com.au product pages', priority: 2, status: 'Planned', notes: 'Current catalogue retrieval is not connected to analysis.' },
  { kind: 'FAQ / Terms', name: 'White Corner FAQ + Terms', priority: 2, status: 'Planned', notes: 'Current approved policies are not connected; staff must verify applicable terms.' },
  { kind: 'Correspondence', name: 'March–September 2026 research: 80 conversations', priority: 3, status: 'Seeded', notes: 'Curated anonymous observations and exceptions; not current prices or approved policy.' },
];

export const EMAIL_AGENT_POLICY: AgentPolicyRule[] = [
  { topic: 'Communication', rule: 'Prepare written replies. Do not promise calls or appointments without current confirmation.', source: 'FAQ / Terms' },
  { topic: 'Tone', rule: 'Use clear, natural, professional English. Be warm but practical, factual and non-confrontational.', source: 'Correspondence' },
  { topic: 'Made to order', rule: 'Products are made to order. Do not imply stock availability unless Hub explicitly shows stock.', source: 'Website' },
  { topic: 'Production time', rule: 'Use the live product/order-specific production time when available. Do not replace a specific product timeframe with a generic one.', source: 'Website' },
  { topic: 'Pickup', rule: 'Pickup is by prior arrangement. Use Hub availability/calendar once connected. Do not promise an unavailable time.', source: 'FAQ / Terms' },
  { topic: 'Shipping', rule: 'Shipping is via third-party couriers. Transit time depends on postcode and courier conditions; do not guarantee courier arrival dates.', source: 'FAQ / Terms' },
  { topic: 'Customisation', rule: 'Clarify exact requested changes, dimensions, finish, cut-outs and other technical details in writing before quoting or confirming feasibility.', source: 'Correspondence' },
  { topic: 'Order changes', rule: 'Never auto-approve a change to a confirmed/paid order. Route to manual review.', source: 'FAQ / Terms' },
  { topic: 'Claims / damage', rule: 'Never auto-send a claim outcome. Request/verify required evidence and route to manual review.', source: 'FAQ / Terms' },
  { topic: 'Cancellation / refund', rule: 'Never auto-approve cancellation or refund. Route to manual review and apply current Terms only.', source: 'FAQ / Terms' },
  { topic: 'Conflict handling', rule: 'If current records conflict with an earlier customer-specific commitment, flag both for staff review. Historical evidence never establishes current prices, availability or a blanket refusal.', source: 'Hub' },
];

export const EMAIL_AGENT_TRAINING_SUMMARY = {
  sourceCount: EMAIL_AGENT_SOURCES.length,
  policyCount: EMAIL_AGENT_POLICY.length,
  mode: 'Current order facts + curated historical guidance',
  sendingMode: 'Review before send',
};
