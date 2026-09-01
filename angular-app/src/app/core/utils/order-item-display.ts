import { OrderItemRow } from '../models/order.models';

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

export function orderItemOptionLabels(item: OrderItemRow, limit = 12): string[] {
  const out: string[] = [];

  // Wix has used different line-item shapes over time. Keep one canonical
  // extraction path for the whole Hub, ordered from normalized fields to raw fallbacks.
  addObject(out, item.wix_options);
  addObject(out, item.custom_text_fields);
  addDescriptionLines(out, item.description_lines);

  const raw = item.raw_item ?? {};
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    for (const key of ['options','selectedOptions','selected_options','choices','customTextFields','custom_text_fields','lineItemOptions']) {
      addObject(out, r[key]);
    }
    for (const key of ['descriptionLines','description_lines']) addDescriptionLines(out, r[key]);
  }

  return [...new Set(out.map(x => x.trim()).filter(Boolean))].slice(0, limit);
}
