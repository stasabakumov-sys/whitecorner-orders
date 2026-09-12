import { NgFor, NgIf } from '@angular/common';
import { Component, afterNextRender, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { ProductKind, ProductionStatus, ProductionUnitView } from '../../core/models/production.models';
import { OrdersService } from '../../core/services/orders.service';
import { ProductionService } from '../../core/services/production.service';
import { orderProducts } from '../../core/utils/order-products';
import { ProductionUnitDrawerComponent } from '../../shared/production-unit-drawer/production-unit-drawer.component';

type FilterKind = 'all' | ProductKind;

@Component({
  selector: 'app-production-board',
  standalone: true,
  imports: [NgFor, NgIf, ButtonModule, CardModule, TagModule, ProductionUnitDrawerComponent],
  templateUrl: './production-board.component.html',
  styleUrl: './production-board.component.css',
})
export class ProductionBoardComponent {
  readonly filter = signal<FilterKind>('all');
  readonly selected = signal<ProductionUnitView | null>(null);
  readonly dragging = signal<string|null>(null);
  readonly dropTarget = signal<ProductionStatus|null>(null);
  readonly moving = signal(false);
  readonly moveError = signal('');
  readonly moveMessage = signal('');
  private suppressClickUntil = 0;
  readonly firstPaintComplete = signal(false);
  readonly compositionIssues = computed(() => this.orders.orders().filter(o=>String(o.fulfillment_status||'').toUpperCase()!=='FULFILLED').flatMap(o=>orderProducts(o.wc_order_items||[]).unresolved.map(i=>`#${o.order_number}: cannot assign ${i.product_name} to a product. Composition review required.`)));
  readonly allUnits = computed(() => this.production.unitsForOrders(this.orders.orders().filter(order=>String(order.fulfillment_status||'').toUpperCase()!=='FULFILLED')));
  readonly visibleUnits = computed(() => {
    const filter = this.filter();
    return this.allUnits()
      .filter((unit) => filter === 'all' || unit.kind === filter)
      .sort((a,b) => new Date(a.order.wix_created_at ?? 0).getTime() - new Date(b.order.wix_created_at ?? 0).getTime() || Number(a.order.order_number) - Number(b.order.order_number));
  });
  readonly groupedUnits = computed(() => {
    const groups = new Map<ProductionStatus, ProductionUnitView[]>(this.production.statuses.map((status) => [status, []]));
    for (const unit of this.visibleUnits()) groups.get(unit.status)?.push(unit);
    return groups;
  });
  readonly boardReady = computed(() => this.firstPaintComplete() && !this.orders.loading());

  constructor(readonly orders: OrdersService, readonly production: ProductionService, private readonly router: Router) {
    if (!orders.orders().length) void orders.load();
    afterNextRender(() => this.firstPaintComplete.set(true));
  }

  units(status: ProductionStatus): ProductionUnitView[] { return this.groupedUnits().get(status) ?? []; }
  trackStatus(_index: number, status: ProductionStatus): ProductionStatus { return status; }
  trackUnit(_index: number, unit: ProductionUnitView): string { return unit.unit.id; }
  revealImage(event: Event): void { (event.currentTarget as HTMLImageElement).classList.add('loaded'); }
  selectFilter(filter: FilterKind): void { this.filter.set(filter); }
  open(unit: ProductionUnitView): void {
    if (!this.moving() && Date.now() > this.suppressClickUntil) this.selected.set(unit);
  }
  dragStart(event: DragEvent, unit: ProductionUnitView): void {
    if (this.moving()) { event.preventDefault(); return; }
    this.dragging.set(unit.unit.id);
    this.moveError.set(''); this.moveMessage.set('');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed='move';
      event.dataTransfer.setData('text/plain',unit.unit.id);
    }
  }
  dragOver(event: DragEvent, status: ProductionStatus): void {
    if (!this.dragging() || this.moving()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect='move';
    this.dropTarget.set(status);
  }
  dragEnd(): void {
    this.dragging.set(null); this.dropTarget.set(null);
    this.suppressClickUntil=Date.now()+300;
  }
  async drop(event: DragEvent, status: ProductionStatus): Promise<void> {
    event.preventDefault();
    const id=this.dragging();
    this.dragEnd();
    if (!id || this.moving()) return;
    const unit=this.visibleUnits().find(u=>u.unit.id===id);
    if (!unit || unit.status===status) return;
    this.moving.set(true);
    try {
      await this.production.changeStatus(unit,status);
      this.moveMessage.set(`${unit.code}: ${status}`);
    } catch(error) {
      this.moveError.set(error instanceof Error?error.message:'Could not move the card. Please try again.');
    } finally { this.moving.set(false); }
  }
  openOrder(unit: ProductionUnitView, event: Event): void {
    event.stopPropagation();
    void this.router.navigate(['/orders'], { queryParams: { order: unit.order.order_number } });
  }
  openTimer(unit: ProductionUnitView, event: Event): void {
    event.stopPropagation();
    void this.router.navigate(['/shop-floor'], { queryParams: { unit: unit.unit.id } });
  }
}
