import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assetUrl,buildCatalog,plainText} from './hub-storefront-model.mjs';
import {cardPresentation} from './hub-storefront-presentation.mjs';
const url='https://static.wixstatic.com/media/test.jpg';
const assets=new Map([[url,{bucket:'catalog-media',path:'wix/test.jpg'}]]);
const collections=[{id:'c',source_collection:{id:'c',name:'Event Backdrops',slug:'event-backdrops'}}];
const product=()=>({shipping_product_id:'hub-id',source_product:{createdDate:'2024-01-01T00:00:00Z',id:'wix-id',name:'Test backdrop',slug:'test-backdrop',visible:true,description:'<p>Made here</p><script>bad()</script>',collectionIds:['c'],priceData:{price:100,discountedPrice:90,currency:'AUD'},media:{items:[{mediaType:'image',image:{url}}]},manageVariants:true,productOptions:[{name:'Colour',choices:[{description:'Raw'},{description:'White'}]}],variants:[{id:'raw',choices:{Colour:'Raw'},variant:{priceData:{price:100,discountedPrice:90,currency:'AUD'}},stock:{inStock:true,trackQuantity:false}},{id:'white',choices:{Colour:'White'},variant:{priceData:{price:150,discountedPrice:140,currency:'AUD'}},stock:{inStock:false,trackQuantity:true,quantity:0}}],costRange:{minValue:42},internal_comment:'PRIVATE'}});

test('card attributes preserve the full title and use only explicit material and options',()=>{
 const input={name:'Hollow Wavy Line Arch Backdrop - Foldable/Non-Foldable MDF Arch',options:[{name:'Foldable',values:['YES','NO']},{name:'Colour',values:['Raw','White']}],material:''};
 const result={...input,...cardPresentation(input)};
 assert.equal(result.name,input.name);
 assert.deepEqual(result.cardAttributes,['MDF','Foldable / Non-foldable','Raw / White']);
 assert.deepEqual(cardPresentation({name:'Display',options:[],material:''}).cardAttributes,[]);
});
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
test('unavailable source videos are counted without exposing Wix URLs; images remain mandatory',()=>{
 const p=product();p.source_product.media.items.push({mediaType:'video',video:{files:[{url:'https://video.wixstatic.com/video/unavailable/file.mp4'}]}});
 const result=buildCatalog([p],collections,assets,'https://hub.example').products[0];
 assert.equal(result.pendingMedia,1);assert.equal(result.media.length,1);assert.equal(result.images.length,1);
 assert(!JSON.stringify(result).includes('video.wixstatic.com'));
 assert.throws(()=>buildCatalog([p],collections,new Map(),'https://hub.example'),/copied/);
});


import {newestFirst} from './hub-storefront-order.mjs';
test('original Wix creation time controls order, independent of input and update dates',()=>{
 const products=[{id:'old'},{id:'new'}];
 const rows=[{shipping_product_id:'old',source_product:{createdDate:'2020-01-01T00:00:00Z',lastUpdated:'2026-09-28T00:00:00Z'}},{shipping_product_id:'new',source_product:{createdDate:'2025-01-01T00:00:00Z'}}];
 assert.deepEqual(newestFirst(products,rows).map(p=>p.id),['new','old']);
 assert.deepEqual(products.map(p=>p.id),['old','new']);
 assert.throws(()=>newestFirst(products,rows.slice(1)),/Missing Wix creation date/);
});

test('roof filters use saved Wix categories even without roof words in the title',()=>{
 const categories=[{id:'yes',path:'/category/mobile-carts-with-roof'},{id:'no',path:'/category/mobile-carts-without-roof'}];
 const product={name:'Foldable Timber Event Bar',material:'Timber',options:[],categoryIds:['no']};
 assert.equal(cardPresentation(product,categories).roof,'Without Roof');
 assert.equal(cardPresentation({...product,categoryIds:['yes']},categories).roof,'With Roof');
 assert.equal(cardPresentation({...product,categoryIds:[]},categories).roof,undefined);
 assert.throws(()=>cardPresentation({...product,categoryIds:['yes','no']},categories),/Conflicting/);
});
