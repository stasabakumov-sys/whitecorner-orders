import { CurrencyPipe, DatePipe, NgFor, NgIf } from '@angular/common';
import { Component, EventEmitter, Input, Output, signal, OnChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ProductionStatus, ProductionUnitView } from '../../core/models/production.models';
import { ProductionService } from '../../core/services/production.service';
import { OrderActivityComponent } from '../order-activity/order-activity.component';

@Component({
  selector: 'app-production-unit-drawer',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, NgFor, NgIf, FormsModule, ButtonModule, DrawerModule, SelectModule, TagModule, OrderActivityComponent],
  templateUrl: './production-unit-drawer.component.html',
  styleUrl: './production-unit-drawer.component.css',
})
export class ProductionUnitDrawerComponent implements OnChanges {
  @Input({ required: true }) view!: ProductionUnitView;
  @Output() closed = new EventEmitter<void>();
  readonly saving = signal(false);
  readonly error = signal('');
  readonly checking = signal(true);
  readonly deliveryAllowed = signal(false);
  private checkVersion=0;
  constructor(readonly production: ProductionService, private readonly router: Router) {}

  ngOnChanges():void {void this.checkDelivery();}
  async checkDelivery():Promise<void>{
    const version=++this.checkVersion;
    this.checking.set(true);this.deliveryAllowed.set(false);this.error.set('');
    try {const decision=await this.production.checkDelivery(this.view.order.id);if(version===this.checkVersion)this.deliveryAllowed.set(decision.allowed===true);}
    catch(e){if(version===this.checkVersion)this.error.set((e as Error).message);}
    finally{if(version===this.checkVersion)this.checking.set(false);}
  }
  openDeliveryReview():void {
    this.closed.emit();
    void this.router.navigate(['/delivery-cost-review'],{queryParams:{order:this.view.order.order_number}});
  }

  async statusChanged(value: string): Promise<void> {
    if(this.saving()||this.checking()||!this.deliveryAllowed())return;
    this.saving.set(true);
    this.error.set('');
    try { await this.production.changeStatus(this.view, value as ProductionStatus); }
    catch (e) { this.error.set(String((e as Error)?.message ?? e)); }
    finally { this.saving.set(false); }
  }

  openOrder(): void {
    this.closed.emit();
    void this.router.navigate(['/orders'], { queryParams: { order: this.view.order.order_number } });
  }

  deliveryAmount(): number {
    const order = this.view.order;
    const direct = Number(order.shipping ?? 0);
    if (direct > 0) return direct;
    if ((order.delivery_type || 'Shipping') !== 'Shipping') return 0;
    const productSum = (order.wc_order_items ?? [])
      .filter(item => !/^delivery$/i.test(item.product_name ?? ''))
      .reduce((sum, item) => sum + Number(item.unit_price ?? 0) * Number(item.quantity ?? 1), 0);
    const residual = Number(order.total ?? 0) - productSum - Number(order.additional_fees ?? 0) + Math.abs(Number(order.discount ?? 0));
    return residual > 0.005 ? residual : 0;
  }

  abs(value: number): number { return Math.abs(value); }
}
