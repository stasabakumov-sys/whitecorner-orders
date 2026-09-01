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
      <div class="box">
        <div class="box-title">Order activity</div>
        <div class="timeline-wrap">
          <div class="note-row">
            <div class="rail"><span class="dot"></span><span class="line"></span></div>
            <div class="note-main">
              <label>Add a note <span>(Your customer won't see this)</span></label>
              <textarea #note></textarea>
              <div class="note-actions">
                <button (click)="addNote(note.value); note.value=''" [disabled]="busy()">{{ busy() ? 'Adding…' : 'Add note' }}</button>
              </div>
            </div>
          </div>

          @if (!events().length) {
            <div class="empty">No activity yet.</div>
          } @else {
            @for (group of grouped(); track group.key) {
              <div class="date-row">
                <div class="rail"><span class="line"></span></div>
                <div class="date">{{ group.date | date:'MMM d, yyyy' }}</div>
              </div>
              @for (event of group.items; track trackEvent(event)) {
                <div class="event-row">
                  <div class="rail"><span class="dot"></span><span class="line"></span></div>
                  <div class="event-content">
                    <div class="event-text">
                      @if (event.activity_type === 'status_change') {
                        @if (event.production_unit_id) { <b>{{ unitLabel(event.production_unit_id) }}</b> · }
                        Status changed from <b>{{ event.old_status || '—' }}</b> to <b>{{ event.new_status || '—' }}</b>
                      } @else if (event.activity_type === 'note') {
                        <b>{{ event.created_by || 'User' }}</b> added a note: {{ event.message }}
                      } @else {
                        {{ event.message }}
                      }
                    </div>
                    <div class="time">{{ event.created_at | date:'h:mm a' }}</div>
                  </div>
                </div>
              }
            }
          }
        </div>
      </div>
    </section>
  `,
  styles: [`
    .activity-section{margin-top:20px}.box{border:1px solid #e4e7ec;border-radius:10px;background:#fff;overflow:hidden}.box-title{padding:18px 26px;font-size:18px;font-weight:600;color:#101828;border-bottom:1px solid #e4e7ec}.timeline-wrap{padding:20px 26px 24px}.note-row,.date-row,.event-row{display:grid;grid-template-columns:20px minmax(0,1fr);position:relative}.rail{position:relative;min-height:100%}.dot{position:absolute;left:5px;top:9px;width:8px;height:8px;border-radius:50%;background:#667085;z-index:2}.line{position:absolute;left:8.5px;top:14px;bottom:-2px;width:1px;background:#98a2b3}.note-row .line{top:14px;bottom:-22px}.note-main{padding:0 0 24px 12px}.note-main label{display:block;font-size:14px;color:#101828;margin-bottom:7px}.note-main label span{color:#475467;font-weight:400}.note-main textarea{width:min(560px,100%);height:42px;min-height:42px;max-height:110px;resize:vertical;border:1px solid #b7cdfb;border-radius:8px;padding:8px 10px;font:inherit;outline:none}.note-main textarea:focus{border-color:#116dff;box-shadow:0 0 0 1px #116dff}.note-actions{margin-top:7px}.note-actions button{background:#116dff;color:#fff;border:0;border-radius:7px;padding:7px 12px;font-size:13px;cursor:pointer}.date-row{min-height:38px}.date-row .line{top:-2px;bottom:-2px}.date{padding:8px 0 8px 12px;font-size:14px;color:#8b97b1}.event-row{min-height:42px}.event-row .line{top:14px;bottom:-1px}.event-content{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:20px;align-items:start;padding:3px 0 14px 12px}.event-text{font-size:14px;line-height:1.4;color:#101828;white-space:pre-wrap}.event-text b{font-weight:600}.time{font-size:13px;color:#8b97b1;white-space:nowrap;padding-top:1px}.empty{padding:12px 0 4px 32px;color:#758198;font-size:13px}@media(max-width:700px){.box-title{padding:15px 18px}.timeline-wrap{padding:16px 18px}.event-content{grid-template-columns:1fr;gap:3px}.time{font-size:12px}}
  `],
})
export class OrderActivityComponent implements OnInit {
  @Input({ required: true }) order!: OrderRow;
  readonly busy = signal(false);

  constructor(readonly activity: ActivityService) {}

  ngOnInit(): void { void this.activity.load(); }

  events(): OrderActivityRow[] { return this.activity.eventsFor(this.order); }

  grouped(): { key: string; date: Date; items: OrderActivityRow[] }[] {
    const groups = new Map<string, OrderActivityRow[]>();
    for (const event of this.events()) {
      const d = new Date(event.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(event);
    }
    return [...groups.entries()].map(([key, items]) => ({ key, date: new Date(items[0].created_at), items }));
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

  trackEvent(event: OrderActivityRow): string {
    return event.id ?? `${event.created_at}|${event.activity_type}|${event.message ?? ''}|${event.new_status ?? ''}`;
  }
}
