export async function importOrderHistory(db:any,headers:Record<string,string>,body:Record<string,unknown>,call:typeof fetch=fetch){
  let cursor=body.cursor;
  if(cursor!=null&&(typeof cursor!=='string'||cursor.length>16000))throw new Error('Invalid history cursor');
  const pages=body.pages??1;
  if(!Number.isInteger(pages)||Number(pages)<1||Number(pages)>10)throw new Error('History batch must contain 1–10 pages');
  let imported=0;const seen=new Set<string>();
  if(cursor)seen.add(String(cursor));
  for(let page=0;page<Number(pages);page++){
    const search=cursor?{cursorPaging:{cursor}}:{cursorPaging:{limit:100},sort:[{fieldName:'createdDate',order:'DESC'}]};
    const response=await call('https://www.wixapis.com/ecom/v1/orders/search',{method:'POST',headers,body:JSON.stringify({search}),signal:AbortSignal.timeout(25000)});
    if(!response.ok)throw new Error(`Wix order history request failed (${response.status})`);
    const data=await response.json();
    if(!Array.isArray(data.orders)||data.orders.some((o:any)=>!o?.id))throw new Error('Invalid Wix order history response');
    const next=data.pagingMetadata?.cursors?.next||data.metadata?.cursors?.next||null;
    if(next&&(typeof next!=='string'||seen.has(next)||!data.orders.length))throw new Error('Wix order history pagination stalled');
    if(data.orders.length){
      const rows=[...new Map(data.orders.map((o:any)=>[o.id,{wix_order_id:o.id,order_number:String(o.number??''),wix_created_at:o.createdDate||null,raw_order:o,synced_at:new Date().toISOString()}])).values()];
      const {error}=await db.from('wc_wix_order_history').upsert(rows,{onConflict:'wix_order_id'});
      if(error)throw new Error('Could not save Wix order history. Check that the history migration is installed.');
      imported+=rows.length;
    }
    if(!next)return{ok:true,imported,nextCursor:null,complete:true};
    seen.add(next);cursor=next;
  }
  return{ok:true,imported,nextCursor:cursor,complete:false};
}
