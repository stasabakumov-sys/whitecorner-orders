import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assetUrl,buildCatalog,plainText} from './hub-storefront-model.mjs';
const url='https://static.wixstatic.com/media/test.jpg';
const assets=new Map([[url,{bucket:'catalog-media',path:'wix/test.jpg'}]]);
const collections=[{id:'c',source_collection:{id:'c',name:'Event Backdrops',slug:'event-backdrops'}}];
const product=()=>({shipping_product_id:'hub-id',source_product:{id:'wix-id',name:'Test backdrop',slug:'test-backdrop',visible:true,description:'<p>Made here</p><script>bad()</script>',collectionIds:['c'],priceData:{price:100,discountedPrice:90,currency:'AUD'},media:{items:[{mediaType:'image',image:{url}}]},manageVariants:true,productOptions:[{name:'Colour',choices:[{description:'Raw'},{description:'White'}]}],variants:[{id:'raw',choices:{Colour:'Raw'},variant:{priceData:{price:100,discountedPrice:90,currency:'AUD'}},stock:{inStock:true,trackQuantity:false}},{id:'white',choices:{Colour:'White'},variant:{priceData:{price:150,discountedPrice:140,currency:'AUD'}},stock:{inStock:false,trackQuantity:true,quantity:0}}],costRange:{minValue:42},internal_comment:'PRIVATE'}});
test('keeps stable Hub IDs, price differences and unknown stock without leaking private fields',()=>{
 const p=buildCatalog([product()],collections,assets,'https://hub.example').products[0];
 assert.equal(p.id,'hub-id');assert.equal(p.price,90);assert.deepEqual(p.variants.map(v=>v.price),[90,140]);
 assert.equal(p.variants[0].quantity,null);assert.equal(p.variants[1].quantity,0);assert.equal(p.variants[1].inStock,false);
 assert.equal(p.details,'Made here');assert(!JSON.stringify(p).includes('PRIVATE'));assert(!JSON.stringify(p).includes('costRange'));
 assert.deepEqual(p.categoryIds,['c']);assert.match(p.images[0],/^https:\/\/hub.example\/storage/);
});
test('hidden products and hidden variants do not appear',()=>{const hidden=product();hidden.source_product.visible=false;const visible=product();visible.source_product.variants[1].variant.visible=false;const result=buildCatalog([hidden,visible],collections,assets,'https://hub.example');assert.equal(result.products.length,1);assert.equal(result.products[0].variants.length,1);});
test('incomplete media, missing categories and currency fail instead of publishing partial content',()=>{
 assert.throws(()=>buildCatalog([product()],collections,new Map(),'https://hub.example'),/copied/);
 assert.throws(()=>buildCatalog([product()],[],assets,'https://hub.example'),/unknown collection/);
 const p=product();p.source_product.variants[0].variant.priceData.currency='USD';assert.throws(()=>buildCatalog([p],collections,assets,'https://hub.example'),/AUD/);
});
test('media URL validation prevents SSRF and embedded credentials',()=>{for(const u of ['http://static.wixstatic.com/a','https://evil.test/a','https://static.wixstatic.com.evil.test/a','https://secret@static.wixstatic.com/a'])assert.throws(()=>assetUrl(u));});
test('HTML is converted to text; duplicate paths are rejected',()=>{assert.equal(plainText('<p>A &amp; B</p><p>C</p>'),'A & B\nC');assert.throws(()=>buildCatalog([product(),product()],collections,assets,'https://hub.example'),/duplicate/);});
