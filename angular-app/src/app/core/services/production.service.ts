import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import { OrdersService } from './orders.service';
import { SupabaseService } from './supabase.service';
import { ActivityService } from './activity.service';
import { OrderActivityRow, OrderItemRow, OrderRow, ProductionUnitRow } from '../models/order.models';
import { ProductKind, ProductionStatus, ProductionUnitView, UnitAddonView } from '../models/production.models';

const STATUSES: ProductionStatus[] = ['New','CNC','Assembly','Painting','Packing','Ready'];
const ADDON_WORDS = ['additional tabletop','custom cutout','custom cutouts','side shelves','integrated ice storage shelf','umbrella hole','support panel','customisation','customization','back panel with','benchtop upgrade'];

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
    const addons = rows.filter((i) => this.isAddon(i));
    const mains = rows.filter((i) => !this.isAddon(i));

    // Legacy #10812: the first working prototype created the four tracked units
    // on the Tasmanian Oak upgrade row. Keep that mapping only as a data adapter
    // so existing status history is preserved; UI/pricing remains generic unit-level.
    if (String(order.order_number) === '10812') {
      const oak = rows.find((i) => /tasmanian oak timber benchtop upgrade/i.test(i.product_name ?? ''));
      const main = rows.find((i) => i !== oak && !this.isAddon(i));
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
        this.makeUnit(order, main, unit, index, tracked.length || expected, addons),
      );
    });
  }

  async changeStatus(view: ProductionUnitView, next: ProductionStatus): Promise<void> {
    const old = (view.unit.production_status || 'New') as ProductionStatus;
    if (old === next) return;
    const { error } = await this.supabase.client
      .from('wc_production_units')
      .update({ production_status: next })
      .eq('id', view.unit.id);
    if (error) throw error;

    view.unit.production_status = next;
    view.status = next;
    this.ordersService.orders.set([...this.ordersService.orders()]);

    const { data, error: activityError } = await this.supabase.client
      .from('wc_order_activity')
      .insert({
        order_id: view.order.id,
        production_unit_id: view.unit.id,
        activity_type: 'status_change',
        old_status: old,
        new_status: next,
        created_by: this.auth.userEmail() || 'User',
      })
      .select()
      .single();
    if (activityError) {
      throw new Error(`Status changed, but activity history could not be saved: ${activityError.message}`);
    }
    if (data) this.activity.rows.update((rows) => [data as OrderActivityRow, ...rows]);
  }

  imageUrl(item: OrderItemRow): string {
    const image = (item.image ?? {}) as Record<string, any>;
    const raw = (item.raw_item ?? {}) as Record<string, any>;
    return image['url'] || image['imageUrl'] || image['imageInfo']?.url || raw['media']?.url || raw['image']?.url || raw['image']?.imageInfo?.url || '';
  }

  optionLabels(item: OrderItemRow): string[] {
    const out: string[] = [];
    for (const source of [item.wix_options, item.custom_text_fields]) {
      if (!source || typeof source !== 'object') continue;
      for (const [key, value] of Object.entries(source)) {
        let label = '';
        if (value != null && typeof value === 'object') {
          const obj = value as Record<string, unknown>;
          label = String(obj['value'] ?? obj['name'] ?? obj['description'] ?? '');
        } else if (value != null) label = String(value);
        if (label) out.push(`${key}: ${label}`);
      }
    }
    return [...new Set(out)].slice(0, 10);
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

  private isAddon(item: OrderItemRow): boolean {
    const name = String(item.product_name ?? '').toLowerCase();
    return ADDON_WORDS.some((word) => name.includes(word));
  }

  private kind(name?: string | null): ProductKind {
    const value = String(name ?? '').toLowerCase();
    if (/cart|mobile bar|serving table|event bar/.test(value)) return 'carts';
    if (/backdrop|arch|panel|wall|plinth/.test(value)) return 'backdrops';
    return 'others';
  }
}
