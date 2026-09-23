import {CustomersService} from './customers.service';

describe('saved Wix contacts',()=>{
  it('reads every saved page without requesting Wix again',async()=>{
    const reads:number[]=[];
    const client={
      from:(table:string)=>table==='wc_wix_contacts_sync'
        ? {select:()=>({maybeSingle:async()=>({data:{total:1002,synced_at:'2026-09-23T00:00:00Z'},error:null})})}
        : {select:()=>({order:()=>({range:async(start:number)=>{
          reads.push(start);
          const count=Math.min(500,1002-start);
          return {data:Array.from({length:count},(_,i)=>({contact:{id:`contact-${start+i}`}})),error:null};
        }})})},
      functions:{invoke:async()=>{throw Error('Wix should not be called');}},
    };
    const service=new CustomersService({client} as any);
    await service.load();
    expect(reads).toEqual([0,500,1000]);
    expect(service.contacts().length).toBe(1002);
    expect(service.loaded()).toBe(true);
  });

  it('keeps the previous list when manual refresh fails',async()=>{
    const client={
      from:()=>({select:()=>({maybeSingle:async()=>({data:{total:1,synced_at:'2026-09-23T00:00:00Z'},error:null})})}),
      functions:{invoke:async()=>({data:{error:'Wix unavailable'},error:null})},
    };
    const service=new CustomersService({client} as any);
    service.contacts.set([{id:'previous'}]);service.loaded.set(true);
    await service.load(true);
    expect(service.contacts()).toEqual([{id:'previous'}]);
    expect(service.error()).toContain('Wix unavailable');
    expect(service.loading()).toBe(false);
  });
});
