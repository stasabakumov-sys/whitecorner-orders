import {describe,it,expect,vi} from 'vitest';
import {ShippingDataComponent} from './shipping-data.component';

describe('Legacy drawing classification',()=>{
 function setup(result:any){const rpc=vi.fn().mockResolvedValue(result);const c=new ShippingDataComponent({client:{rpc}} as any,undefined,{} as any);c.extraSizes.set(['2000x1000']);c.legacyRevisions={'2000x1000':'r1'};c.legacyFolding={'2000x1000':'foldable'};return {c,rpc};}
 it('changes the displayed key only after the server confirms classification',async()=>{
  const {c,rpc}=setup({data:{size_key:'2000x1000:foldable'}});await c.classifyDrawing('2000x1000');
  expect(rpc).toHaveBeenCalledWith('wc_classify_backdrop_box_drawing',{p_size:'2000x1000',p_folding:'foldable',p_expected:'r1'});
  expect(c.extraSizes()).toEqual(['2000x1000:foldable']);expect(c.libraryMessage).toContain('saved');
 });
 it('retains the legacy entry and selection on conflict or missing confirmation',async()=>{
  for(const result of [{error:Error('Drawing already exists')},{data:null}]){
   const {c}=setup(result);await c.classifyDrawing('2000x1000');expect(c.extraSizes()).toEqual(['2000x1000']);expect(c.legacyFolding['2000x1000']).toBe('foldable');expect(c.libraryError).toContain('Could not classify');expect(c.classifying).toBe('');
  }
 });
});
