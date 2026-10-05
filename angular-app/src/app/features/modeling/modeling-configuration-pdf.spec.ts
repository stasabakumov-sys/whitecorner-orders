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
