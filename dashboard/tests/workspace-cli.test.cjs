const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function load(file, imports){
 const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,Request,Response,URL,crypto:globalThis.crypto,require:n=>{if(n in imports)return imports[n];throw Error(n)}});return exports;
}
const json=(v,s=200)=>Response.json(v,{status:s});
test('bearer authentication never falls back to signed-in browser cookies',async()=>{
 let cookieReads=0;
 const api=load('lib/workspace-auth.ts',{'@/app/sentinel-auth':{getSentinelUser:async()=>{cookieReads++;return {userId:'owner'}}},'@/lib/cloud-api':{cliUser:async()=>null}});
 assert.equal(await api.workspaceUser(new Request('https://sentinel.test/api/workspaces',{headers:{authorization:'Bearer invalid'}})),null);
 assert.equal(cookieReads,0);
});
test('browser mutations require same-origin while browser GET stays supported',async()=>{
 const api=load('lib/workspace-auth.ts',{'@/app/sentinel-auth':{getSentinelUser:async()=>({userId:'owner'})},'@/lib/cloud-api':{cliUser:async()=>null}});
 assert.equal(await api.workspaceUser(new Request('https://sentinel.test/api/workspaces',{method:'POST',headers:{origin:'https://other.test'}})),null);
 assert.equal((await api.workspaceUser(new Request('https://sentinel.test/api/workspaces'))).userId,'owner');
});
for(const file of ['app/api/workspaces/[id]/route.ts','app/api/workspaces/[id]/findings/route.ts','app/api/workspaces/[id]/audit/route.ts']){
 test(file+' hides another account workspace',async()=>{
  let queried=false;
  const db={prepare:sql=>({bind:(id,user)=>({first:async()=>{queried=true;assert.match(sql,/user_id = \?/);assert.equal(user,'second-user');return null;}})})};
  const api=load(file,{'@/db':{getDb:()=>db},'@/lib/cloud-api':{json},'@/lib/workspace-auth':{workspaceUser:async()=>({userId:'second-user'})}});
  const response=await (api.GET||api.POST)(new Request('https://sentinel.test/api/workspaces/other'),{params:Promise.resolve({id:'other'})});
  assert.equal(response.status,404);assert.equal(queried,true);
 });
}
test('logout revokes only the current bearer session',async()=>{
 let deleted;
 const api=load('app/api/cli/revoke/route.ts',{'@/app/chatgpt-auth':{},'@/db':{getDb:()=>({prepare:sql=>({bind:(...args)=>({run:async()=>{deleted={sql,args}}})})})},'@/lib/cloud-api':{json,cliUser:async()=> 'owner',hash:async t=>'hash-'+t}});
 const res=await api.DELETE(new Request('https://sentinel.test/api/cli/revoke',{method:'DELETE',headers:{authorization:'Bearer current'}}));
 assert.equal(res.status,200);assert.match(deleted.sql,/token_hash = \? AND user_id = \?/);assert.deepEqual(deleted.args,['hash-current','owner']);
});
