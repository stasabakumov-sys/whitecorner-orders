import {Component,Input} from '@angular/core';
import {productId} from '../../../../../supabase/functions/_shared/delivery-review-domain';

export function productLink(item:any):string{
 const params=new URLSearchParams();
 const wixId=item?.wix_product_id||productId(item||{});
 if(item?.shipping_product_id)params.set('productId',item.shipping_product_id);
 else if(wixId)params.set('wixProductId',wixId);
 if(item?.product_name)params.set('product',item.product_name);
 return '#/shipping-data?'+params.toString();
}

@Component({selector:'app-product-link',standalone:true,template:`
 <a [href]="href()" draggable="false" (click)="$event.stopPropagation()" (dblclick)="$event.stopPropagation()" (keydown)="$event.stopPropagation()" (dragstart)="stopDrag($event)" title="Open product in Products">{{item?.product_name||'Unnamed product'}}</a>
 `,styles:[`:host{display:inline}a{color:inherit;font:inherit;text-decoration:none;cursor:pointer}a:hover{text-decoration:underline;color:var(--p-primary-color)}a:focus-visible{outline:2px solid var(--p-primary-color);outline-offset:3px;border-radius:2px}`]})
export class ProductLinkComponent{
 @Input() item:any;
 href(){return productLink(this.item);}
 stopDrag(event:DragEvent){event.preventDefault();event.stopPropagation();}
}
