import { NgFor, NgIf } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { ProductKind, ProductionStatus, ProductionUnitView } from '../../core/models/production.models';
import { OrdersService } from '../../core/services/orders.service';
import { ProductionService } from '../../core/services/production.service';
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
  readonly allUnits = computed(() => this.production.unitsForOrders(this.orders.orders()));
  readonly visibleUnits = computed(() => {
    const filter = this.filter();
    return this.allUnits()
      .filter((unit) => filter === 'all' || unit.kind === filter)
      .sort((a,b) => new Date(a.order.wix_created_at ?? 0).getTime() - new Date(b.order.wix_created_at ?? 0).getTime() || Number(a.order.order_number) - Number(b.order.order_number));
  });

  constructor(readonly orders: OrdersService, readonly production: ProductionService) {
    if (!orders.orders().length) void orders.load();
  }

  units(status: ProductionStatus): ProductionUnitView[] { return this.visibleUnits().filter((unit) => unit.status === status); }
  selectFilter(filter: FilterKind): void { this.filter.set(filter); }
  open(unit: ProductionUnitView): void { this.selected.set(unit); }
}
