const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ts=require('../../../angular-app/node_modules/typescript');
const exportsObject={};
const result=ts.transpileModule(fs.readFileSync(__dirname+'/contacts.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});
assert.equal(result.diagnostics.length,0);
vm.runInNewContext(result.outputText,{exports:exportsObject,fetch,AbortSignal});
const {queryContactsPage}=exportsObject;
test('contacts query is read-only, unfiltered, and paginated with no order or database mutations',async()=>{
 const calls=[];const out=await queryContactsPage({offset:500},{Authorization:'test-only'},async(url,options)=>{
  calls.push(url);const body=JSON.parse(options.body);assert.deepEqual(body.query.paging,{limit:500,offset:500});assert.equal(body.query.filter,undefined);
  return Response.json({contacts:[{id:'example'}],pagingMetadata:{total:501}});
 });
 assert.deepEqual(calls,['https://www.wixapis.com/contacts/v4/contacts/query']);assert.equal(out.nextOffset,null);assert.equal(out.contacts[0].id,'example');
});
test('permission and truncated response failures remain explicit',async()=>{
 await assert.rejects(()=>queryContactsPage({}, {},async()=>new Response('',{status:403})),/Read Contacts/);
 await assert.rejects(()=>queryContactsPage({}, {},async()=>Response.json({contacts:[],pagingMetadata:{total:10}})),/before completion/);
 await assert.rejects(()=>queryContactsPage({offset:-1},{},async()=>{throw Error('must not call');}),/Invalid contacts offset/);
});
