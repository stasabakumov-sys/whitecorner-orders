import {CurrencyPipe,DatePipe} from '@angular/common';
import {Component,ElementRef,EventEmitter,Input,Output,ViewChild,signal} from '@angular/core';
import {OrderRow,OrderItemRow} from '../../core/models/order.models';
import {isDeliveryLine} from '../../core/utils/order-products';
import {orderItemOptionLabels} from '../../core/utils/order-item-display';

@Component({selector:'app-order-print',standalone:true,imports:[CurrencyPipe,DatePipe],
template:`<div class="print-overlay" role="dialog" aria-modal="true" aria-label="Print order">
 <header><span>Order #{{order.order_number}}</span><div><button (click)="download()" [disabled]="busy()">{{busy()?'Preparing PDF…':'Download PDF'}}</button><button (click)="print()" [disabled]="busy()">Print</button></div><button (click)="closed.emit()" aria-label="Close print preview">×</button></header>
 @if(error()){<p class="print-error" role="alert">{{error()}}</p>}
 <div class="paper-scroll"><article #paper class="order-paper">
  <section class="pdf-block"><h1>Order #{{order.order_number}} ({{count()}} {{count()===1?'item':'items'}})</h1><p>{{order.customer_name||'—'}}{{order.buyer_email?', '+order.buyer_email:''}}{{order.phone?', '+order.phone:''}}</p><p>Placed on {{order.wix_created_at|date:'d MMM yyyy, h:mm a':'+1000'}}</p></section>
  @for(item of items();track item.id){<section class="pdf-block print-item"><div>@if(image(item)){<img [src]="image(item)" alt="">}</div><div><b>{{item.product_name}}</b>@for(option of options(item);track option){<p>{{option}}</p>}</div><span>{{item.unit_price||0|currency:currency():'symbol-narrow'}}</span><span>×{{item.quantity??1}}</span><span>{{(item.unit_price||0)*(item.quantity??1)|currency:currency():'symbol-narrow'}}</span></section>}
  <section class="pdf-block totals"><div><span>Items · incl. GST</span><span>{{order.subtotal??itemsTotal()|currency:currency():'symbol-narrow'}}</span></div><div><span>Shipping</span><span>{{order.shipping||0|currency:currency():'symbol-narrow'}}</span></div>
   @if(order.discount){<div><span>Discount</span><span>−{{abs(order.discount)|currency:currency():'symbol-narrow'}}</span></div>}
   @if(order.additional_fees){<div><span>Fees</span><span>{{order.additional_fees|currency:currency():'symbol-narrow'}}</span></div>}
   <div><span>Included tax</span><span>{{order.tax??0|currency:currency():'symbol-narrow'}}</span></div><div class="grand-total"><b>Total</b><b>{{order.total||0|currency:currency():'symbol-narrow'}}</b></div><div><span>Paid</span><span>{{order.payment_status==='PAID'?(order.total||0|currency:currency():'symbol-narrow'):'—'}}</span></div>
  </section>
  <section class="pdf-block customer"><h2>Customer Details</h2><div class="addresses"><div><b>{{pickup()?'Pickup Address':'Delivery Address'}}</b><p>{{pickup()?'6/1 Hornet Pl, Burleigh Heads QLD 4220, Australia':address(order.delivery_address)}}</p></div><div><b>Billing Address</b><p>{{address(billing())}}</p></div></div><b>Delivery Method</b><p>{{order.delivery_title||order.delivery_type||'—'}}</p>@if(order.buyer_note){<b>Buyer note</b><p>{{order.buyer_note}}</p>}</section>
  <footer class="pdf-block"><b>White Corner Group Pty Ltd</b><p>6/1 Hornet Pl, Burleigh Heads QLD 4220, Australia | info@whitecorner.com.au</p></footer>
 </article></div></div>`,
styles:[`.print-overlay{position:fixed;inset:0;background:#515669cc;z-index:10000;display:flex;flex-direction:column}.print-overlay>header{display:flex;align-items:center;justify-content:space-between;gap:15px;background:#030923;color:#fff;padding:16px 22px}.print-overlay button{border:0;background:transparent;color:inherit;font:inherit;padding:6px 12px;cursor:pointer}.print-overlay button:disabled{opacity:.5;cursor:wait}.paper-scroll{overflow:auto;padding:22px}.order-paper{box-sizing:border-box;background:white;color:#111;width:794px;min-height:1123px;margin:auto;padding:48px;font:15px/1.5 Arial,sans-serif;display:flex;flex-direction:column;gap:24px}.order-paper h1{font-size:24px;margin:0}.order-paper h2{font-size:20px;margin:0 0 16px}.order-paper p{margin:2px 0}.print-item{display:grid;grid-template-columns:48px minmax(0,1fr) 85px 40px 85px;gap:12px}.print-item img{width:48px;height:48px;object-fit:cover;border-radius:5px}.print-item>span{text-align:right;white-space:nowrap}.totals{border-top:1px solid #aeb4ba;padding-top:8px}.totals>div{display:flex;justify-content:space-between;gap:20px;width:50%;margin-left:auto;padding:6px 0}.totals .grand-total{border-block:1px solid #aeb4ba;margin-block:8px;font-size:20px}.addresses{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:16px}.order-paper footer{margin-top:auto;border-top:1px solid #aeb4ba;padding-top:16px;font-size:13px}.print-error{background:#fff1f1;color:#a11;padding:12px;margin:0}`]})
export class OrderPrintComponent {
 @Input({required:true}) order!:OrderRow;
 @Output() closed=new EventEmitter<void>();
 @ViewChild('paper') paper!:ElementRef<HTMLElement>;
 busy=signal(false);error=signal('');abs=Math.abs;
 items(){return(this.order.wc_order_items??[]).filter(i=>!isDeliveryLine(i));}
 count(){return this.items().reduce((n,i)=>n+Number(i.quantity??1),0);}
 itemsTotal(){return this.items().reduce((n,i)=>n+Number(i.quantity??1)*Number(i.unit_price??0),0);}
 currency(){return this.order.currency||'AUD';}
 options(item:OrderItemRow){return orderItemOptionLabels(item,30);}
 image(item:OrderItemRow){const i=item.image as any,r=item.raw_item as any;return i?.url||i?.imageUrl||i?.imageInfo?.url||r?.media?.url||r?.image?.url||'';}
 pickup(){return /pick.?up/i.test(this.order.delivery_type||this.order.delivery_title||'');}
 billing(){return(this.order.raw_order as any)?.billingInfo?.address;}
 address(a:any){if(!a)return 'Not available';return [...new Set([a.addressLine,a.addressLine1,a.streetAddress?.formattedAddress,a.city,a.suburb,a.subdivision,a.state,a.postalCode,a.postcode,a.country].filter(v=>typeof v==='string'&&v))].join(', ');}
 async download(){
  if(this.busy())return;this.busy.set(true);this.error.set('');
  try{
   const [{jsPDF},{default:html2canvas}]=await Promise.all([import('jspdf'),import('html2canvas')]);
   const pdf=new jsPDF({unit:'mm',format:'a4'});let y=13;
   for(const block of Array.from(this.paper.nativeElement.querySelectorAll<HTMLElement>('.pdf-block'))){
    const canvas=await html2canvas(block,{scale:2,useCORS:true,backgroundColor:'#ffffff',logging:false});
    const height=canvas.height/canvas.width*184;
    if(y+height>284&&y>13){pdf.addPage();y=13;}
    if(block.tagName==='FOOTER'&&height<50)y=Math.max(y,284-height);
    // Slice oversized blocks so very long options never disappear beyond a page.
    let sourceY=0;
    while(sourceY<canvas.height){
     const pixels=Math.min(canvas.height-sourceY,Math.floor((284-y)*canvas.width/184));
     if(pixels<1){pdf.addPage();y=13;continue;}
     const slice=document.createElement('canvas');slice.width=canvas.width;slice.height=pixels;
     slice.getContext('2d')!.drawImage(canvas,0,sourceY,canvas.width,pixels,0,0,canvas.width,pixels);
     const h=pixels/canvas.width*184;pdf.addImage(slice.toDataURL('image/png'),'PNG',13,y,184,h);y+=h;sourceY+=pixels;
     if(sourceY<canvas.height){pdf.addPage();y=13;}
    }
    y+=6;
   }
   pdf.save('order_'+String(this.order.order_number).replace(/[^\w-]/g,'_')+'.pdf');
  }catch{this.error.set('Could not create the PDF. Please try again or use Print.');}finally{this.busy.set(false);}
 }
 print(){
  this.error.set('');const popup=window.open('','_blank');
  if(!popup){this.error.set('Print window was blocked. Allow pop-ups and try again.');return;}
  popup.document.title='Order #'+this.order.order_number;
  for(const style of Array.from(document.querySelectorAll('style,link[rel="stylesheet"]')))popup.document.head.appendChild(style.cloneNode(true));
  const style=popup.document.createElement('style');style.textContent='@page{size:A4;margin:12mm}body{margin:0}.order-paper{width:100%!important;min-height:260mm!important;margin:0!important;padding:0!important;box-sizing:border-box}.pdf-block{break-inside:avoid}';popup.document.head.appendChild(style);
  popup.document.body.appendChild(this.paper.nativeElement.cloneNode(true));
  void Promise.all(Array.from(popup.document.images).map(img=>img.decode().catch(()=>undefined))).then(()=>{popup.focus();popup.print();});
 }
}
