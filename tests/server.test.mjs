import test from 'node:test';
import assert from 'node:assert/strict';
import {server,config} from '../server.mjs';
async function open(){
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  const call=async(path,data,token)=>{const r=await fetch(base+'/api/'+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,body:await r.json()};};
  return {base,call,close:()=>new Promise(r=>server.close(r))};
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('Table creation stops at the server limit',async()=>{
  const {call,close}=await open(),limit=config.maxTables;config.maxTables=2;
  try{
    const first=(await call('create',{})).body,second=(await call('create',{})).body;
    const full=await call('create',{});assert.equal(full.status,503);assert.equal(full.body.error,'The server is full. Try again later.');
    await call('leave',{code:first.code},first.token);await call('leave',{code:second.code},second.token);
    assert.equal((await call('create',{})).status,200);
  }finally{config.maxTables=limit;await close();}
});
test('Open tables list only lobbies whose host is still connected',async()=>{
  const {call,close}=await open(),window=config.openTableMs;config.openTableMs=150;
  try{
    const host=(await call('create',{name:'Fern'})).body,listed=async()=>(await call('tables')).body.tables.some(t=>t.code===host.code);
    assert(await listed());await pause(200);assert(!(await listed()));
    await call('state?code='+host.code,null,host.token);assert(await listed());
  }finally{config.openTableMs=window;await close();}
});
