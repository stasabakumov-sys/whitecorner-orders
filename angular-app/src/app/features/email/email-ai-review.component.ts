import { Component, input } from '@angular/core';
import { EmailAiAnalysis } from '../../core/services/email-ai.service';

@Component({
  selector: 'app-email-ai-review',
  standalone: true,
  template: `
    @if (analysis(); as review) {
      <details class="review" [open]="review.review_required">
        <summary>Reply review <span>Check before sending</span></summary>
        @if (review.intent_labels?.length) {
          <div class="intents">@for (intent of review.intent_labels; track intent) { <span>{{intent}}</span> }</div>
        }
        @if (review.conflicts?.length) {
          <section class="conflicts"><h4>Conflicting information</h4>
            <ul>@for (item of review.conflicts; track $index) { <li>{{item}}</li> }</ul>
          </section>
        }
        @if (review.missing_information?.length) {
          <section><h4>Information needed</h4>
            <ul>@for (item of review.missing_information; track $index) { <li>{{item}}</li> }</ul>
          </section>
        }
        @if (review.facts?.length) {
          <section><h4>Facts and statements</h4>
            @for (fact of review.facts; track $index) {
              <div class="fact"><b>{{factLabel(fact.kind)}}</b><p>{{fact.claim}}</p><small>{{fact.source_ids.join(' · ')}}</small></div>
            }
          </section>
        }
        @if (review.next_step) { <section><h4>Proposed next step</h4><p>{{review.next_step}}</p></section> }
        @if (review.claim_source_map?.length) {
          <details class="sources"><summary>Draft sources</summary>
            @for (item of review.claim_source_map; track $index) {
              <div class="fact"><p>{{item.claim}}</p><small>{{item.source_ids.join(' · ')}}</small></div>
            }
          </details>
        }
      </details>
    }
  `,
  styles: [`
    :host { display: block; }
    .review { margin-top: 12px; border: 1px solid #dfe3e8; border-radius: 9px; padding: 12px; color: #344054; font-size: 12px; line-height: 1.5; }
    summary { cursor: pointer; font-weight: 600; color: #172033; }
    summary span { font-weight: 400; font-size: 11px; color: #667085; margin-left: 8px; }
    .intents { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
    .intents span { background: #eef2ff; color: #3448a0; border-radius: 12px; padding: 2px 8px; font-size: 11px; }
    section { margin-top: 12px; overflow-wrap: anywhere; }
    h4 { margin: 0 0 5px; font-size: 12px; }
    p { margin: 3px 0; white-space: pre-line; }
    ul { margin: 0; padding-left: 20px; }
    li + li { margin-top: 4px; }
    .conflicts { border-left: 3px solid #e5a000; padding-left: 10px; }
    .fact { padding: 7px 0; border-bottom: 1px solid #eef0f3; overflow-wrap: anywhere; }
    .fact b, .fact small { font-size: 10px; color: #667085; }
    .sources { margin-top: 12px; }
  `],
})
export class EmailAiReviewComponent {
  readonly analysis = input<EmailAiAnalysis | null>(null);
  factLabel(kind: string): string {
    return ({ hub_snapshot: 'Hub record', customer_claim: 'Customer statement', staff_statement: 'Previous staff reply' } as Record<string, string>)[kind] || 'Statement';
  }
}
