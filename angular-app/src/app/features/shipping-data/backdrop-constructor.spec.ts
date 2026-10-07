import {TestBed} from '@angular/core/testing';
import {signal} from '@angular/core';
import {CartConstructorFilesService} from './cart-constructor-files.service';
import {CartBoxConstructorComponent} from './cart-box-constructor.component';
import {PackingFilesCellComponent} from './packing-files-cell.component';
import {BoxDrawingComponent,baseDrawingBox} from './box-drawing.component';
import {HubMembersService} from '../../core/services/hub-members.service';
import {SupabaseService} from '../../core/services/supabase.service';
import {SavedPackingComponent} from './saved-packing.component';
import {backdropDrawingKey} from './product-sizes';
import {backdropPackagingKey,variantSignature} from '../../../../../supabase/functions/_shared/delivery-review-domain';

const box={package_name:'Box',length_mm:930,width_mm:780,height_mm:80,weight_kg:14};
const size='1500x900:foldable';
describe('Backdrop packaging identity and Constructor',()=>{
 it('keeps Edit and Save in the box row and exposes dimensions only after Edit',async()=>{
  const query:any={select:()=>query,eq:()=>query,then:(resolve:any)=>Promise.resolve({data:[],error:null}).then(resolve)};
  TestBed.configureTestingModule({providers:[{provide:SupabaseService,useValue:{client:{from:()=>query}}},{provide:HubMembersService,useValue:{manager:signal(true)}}]});
  const fixture=TestBed.createComponent(SavedPackingComponent);
  for(const [key,value] of Object.entries({product:{id:'backdrop',product_name:'Half Arch Shelf Wall',wix_product_id:'arch'},profile:{signature:'profile',packages:[box]},backdrop:true,sharedSize:size,backdropDimensions:{...box,size_key:size,revision:'r1'}}))fixture.componentRef.setInput(key,value);
  fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  const row=fixture.nativeElement.querySelector('tbody tr');
  expect(row.querySelector('[aria-label="Save packaging"]')).toBeNull();expect(row.querySelector('[aria-label="Weight kg"]')).toBeNull();expect(fixture.nativeElement.querySelector('.actions')).toBeNull();
  expect(row.querySelector('[aria-label="Length mm"]')).toBeNull();row.querySelector('[aria-label="Edit packaging"]').click();fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  expect(row.querySelector('[aria-label="Length mm"]').value).toBe('930');expect(row.querySelector('[aria-label="Save packaging"]')).not.toBeNull();expect(row.querySelector('[aria-label="Cancel packaging changes"]')).not.toBeNull();
  expect(row.querySelector('[aria-label="Create SVG and RD for Box"]').disabled).toBe(true);
  fixture.destroy();
 });
 it('shares Painted and Raw packaging across Backdrop models, keeping size and folding distinct',()=>{
  for(const product_name of ['Half Arch Shelf Wall – Plywood Display Arch with Shelves','Plane Arch Backdrop','Ripple Backdrop']){
   const item=(colour:string,fold='YES',sizeLabel='Small (150cm x 90cm)')=>({id:'item',product_name,quantity:1,catalog_reference:{catalogItemId:product_name},wix_options:{Size:sizeLabel,Foldable:fold,Colour:colour}});
   for(const colour of ['Raw','Painted','White']){
    const folded=item(colour),flat=item(colour,'NO'),large=item(colour,'YES','180cm x 90cm');
    expect(backdropPackagingKey(folded)).toBe(size);
    expect(backdropDrawingKey({template_item:folded},product_name)).toBe(size);
    expect(variantSignature(folded)).toBe(variantSignature(item('Raw')));
    expect(backdropPackagingKey(flat)).toBe('1500x900:nonfoldable');
    expect(backdropDrawingKey({template_item:flat},product_name)).toBe('1500x900:nonfoldable');
    expect(backdropPackagingKey(large)).toBe('1800x900:foldable');
   }
  }
 });
 it('loads only the selected shared folding key, without resolving product or profile IDs',async()=>{
  const calls:any[]=[];
  const service=new CartConstructorFilesService({client:{from:(table:string)=>{const q:any={select:()=>q,eq:(key:string,value:string)=>{calls.push([table,key,value]);return q;},maybeSingle:async()=>({data:null}),order:async()=>({data:[]})};return q;}}} as any);
  await service.loadBackdrop(size);
  expect(calls).toEqual([['wc_backdrop_box_svg_drawings','size_key',size],['wc_box_rd_files','backdrop_size_key',size]]);
  await expect(service.loadBackdrop('1500x900')).rejects.toThrow('Foldable');expect(calls).toHaveLength(2);
 });
 it('opens without a package ID or model weight and sends shared files through the atomic save',async()=>{
  const prepared={p_request:'request'},state={drawing:null,files:[]};
  const files={loadBackdrop:vi.fn().mockResolvedValue(state),prepareBackdrop:vi.fn().mockResolvedValue(prepared),saveBackdrop:vi.fn().mockRejectedValueOnce(Error('Connection lost')).mockResolvedValue(state)};
  TestBed.configureTestingModule({providers:[{provide:CartConstructorFilesService,useValue:files},{provide:HubMembersService,useValue:{manager:signal(true)}}]});
  const c=TestBed.createComponent(CartBoxConstructorComponent).componentInstance;
  c.box={...box,weight_kg:null};c.sharedSize=size;await c.show();
  expect(c.open).toBe(true);expect(files.loadBackdrop).toHaveBeenCalledWith(size);
  const rdFiles=[{filename:'bottom.rd',bytes:new Uint8Array(100)},{filename:'lid.rd',bytes:new Uint8Array(100)}];
  c.editor={drawing:{width:1,height:1,cuts:[],folds:[],pieces:4},rdFiles,rdSettings:{}} as any;
  await c.confirmSave();expect(c.pending).toBe(prepared);expect(c.error).toContain('Retry Save');
  await c.confirmSave();expect(files.prepareBackdrop).toHaveBeenCalledTimes(1);expect(files.saveBackdrop).toHaveBeenNthCalledWith(2,prepared);
  expect(c.success).toContain('saved');
 });
 it('rejects another folding key in the save confirmation and retains the uploaded request for retry',async()=>{
  const upload=vi.fn().mockResolvedValue({error:null}),rpc=vi.fn();
  const service=new CartConstructorFilesService({client:{auth:{getUser:async()=>({data:{user:{id:'owner'}}})},storage:{from:()=>({upload})},rpc}} as any);
  const files=[{filename:'box.rd',bytes:new Uint8Array(100)}];
  const request=await service.prepareBackdrop(size,box,'<svg/>',files,{}, {drawing:null,files:[]},[],()=>{},'small',40);
  expect(request).not.toHaveProperty('p_package');expect(request.p_box).toEqual(baseDrawingBox(box));expect(request.p_svg.filename).toContain('backdrop');
  const response={drawing:{size_key:size,object_path:request.p_svg.path},rd_files:[{backdrop_size_key:'1500x900:nonfoldable',object_path:request.p_rd_files[0].path,copies:1}]};
  rpc.mockResolvedValue({data:response});await expect(service.saveBackdrop(request)).rejects.toThrow('confirmation');
  response.rd_files[0].backdrop_size_key=size;await service.saveBackdrop(request);
  expect(upload).toHaveBeenCalledTimes(2);expect(rpc).toHaveBeenLastCalledWith('wc_save_backdrop_constructor_files',request);
 });
 it('shows the shared SVG in the file cell and the cutting task, keeping weight out of drawing identity',async()=>{
  const svg={size_key:size,filename:'shared.svg',box_snapshot:baseDrawingBox(box)};
  const calls:any[]=[];
  const from=(table:string)=>{let key='';const result=()=>({data:table==='wc_backdrop_box_svg_drawings'&&key===size?[svg]:[],error:null});const q:any={select:()=>q,eq:(field:string,value:string)=>{key=value;calls.push([table,field,value]);return q;},then:(resolve:any)=>Promise.resolve(result()).then(resolve),maybeSingle:async()=>({...result(),data:result().data[0]||null})};return q;};
  const cell=new PackingFilesCellComponent({client:{from}} as any,{markForCheck:()=>{}} as any);
  cell.sharedSize=size;cell.box=box;cell.viewBox=box;cell.backdrop=true;cell.kind='cdr';await cell.load();
  expect(cell.present).toBe(true);expect(cell.svgDrawing).toEqual(svg);
  const drawing=new BoxDrawingComponent({client:{from}} as any);drawing.sharedSize=size;drawing.box={...box,weight_kg:22};drawing.readOnly=true;await drawing.load();
  expect(drawing.current).toEqual(svg);expect(drawing.record).toBeNull();
  drawing.box={...box,length_mm:950};expect(drawing.current).toBeNull();
  expect(calls.filter(([table])=>table==='wc_backdrop_box_svg_drawings').every(([,field,value])=>field==='size_key'&&value===size)).toBe(true);
 });
});
