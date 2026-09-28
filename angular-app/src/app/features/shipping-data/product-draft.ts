export type DraftOption = {name:string;choices:string[]};
export type DraftVariant = {choices:Record<string,string>;price_aud:number;sku:string};

export function draftOptions(rows:{name:string;choicesText:string}[]):DraftOption[]{
  return rows.map(row=>({name:row.name.trim(),choices:row.choicesText.split(',').map(x=>x.trim()).filter(Boolean)}))
    .filter(row=>row.name||row.choices.length);
}

export function draftVariants(options:DraftOption[],previous:DraftVariant[],basePrice:number):DraftVariant[]{
  let combinations:Record<string,string>[]=[{}];
  for(const option of options){
    combinations=combinations.flatMap(choices=>option.choices.map(value=>({...choices,[option.name]:value})));
    if(combinations.length>1000)throw Error('This product has more than 1,000 variants. Reduce the option choices.');
  }
  return combinations.map(choices=>{
    const found=previous.find(row=>JSON.stringify(row.choices)===JSON.stringify(choices));
    return found?{...found,choices}:{choices,price_aud:basePrice,sku:''};
  });
}

export function validateProductDraft(draft:{name:string;description:string;ribbon:string;basePrice:number;sku:string;options:DraftOption[];variants:DraftVariant[]}):string{
  if(!draft.name.trim())return 'Enter a product name.';
  if(draft.name.trim().length>80)return 'Product name must be 80 characters or fewer.';
  if(draft.description.length>8000)return 'Description must be 8,000 characters or fewer.';
  if(draft.ribbon.length>30)return 'Ribbon must be 30 characters or fewer.';
  if(draft.sku.length>40)return 'SKU must be 40 characters or fewer.';
  if(!Number.isFinite(draft.basePrice)||draft.basePrice<0)return 'Enter a valid price in AUD.';
  if(draft.options.length>6)return 'A product can have up to 6 options.';
  const names=new Set<string>();
  for(const option of draft.options){
    if(!option.name||!option.choices.length)return 'Each option needs a name and at least one choice.';
    const name=option.name.toLowerCase();
    if(names.has(name))return 'Option names must be unique.';
    names.add(name);
    if(new Set(option.choices.map(x=>x.toLowerCase())).size!==option.choices.length)return `Remove duplicate choices from ${option.name}.`;
  }
  if(!draft.variants.length||draft.variants.length>1000)return 'A product needs between 1 and 1,000 variants.';
  if(draft.variants.some(row=>!Number.isFinite(row.price_aud)||row.price_aud<0||row.sku.length>40))return 'Check each variant price and SKU.';
  return '';
}
