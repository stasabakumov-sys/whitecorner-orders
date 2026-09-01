export type KnowledgeSourceKind = 'Hub' | 'Website' | 'FAQ / Terms' | 'GPT history';

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
  { kind: 'Hub', name: 'Order + fulfilment data', priority: 1, status: 'Planned', notes: 'Highest priority for customer/order-specific facts.' },
  { kind: 'Website', name: 'whitecorner.com.au product pages', priority: 2, status: 'Seeded', notes: 'Current product details, dimensions, finishes, production and delivery availability.' },
  { kind: 'FAQ / Terms', name: 'White Corner FAQ + Terms', priority: 2, status: 'Seeded', notes: 'Communication, pickup, delivery, cancellations, claims and customer responsibilities.' },
  { kind: 'GPT history', name: 'White Corner GPT company history', priority: 3, status: 'Seeded', notes: 'Reusable customer-service patterns, operational decisions and response style.' },
];

export const EMAIL_AGENT_POLICY: AgentPolicyRule[] = [
  { topic: 'Communication', rule: 'Handle enquiries in writing by email; do not offer phone consultation unless business policy changes.', source: 'FAQ / Terms' },
  { topic: 'Tone', rule: 'Use clear, natural, professional English. Be warm but practical, factual and non-confrontational.', source: 'GPT history' },
  { topic: 'Made to order', rule: 'Products are made to order. Do not imply stock availability unless Hub explicitly shows stock.', source: 'Website' },
  { topic: 'Production time', rule: 'Use the live product/order-specific production time when available. Do not replace a specific product timeframe with a generic one.', source: 'Website' },
  { topic: 'Pickup', rule: 'Pickup is by prior arrangement. Use Hub availability/calendar once connected. Do not promise an unavailable time.', source: 'FAQ / Terms' },
  { topic: 'Shipping', rule: 'Shipping is via third-party couriers. Transit time depends on postcode and courier conditions; do not guarantee courier arrival dates.', source: 'FAQ / Terms' },
  { topic: 'Customisation', rule: 'Clarify exact requested changes, dimensions, finish, cut-outs and other technical details in writing before quoting or confirming feasibility.', source: 'GPT history' },
  { topic: 'Order changes', rule: 'Never auto-approve a change to a confirmed/paid order. Route to manual review.', source: 'FAQ / Terms' },
  { topic: 'Claims / damage', rule: 'Never auto-send a claim outcome. Request/verify required evidence and route to manual review.', source: 'FAQ / Terms' },
  { topic: 'Cancellation / refund', rule: 'Never auto-approve cancellation or refund. Route to manual review and apply current Terms only.', source: 'FAQ / Terms' },
  { topic: 'Conflict handling', rule: 'If sources conflict, prefer Hub/order-specific live data, then current website/FAQ/Terms, then GPT history. If still uncertain, do not guess; request review.', source: 'Hub' },
];

export const EMAIL_AGENT_TRAINING_SUMMARY = {
  sourceCount: EMAIL_AGENT_SOURCES.length,
  policyCount: EMAIL_AGENT_POLICY.length,
  mode: 'Knowledge base + retrieval',
  sendingMode: 'Review before send',
};
