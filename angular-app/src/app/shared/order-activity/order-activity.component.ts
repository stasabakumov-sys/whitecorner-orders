import { DatePipe } from '@angular/common';
import { Component, Input, OnInit, signal } from '@angular/core';
import { OrderActivityRow, OrderRow } from '../../core/models/order.models';
import { ActivityService } from '../../core/services/activity.service';

@Component({
  selector: 'app-order-activity',
  standalone: true,
  imports: [DatePipe],
  template: `
    <section class="activity-section">
      <div class="section-title">Order activity</div>
      <div class="box">
        <div class="add">
          <label>Add a note <span>(Customer won't see this)</span></label>
          <textarea #note placeholder="Write an internal note..."></textarea>
          <div><button (click)="addNote(note.value); note.value=''" [disabled]="busy()">{{ busy() ? 'Adding…' : 'Add note' }}</button></div>
        </div>
        <div class="timeline">
          @if (!events().length) {
            <div class="empty">No activity yet.</div>
          } @else {
            @for (group of grouped(); track group.date) {
              <div class="date">{{ group.date | date:'dd MMM yyyy' }}</div>
              @for (event of group.items; track trackEvent(event)) {
                <div class="event" [class.note]="event.activity_type==='note'">
                  <div class="dot"></div>
                  <div class="line"></div>
                  <div class="time">{{ event.created_at | date:'h:mm a' }}</div>
                  @if (event.activity_type === 'status_change') {
                    <div class="who">{{ actorLabel(event.created_by) }}</div>
                    <div class="message">
                      @if (event.production_unit_id) { <b>{{ unitLabel(event.production_unit_id) }}</b> · }
                      Status changed from <b>{{ event.old_status || '—' }}</b> to <b>{{ event.new_status || '—' }}</b>
                    </div>
                  } @else if (event.activity_type === 'note') {
                    <div class="who">{{ actorLabel(event.created_by) }} added a note:</div>
                    <div class="message">{{ event.message }}</div>
                  } @else {
                    <div class="message">{{ event.message }}</div>
                  }
                </div>
              }
            }
          }
        </div>
      </div>
    </section>
  `,
  styles: [`@layer hub-layout {

    .section-title{font-size:11px;text-transform:uppercase;color:#758198;font-weight:700;margin-bottom:8px}.box{border:1px solid #e4e7ec;border-radius:12px;background:#fff;overflow:hidden}.add{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 12px;align-items:end;padding:14px 18px;border-bottom:1px solid #e4e7ec}.add label{grid-column:1/-1;display:flex;gap:5px;flex-wrap:wrap;font-weight:600}.add label span{font-size:12px;color:#758198;font-weight:400}.add textarea{box-sizing:border-box;width:100%;height:42px;min-height:42px;max-height:160px;resize:vertical;border:1px solid #d4d9e2;border-radius:8px;padding:9px 10px;font:inherit}.add button{background:#116dff;color:#fff;border:0;border-radius:8px;padding:10px 14px;cursor:pointer;white-space:nowrap}.add button:disabled{opacity:.6;cursor:wait}.timeline{min-width:0;padding:8px 18px 14px}.date{font-size:12px;color:#758198;font-weight:700;margin:12px 0 7px}.event{position:relative;margin-left:10px;padding:3px 76px 13px 22px;min-height:26px}.dot{position:absolute;left:-4px;top:10px;width:7px;height:7px;border-radius:50%;background:#68758a;z-index:2}.line{position:absolute;left:-1px;top:17px;bottom:-1px;width:1px;background:#9aa5b5}.event:last-child .line{display:none}.time{position:absolute;right:0;top:4px;color:#758198;font-size:11px;white-space:nowrap}.who{font-size:12px;color:#4d5a70;margin-bottom:2px}.message{line-height:1.4;white-space:pre-wrap;overflow-wrap:anywhere}.empty{padding:12px 0;color:#758198;font-size:12px}@media(max-width:560px){.add{grid-template-columns:1fr}.add button{width:100%}.event{padding-right:0;padding-top:18px}.time{left:22px;right:auto;top:0}}

}`],
})
export class OrderActivityComponent implements OnInit {
  @Input({ required: true }) order!: OrderRow;
  readonly busy = signal(false);

  constructor(readonly activity: ActivityService) {}

  ngOnInit(): void { void this.activity.load(); }

  events(): OrderActivityRow[] { return this.activity.eventsFor(this.order); }

  grouped(): { date: Date; items: OrderActivityRow[] }[] {
    const groups = new Map<string, OrderActivityRow[]>();
    for (const event of this.events()) {
      const d = new Date(event.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(event);
    }
    return [...groups.values()].map((items) => ({ date: new Date(items[0].created_at), items }));
  }

  async addNote(message: string): Promise<void> {
    const clean = message.trim();
    if (!clean) return;
    this.busy.set(true);
    try { await this.activity.addNote(this.order.id, clean); }
    finally { this.busy.set(false); }
  }

  unitLabel(unitId: string): string {
    const units = (this.order.wc_order_items ?? [])
      .flatMap((item) => (item.wc_production_units ?? []).map((unit) => ({ item, unit })))
      .sort((a, b) => a.unit.unit_index - b.unit.unit_index);
    const index = units.findIndex((entry) => entry.unit.id === unitId);
    if (index < 0) return `#${this.order.order_number}`;
    return units.length > 1 ? `#${this.order.order_number}-${index + 1}` : `#${this.order.order_number}`;
  }

  actorLabel(value: string | null | undefined): string {
    if (!value) return 'User';
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? 'Team member' : value;
  }

  trackEvent(event: OrderActivityRow): string {
    return event.id ?? `${event.created_at}|${event.activity_type}|${event.message ?? ''}|${event.new_status ?? ''}`;
  }
}
