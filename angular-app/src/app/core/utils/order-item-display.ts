import { OrderItemRow } from '../models/order.models';

const TECHNICAL_KEYS = /^(?:id|_id|appId|catalogItemId|variantId|productId|lineItemId|subscriptionOptionId)$/i;

function scalar(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if (typeof value !== 'object') return '';
  const obj = value as Record<string, unknown>;
  for (const key of ['value','name','description','text','plainText','label','title']) {
    const candidate = scalar(obj[key]);
    if (candidate) return candidate;
  }
  return '';
}

function addObject(out: string[], source: unknown): void {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return;
  for (const [key, raw] of Object.entries(source as Record<string, unknown>)) {
    if (TECHNICAL_KEYS.test(key)) continue;
    const value = scalar(raw);
    if (value) out.push(`${key}: ${value}`);
  }
}

function addDescriptionLines(out: string[], lines: unknown): void {
  if (!Array.isArray(lines)) return;
  for (const line of lines) {
    if (typeof line === 'string') {
      const value = line.trim();
      if (value) out.push(value);
      continue;
    }
    if (!line || typeof line !== 'object') continue;
    const obj = line as Record<string, unknown>;
    const label = scalar(obj['name'] ?? obj['label'] ?? obj['title']);
    const value = scalar(obj['value'] ?? obj['description'] ?? obj['text'] ?? obj['plainText']);
    if (label && value && label !== value) out.push(`${label}: ${value}`);
    else if (value) out.push(value);
  }
}

function addWixOptionsContainer(out: string[], source: unknown): void {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return;
  const obj = source as Record<string, unknown>;
  const wrapperKeys = ['options','customTextFields','custom_text_fields','selectedOptions','selected_options','choices','lineItemOptions'];
  let usedWrapper = false;
  for (const key of wrapperKeys) {
    if (obj[key] != null) {
      addObject(out, obj[key]);
      usedWrapper = true;
    }
  }
  // For non-managed Wix variants the option-name/value pairs may live directly here.
  // Managed variants may expose only variantId; technical IDs are intentionally hidden.
  if (!usedWrapper) addObject(out, obj);
}

export function orderItemOptionLabels(item: OrderItemRow, limit = 12): string[] {
  const out: string[] = [];

  addObject(out, item.wix_options);
  addObject(out, item.custom_text_fields);
  addDescriptionLines(out, item.description_lines);

  const catalog = item.catalog_reference;
  if (catalog && typeof catalog === 'object') {
    const c = catalog as Record<string, unknown>;
    addWixOptionsContainer(out, c['options']);
  }

  const raw = item.raw_item ?? {};
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    for (const key of ['options','selectedOptions','selected_options','choices','customTextFields','custom_text_fields','lineItemOptions']) {
      addObject(out, r[key]);
    }
    for (const key of ['descriptionLines','description_lines']) addDescriptionLines(out, r[key]);

    const rawCatalog = r['catalogReference'];
    if (rawCatalog && typeof rawCatalog === 'object') {
      const rc = rawCatalog as Record<string, unknown>;
      addWixOptionsContainer(out, rc['options']);
    }
  }

  return [...new Set(out.map(x => x.trim()).filter(Boolean))].slice(0, limit);
}
