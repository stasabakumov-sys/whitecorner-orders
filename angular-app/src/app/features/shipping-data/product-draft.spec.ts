import {describe,it,expect,vi} from 'vitest';
import {draftOptions,draftVariants,validateProductDraft} from './product-draft';
import {ProductDraftsComponent} from './product-drafts.component';

describe('Hub product draft',()=>{
  it('keeps option combinations and their individual prices when choices are extended',()=>{
    const options=draftOptions([{name:'Colour',choicesText:'Raw, White'},{name:'Size',choicesText:'Small, Large'}]);
    const rows=draftVariants(options,[],450);
    expect(rows).toHaveLength(4);
    rows[0].price_aud=480;
    rows[0].sku='RAW-S';
    const extended=draftVariants(draftOptions([{name:'Colour',choicesText:'Raw, White, Pink'},{name:'Size',choicesText:'Small, Large'}]),rows,450);
    expect(extended).toHaveLength(6);
    expect(extended[0]).toMatchObject({price_aud:480,sku:'RAW-S'});
    expect(extended[4].price_aud).toBe(450);
  });

  it('rejects duplicate choices and invalid variant prices before saving',()=>{
    const base={name:'Backdrop',description:'',ribbon:'',basePrice:450,sku:'',variants:[{choices:{Colour:'Raw'},price_aud:450,sku:''}]};
    expect(validateProductDraft({...base,options:[{name:'Colour',choices:['Raw','raw']}]})).toContain('duplicate choices');
    expect(validateProductDraft({...base,options:[{name:'Colour',choices:['Raw']}],variants:[{choices:{Colour:'Raw'},price_aud:-1,sku:''}]})).toContain('variant price');
  });

  it('saves only a private Hub draft and never invokes Wix',async()=>{
    const single=vi.fn(async()=>({data:{id:'draft-1'},error:null}));
    const insert=vi.fn(()=>({select:()=>({single})}));
    const order=vi.fn(async()=>({data:[],error:null}));
    const from=vi.fn((name:string)=>name==='wc_hub_product_drafts'?{insert,select:()=>({order})}:{});
    const invoke=vi.fn();
    const component=new ProductDraftsComponent({client:{from,functions:{invoke}}} as any);
    component.manager.set(true);component.name='New cart';component.basePrice=650;component.variants=[{choices:{},price_aud:650,sku:''}];
    await component.saveDraft();
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({name:'New cart',base_price_aud:650}));
    expect(component.savedMessage()).toContain('Nothing was sent to Wix');
    expect(invoke).not.toHaveBeenCalled();
  });
});
