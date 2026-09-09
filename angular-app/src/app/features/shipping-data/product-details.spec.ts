import {describe,it,expect,vi} from 'vitest';
import {ProductDetailsComponent} from './product-details.component';
function setup(){const single=vi.fn().mockResolvedValue({data:{id:'cart',short_name:'Classic',manual_sizes:''}});const update=vi.fn().mockReturnValue({eq:()=>({select:()=>({single})})});const c=new ProductDetailsComponent({client:{from:()=>({update})}} as any);c.product={id:'cart',short_name:'Original'};return {c,update};}
describe('Explicit product detail edits',()=>{
 it('requires Edit and saves only the short name, never hidden size changes',async()=>{const {c,update}=setup();c.shortName='Accidental';await c.save('name');expect(update).not.toHaveBeenCalled();c.editName();c.shortName=' Classic ';c.sizes='unsaved';await c.save('name');expect(update).toHaveBeenCalledWith({short_name:'Classic'});expect(c.editingName).toBe(false);});
 it('cancels a name edit without saving',()=>{const {c,update}=setup();c.editName();c.shortName='Wrong';c.cancelName();expect(c.shortName).toBe('Original');expect(c.editingName).toBe(false);expect(update).not.toHaveBeenCalled();});
 it('blocks saving manual sizes whenever Wix provides sizes',async()=>{const {c,update}=setup();c.wixSizes=['Size II'];c.sizes='override';await c.save('sizes');expect(update).not.toHaveBeenCalled();});
 it('saves only manual sizes when Wix has no size',async()=>{const {c,update}=setup();c.sizes='190 x 95 cm\n190 x 95 cm';await c.save('sizes');expect(update).toHaveBeenCalledWith({manual_sizes:'190 x 95 cm'});});
 it('keeps the edit open on failure',async()=>{const {c,update}=setup();update.mockImplementation(()=>{throw Error('offline');});c.editName();c.shortName='Retry';await c.save('name');expect(c.editingName).toBe(true);expect(c.shortName).toBe('Retry');expect(c.error).toContain('Could not save');});
});
