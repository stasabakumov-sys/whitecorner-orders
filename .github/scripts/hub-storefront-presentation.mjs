// Presentation fields are generated and persisted in Hub, never guessed by the site.
export function cardPresentation(product,categories=[]){
 const name=product.name.trim();
 const materials=[...new Set(name.match(/\b(?:MDF|plywood|timber|stainless steel|acrylic)\b/gi)?.map(v=>v.toLowerCase())??[])];
 const material=product.material||materials.map(v=>v==='mdf'?'MDF':v[0].toUpperCase()+v.slice(1)).join(' / ');
 const attributes=[];
 if(material)attributes.push(material);
 const folding=product.options.find(o=>/^fold(?:able|ing)?$/i.test(o.name));
 if(folding){
  const yes=folding.values.some(v=>/^yes$|^foldable$/i.test(v));
  const no=folding.values.some(v=>/^no$|^non[- ]?foldable$/i.test(v));
  if(yes&&no)attributes.push('Foldable / Non-foldable');
  else if(yes)attributes.push('Foldable');else if(no)attributes.push('Non-foldable');
 }else if(/\bcollapsible\b/i.test(name))attributes.push('Collapsible');
 else if(/\bfoldable\b/i.test(name)&&!/\bnon[- ]foldable\b/i.test(name))attributes.push('Foldable');
 const colour=product.options.find(o=>/^colou?r$/i.test(o.name));
 if(colour?.values.length)attributes.push(colour.values.length<=2?colour.values.join(' / '):`${colour.values.length} colours`);
 const size=product.options.find(o=>/^(?:size|dimensions?)$/i.test(o.name));
 if(size?.values.length>1)attributes.push(`${size.values.length} sizes`);
 const roofCategories=categories.filter(c=>product.categoryIds?.includes(c.id));
 const withRoof=roofCategories.some(c=>c.path==='/category/mobile-carts-with-roof');
 const withoutRoof=roofCategories.some(c=>c.path==='/category/mobile-carts-without-roof');
 if(withRoof&&withoutRoof)throw Error('Conflicting roof categories');
 const roof=withRoof?'With Roof':withoutRoof?'Without Roof':product.roof;
 return {cardAttributes:attributes.slice(0,3),material,...(roof?{roof}:{})};
}
