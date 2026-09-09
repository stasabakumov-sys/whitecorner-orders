// Read-only CRM access; never routes contacts through order/production upserts.
export async function queryContactsPage(body: Record<string, unknown>, headers: Record<string,string>, call: typeof fetch = fetch) {
  const offset=body.offset??0;
  if(!Number.isSafeInteger(offset)||Number(offset)<0)throw new Error('Invalid contacts offset');
  const response=await call('https://www.wixapis.com/contacts/v4/contacts/query',{
    method:'POST',headers,body:JSON.stringify({query:{paging:{limit:500,offset},sort:[{fieldName:'createdDate',order:'ASC'}]}}),signal:AbortSignal.timeout(25000),
  });
  if(!response.ok)throw new Error(response.status===403?'Wix API key needs Read Contacts permission.':`Wix Contacts request failed (${response.status}).`);
  const data=await response.json();
  if(!Array.isArray(data.contacts)||data.contacts.some((c: any)=>!c?.id))throw new Error('Invalid Wix Contacts response');
  const total=data.pagingMetadata?.total;
  if(total!=null&&(!Number.isSafeInteger(total)||total<0))throw new Error('Invalid Wix Contacts total');
  const next=Number(offset)+data.contacts.length;
  const complete=total!=null?next>=total:data.contacts.length<500;
  if(!complete&&!data.contacts.length)throw new Error('Wix Contacts pagination stopped before completion');
  return {contacts:data.contacts,total:total??null,nextOffset:complete?null:next};
}
