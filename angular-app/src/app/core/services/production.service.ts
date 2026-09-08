import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import { OrdersService } from './orders.service';
import { SupabaseService } from './supabase.service';
import { ActivityService } from './activity.service';
import { OrderActivityRow, OrderItemRow, OrderRow, ProductionUnitRow } from '../models/order.models';
import { ProductKind, ProductionStatus, ProductionUnitView, UnitAddonView } from '../models/production.models';
import { orderItemOptionLabels } from '../utils/order-item-display';

const STATUSES: ProductionStatus[] = ['New','CNC','Assembly','Painting','Packing','Ready'];
import {orderProducts} from '../utils/order-products';

@Injectable({ providedIn: 'root' })
export class ProductionService {
  readonly statuses = STATUSES;
  constructor(
    private readonly ordersService: OrdersService,
    private readonly supabase: SupabaseService,
    private readonly auth: AuthService,
    private readonly activity: ActivityService,
  ) {}

  unitsForOrders(orders: OrderRow[]): ProductionUnitView[] {
    return orders.flatMap((order) => this.unitsForOrder(order));
  }

  unitsForOrder(order: OrderRow): ProductionUnitView[] {
    const rows = (order.wc_order_items ?? []).filter((i) => !/^delivery$/i.test(i.product_name ?? ''));
    const composition = orderProducts(rows);
    const mains = composition.products.map(p=>p.item);

    // Legacy #10812: the first working prototype created the four tracked units
    // on the Tasmanian Oak upgrade row. Keep that mapping only as a data adapter
    // so existing status history is preserved; UI/pricing remains generic unit-level.
    if (String(order.order_number) === '10812') {
      const oak = rows.find((i) => /tasmanian oak timber benchtop upgrade/i.test(i.product_name ?? ''));
      const main = mains.find((i) => i !== oak);
      const tracked = this.sortedUnits(oak);
      if (main && oak && tracked.length) {
        return tracked.slice(0, Number(main.quantity ?? tracked.length)).map((unit, index) =>
          this.makeUnit(order, main, unit, index, tracked.length, [oak]),
        );
      }
    }

    return mains.flatMap((main) => {
      const tracked = this.sortedUnits(main);
      const expected = Math.max(1, Number(main.quantity ?? 1));
      return tracked.slice(0, expected).map((unit, index) =>
        this.makeUnit(order, main, unit, index, tracked.length || expected, composition.products.find(p=>p.item.id===main.id)!.components.filter(i=>i.id!==main.id)),
      );
    });
  }

  async changeStatus(view: ProductionUnitView, next: ProductionStatus): Promise<void> {
    const old = (view.unit.production_status || 'New') as ProductionStatus;
    if (old === next) return;
    const result = await this.deliveryAction({action:'production-status',orderId:view.order.id,unitId:view.unit.id,next});
    if(result.ok!==true)throw new Error('Production change was not confirmed. Reload the order.');
    view.unit.production_status = next;
    view.status = next;
    this.ordersService.orders.set([...this.ordersService.orders()]);
    if(result.activity)this.activity.rows.update(rows=>[result.activity as OrderActivityRow,...rows]);
  }

  async checkDelivery(orderId:string):Promise<{allowed:boolean;status:string}>{
    return this.deliveryAction({action:'production-check',orderId});
  }

  private async deliveryAction(body:Record<string,unknown>){
    const {data,error}=await this.supabase.client.functions.invoke('delivery-cost-review',{body});
    if(error){
      const detail=await error.context?.json?.().catch(()=>null);
      throw new Error(detail?.error||'Delivery approval could not be verified. Reload before continuing.');
    }
    if(data?.error)throw new Error(data.error);
    if(!data)throw new Error('Delivery approval response missing.');
    return data;
  }

  imageUrl(item: OrderItemRow): string {
    const image = (item.image ?? {}) as Record<string, any>;
    const raw = (item.raw_item ?? {}) as Record<string, any>;
    return image['url'] || image['imageUrl'] || image['imageInfo']?.url || raw['media']?.url || raw['image']?.url || raw['image']?.imageInfo?.url || '';
  }

  optionLabels(item: OrderItemRow): string[] {
    return orderItemOptionLabels(item, 12);
  }

  private makeUnit(order: OrderRow, main: OrderItemRow, unit: ProductionUnitRow, index: number, trackedCount: number, addons: OrderItemRow[]): ProductionUnitView {
    const totalUnits = Math.max(1, Number(main.quantity ?? trackedCount ?? 1));
    const displayIndex = index + 1;
    const allocated = addons.map((addon) => this.allocateAddon(addon, totalUnits)).filter((x): x is UnitAddonView => !!x);
    const mainUnitPrice = Number(main.unit_price ?? 0);
    const unitTotal = mainUnitPrice + allocated.reduce((sum, addon) => sum + addon.total, 0);
    return {
      order,
      mainItem: main,
      unit,
      code: totalUnits > 1 ? `#${order.order_number}-${displayIndex}` : `#${order.order_number}`,
      displayIndex,
      totalUnits,
      kind: this.kind(main.product_name),
      status: (unit.production_status || 'New') as ProductionStatus,
      mainUnitPrice,
      addons: allocated,
      unitTotal,
    };
  }

  private allocateAddon(addon: OrderItemRow, totalUnits: number): UnitAddonView | null {
    const qty = Math.max(0, Number(addon.quantity ?? 0));
    if (!qty) return null;
    let perUnit = 0;
    if (totalUnits === 1) perUnit = qty;
    else if (qty % totalUnits === 0) perUnit = qty / totalUnits;
    else return null;
    const unitPrice = Number(addon.unit_price ?? 0);
    return { item: addon, quantity: perUnit, unitPrice, total: unitPrice * perUnit };
  }

  private sortedUnits(item?: OrderItemRow): ProductionUnitRow[] {
    return [...(item?.wc_production_units ?? [])].sort((a,b) => Number(a.unit_index) - Number(b.unit_index));
  }

  private kind(name?: string | null): ProductKind {
    const value = String(name ?? '').toLowerCase();
    if (/cart|mobile bar|serving table|event bar/.test(value)) return 'carts';
    if (/backdrop|arch|panel|wall|plinth/.test(value)) return 'backdrops';
    return 'others';
  }
}
