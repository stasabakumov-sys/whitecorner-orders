const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ts=require('../../../angular-app/node_modules/typescript');
function load(file,exportsObject){
 const code=ts.transpileModule(fs.readFileSync(__dirname+'/'+file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(code,{exports:exportsObject,require:()=>({queryContactsPage:contacts.queryContactsPage}),fetch,AbortSignal,Response});
}
const contacts={};load('contacts.ts',contacts);
const sync={};load('contacts-sync.ts',sync);

test('complete Wix snapshot is saved once with only displayed fields',async()=>{
 let saved;
 const db={rpc:async(name,args)=>{assert.equal(name,'wc_replace_wix_contacts');saved=args;return {data:{total:2,synced_at:'now'},error:null};}};
 const result=await sync.syncContacts(db,{},'site',async()=>Response.json({contacts:[
  {id:'one',primaryInfo:{email:'one@example.com'},secretField:'omit'},
  {id:'two',info:{name:{first:'Two'},extendedFields:{items:{'members.membershipStatus':'ACTIVE',privateField:'omit'}}}},
 ],pagingMetadata:{total:2}}));
 assert.equal(result.total,2);assert.equal(saved.p_contacts.length,2);
 assert.equal(saved.p_contacts[0].secretField,undefined);
 assert.equal(saved.p_contacts[1].info.extendedFields.items.privateField,undefined);
});

test('incomplete and duplicate Wix results do not replace saved contacts',async()=>{
 let writes=0;const db={rpc:async()=>{writes++;return {data:{total:0},error:null};}};
 await assert.rejects(()=>sync.syncContacts(db,{},'site',async(_url,options)=>Response.json({contacts:JSON.parse(options.body).query.paging.offset?[ ]:[{id:'one'}],pagingMetadata:{total:2}})),/pagination stopped/);
 await assert.rejects(()=>sync.syncContacts(db,{},'site',async()=>Response.json({contacts:[{id:'one'},{id:'one'}],pagingMetadata:{total:2}})),/Duplicate/);
 assert.equal(writes,0);
});
