import {OrderItemRow} from '../models/order.models';

export function orderItemImageUrl(item: OrderItemRow): string {
  const image = (item.image ?? {}) as Record<string, any>;
  const raw = (item.raw_item ?? {}) as Record<string, any>;
  return image['url'] || image['imageUrl'] || image['imageInfo']?.url || raw['media']?.url || raw['image']?.url || raw['image']?.imageInfo?.url || '';
}
