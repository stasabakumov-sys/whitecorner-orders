import {CustomersService} from './customers.service';
describe('Wix contacts loading',()=>{
  it('loads every page beyond 1000 contacts, preserves Wix IDs, and publishes only a complete list',async()=>{
    const offsets:number[]=[];
    const service=new CustomersService({client:{functions:{invoke:async(_name:string,{body}:any)=>{
      expect(body.action).toBe('queryContacts');offsets.push(body.offset);
      expect(service.contacts()).toEqual([]);
      const count=Math.min(500,1506-body.offset);
      return {data:{contacts:Array.from({length:count},(_,i)=>({id:`contact-${body.offset+i}`})),total:1506,nextOffset:body.offset+count===1506?null:body.offset+count},error:null};
    }}}} as any);
    await service.load();
    expect(offsets).toEqual([0,500,1000,1500]);expect(service.contacts().length).toBe(1506);expect(service.loaded()).toBe(true);
  });
  it('retains the previous complete list when a page fails or repeats',async()=>{
    const service=new CustomersService({client:{functions:{invoke:async()=>({data:{contacts:[{id:'repeat'}],total:3,nextOffset:1}})}}} as any);
    service.contacts.set([{id:'previous'}]);await service.load();
    expect(service.contacts()).toEqual([{id:'previous'}]);expect(service.error()).toContain('pagination stopped');expect(service.loading()).toBe(false);
  });
});
