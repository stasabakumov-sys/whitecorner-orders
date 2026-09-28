import {describe,expect,it} from 'vitest';
import {ShippingDataComponent} from './shipping-data.component';

describe('Product catalogue thumbnails',()=>{
  const setup=()=>new ShippingDataComponent({} as any,undefined,{orders:()=>[]} as any);
  const product={id:'hub-product',product_name:'Cart',wix_product_id:'wix-product'};
  it('uses the Hub photo for the exact internal ID even without orders',()=>{
    const component=setup();
    component.hubImages.set({'hub-product':['https://hub.example/cart.jpg'],other:['https://hub.example/other.jpg']});
    expect(component.productImage(product)).toBe('https://hub.example/cart.jpg');
    expect(component.productImage({...product,id:'unrelated'})).toBe('');
  });
  it('uses the imported gallery if the main image fails, then displays a placeholder',()=>{
    const component=setup();
    component.catalogProducts.set({'hub-product':{media:{mainMedia:{image:{url:'https://images.example/main.jpg'}},items:[{mediaType:'image',image:{url:'https://images.example/second.jpg'}}]}}});
    expect(component.productImage(product)).toBe('https://images.example/main.jpg');
    component.failedImages.add('https://images.example/main.jpg');
    expect(component.productImage(product)).toBe('https://images.example/second.jpg');
    component.failedImages.add('https://images.example/second.jpg');
    expect(component.productImage(product)).toBe('');
  });
  it('keeps already loaded Hub photos and reports a failed refresh',async()=>{
    const component=new ShippingDataComponent({client:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({error:{message:'Unavailable'}})})})})}} as any,undefined,{orders:()=>[]} as any);
    component.hubImages.set({'hub-product':['https://hub.example/cart.jpg']});
    await component.loadHubImages();
    expect(component.imageError()).toContain('Retry');
    expect(component.productImage(product)).toBe('https://hub.example/cart.jpg');
  });
});
