import { OrderItemRow, OrderRow, ProductionUnitRow } from './order.models';

export type ProductionStatus = 'New' | 'CNC' | 'Assembly' | 'Painting' | 'Packing' | 'Ready';
export type ProductKind = 'backdrops' | 'carts' | 'others';

export interface UnitAddonView {
  item: OrderItemRow;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ProductionUnitView {
  order: OrderRow;
  mainItem: OrderItemRow;
  unit: ProductionUnitRow;
  code: string;
  displayIndex: number;
  totalUnits: number;
  kind: ProductKind;
  status: ProductionStatus;
  mainUnitPrice: number;
  addons: UnitAddonView[];
  unitTotal: number;
}
