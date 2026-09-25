import {Component,Input,inject} from '@angular/core';
import {Router} from '@angular/router';
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
 <a [href]="href()" draggable="false" (click)="open($event)" (dblclick)="$event.stopPropagation()" (keydown)="$event.stopPropagation()" (dragstart)="stopDrag($event)" title="Open product in Products">{{item?.product_name||'Unnamed product'}}</a>
 `,styles:[`:host{display:inline}a{color:inherit;font:inherit;text-decoration:none;cursor:pointer}a:hover{text-decoration:underline;color:var(--p-primary-color)}a:focus-visible{outline:2px solid var(--p-primary-color);outline-offset:3px;border-radius:2px}`]})
export class ProductLinkComponent{
 @Input() item:any;
 private readonly router=inject(Router);
 href(){return productLink(this.item);}
 open(event:MouseEvent){
  event.stopPropagation();
  if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();
  void this.router.navigateByUrl(this.href().slice(1));
 }
 stopDrag(event:DragEvent){event.preventDefault();event.stopPropagation();}
}
