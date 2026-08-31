export interface ProductionUnitRow {
  id: string;
  unit_index: number;
  production_status: string;
  production_comment?: string | null;
  priority?: number | null;
}

export interface OrderItemRow {
  id: string;
  wix_line_item_id: string;
  product_name?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  wix_options?: Record<string, unknown> | null;
  custom_text_fields?: Record<string, unknown> | null;
  description_lines?: unknown[] | null;
  image?: Record<string, unknown> | null;
  raw_item?: Record<string, unknown> | null;
  catalog_reference?: Record<string, unknown> | null;
  wc_production_units?: ProductionUnitRow[];
}

export interface OrderRow {
  id: string;
  order_number: string;
  wix_created_at?: string | null;
  wix_synced_at?: string | null;
  payment_status?: string | null;
  fulfillment_status?: string | null;
  currency?: string | null;
  customer_name?: string | null;
  company?: string | null;
  buyer_email?: string | null;
  phone?: string | null;
  delivery_type?: string | null;
  delivery_title?: string | null;
  delivery_address?: Record<string, unknown> | null;
  buyer_note?: string | null;
  subtotal?: number | null;
  shipping?: number | null;
  tax?: number | null;
  discount?: number | null;
  total?: number | null;
  additional_fees?: number | null;
  activities?: unknown[] | Record<string, unknown> | string | null;
  raw_order?: Record<string, unknown> | null;
  wc_order_items?: OrderItemRow[];
}

export interface OrderActivityRow {
  id?: string;
  order_id: string;
  production_unit_id?: string | null;
  activity_type: 'note' | 'status_change' | 'wix';
  message?: string | null;
  old_status?: string | null;
  new_status?: string | null;
  created_by?: string | null;
  created_at: string;
}
