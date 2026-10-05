import {it,expect} from 'vitest';
import {createConfigurationPdf} from './modeling-configuration-pdf';
it('exports a one-page specification with two model views and no pricing',()=>{
 const pdf=createConfigurationPdf({product:'Cart with decorative wheels & roof',material:'MDF',code:'decorative-wheel-roof-cart-mdf',produced:'5 October 2026',front:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAE0lEQVR4nGN88+oFAwwwwVnoHABmFgLEuvJUXQAAAABJRU5ErkJggg==',rear:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAE0lEQVR4nGN88+oFAwwwwVnoHABmFgLEuvJUXQAAAABJRU5ErkJggg==',fields:[{label:'Dimensions',value:'1200 x 600 x 900 mm'},{label:'Cart body',value:'2-pack painted - Dulux Featherbed - Matte'},{label:'Roof',value:'Closed - 12 mm MDF bottom - 1930 mm overall height'}]});
 expect(pdf.getNumberOfPages()).toBe(1);
 const commands=(pdf.internal as unknown as {pages:string[][]}).pages.flat().join(' ');
 for(const text of ['FRONT','REAR','SPECIFICATION','1200 x 600 x 900 mm','Dulux Featherbed','1930','mm overall height']) expect(commands).toContain(text);
 expect(commands).not.toMatch(/PRICING|GST|Total|\$/);
 expect(new TextDecoder().decode(pdf.output('arraybuffer').slice(0,8))).toMatch(/^%PDF-/);
});

it('exports indicative prices separately and marks missing prices for a quote',()=>{
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAE0lEQVR4nGN88+oFAwwwwVnoHABmFgLEuvJUXQAAAABJRU5ErkJggg==';
 const pdf=createConfigurationPdf({product:'MDF Mobile Bar Cart with Roof & Decorative Wheels – Foldable Serving Cart',material:'MDF',code:'roof',produced:'5 October 2026',logo:image,front:image,rear:image,fields:[],pricing:{productId:'fixture',variantId:null,publishedAt:'2026-10-04T00:00:00Z',subtotal:170,lines:[{label:'Cart',amount:150},{label:'Shelf',amount:20},{label:'Front panel',amount:null}]}});
 expect(pdf.getNumberOfPages()).toBe(2);
 const commands=(pdf.internal as unknown as {pages:string[][]}).pages.flat().join(' ');expect(commands).toContain('INDICATIVE PRICING');expect(commands).toContain('$170');expect(commands).toContain('Quote required');expect(commands).toContain('Not a final quotation');expect(commands).toContain('2 / 2');
});
