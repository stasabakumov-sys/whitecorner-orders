import { CurrencyPipe, DatePipe, NgFor, NgIf } from '@angular/common';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProductionStatus, ProductionUnitView } from '../../core/models/production.models';
import { ProductionService } from '../../core/services/production.service';
import { OrderActivityComponent } from '../order-activity/order-activity.component';

@Component({
  selector: 'app-production-unit-drawer',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, NgFor, NgIf, FormsModule, OrderActivityComponent],
  templateUrl: './production-unit-drawer.component.html',
  styleUrl: './production-unit-drawer.component.css',
})
export class ProductionUnitDrawerComponent {
  @Input({ required: true }) view!: ProductionUnitView;
  @Output() closed = new EventEmitter<void>();
  readonly saving = signal(false);
  readonly error = signal('');
  constructor(readonly production: ProductionService) {}

  async statusChanged(value: string): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try { await this.production.changeStatus(this.view, value as ProductionStatus); }
    catch (e) { this.error.set(String((e as Error)?.message ?? e)); }
    finally { this.saving.set(false); }
  }
}
