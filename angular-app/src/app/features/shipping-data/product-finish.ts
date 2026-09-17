import {backdropFinishModes,optionFinish} from '../costing/production-cost';

// Current catalogue choices take precedence over historical order profiles.
export function productFinishModes(product:any,source:any,profiles:any[]):boolean[]{
 const choices=(source?.productOptions||[]).filter((option:any)=>/^(colou?r|finish|paint|painting)$/i.test(String(option.name||'').trim())).flatMap((option:any)=>(option.choices||[]).map((choice:any)=>({[option.name]:choice.description??choice.value})));
 const variants=(source?.variants||[]).map((variant:any)=>variant.choices||{});
 const current=[...choices,...variants].map(optionFinish).filter(finish=>finish==='raw'||finish==='painted');
 if(current.length)return [...(current.includes('raw')?[false]:[]),...(current.includes('painted')?[true]:[])];
 return backdropFinishModes(product,source?[]:profiles.map(profile=>profile.options));
}
