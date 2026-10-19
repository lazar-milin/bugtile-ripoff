import test from 'node:test';
import assert from 'node:assert/strict';
import {server,config} from '../server.mjs';
async function open(){
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  const call=async(path,data,token)=>{const r=await fetch(base+'/api/'+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,body:await r.json()};};
  return {base,call,close:()=>new Promise(r=>server.close(r))};
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('At the table limit the least recently active lobby makes room, but running games never do',async()=>{
  const {call,close}=await open(),limit=config.maxTables;config.maxTables=2;
  try{
    const first=(await call('create',{})).body;await pause(5);const second=(await call('create',{})).body;await pause(5);
    await call('state?code='+first.code,null,first.token);
    const third=(await call('create',{})).body;assert.match(third.code,/^[A-F0-9]{8}$/);
    assert.equal((await call('state?code='+second.code,null,second.token)).status,404);
    for(const t of [first,third]){await call('settings',{code:t.code,mode:'hotseat'},t.token);await call('start',{code:t.code},t.token);}
    const full=await call('create',{});assert.equal(full.status,503);assert.equal(full.body.error,'The server is full. Try again later.');
    for(const t of [first,third])await call('leave',{code:t.code},t.token);
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
test('State requests wait for the next change, and closing the table answers waiters',async()=>{
  const {call,close}=await open(),wait=config.longPollMs;config.longPollMs=3000;
  try{
    const host=(await call('create',{name:'Fern'})).body,code=host.code,guest=(await call('join',{code,name:'Moss'})).body;
    const started=(await call('start',{code},host.token)).body,since=v=>`state?code=${code}&since=${v}`;
    const waiting=call(since(started.version),null,guest.token);await pause(100);
    await call('move',{code,version:started.version,action:{type:'place',bug:'Q',to:'0,0'}},host.token);
    const next=(await waiting).body;assert.equal(next.state.ply,1);assert(!('repetitions' in next.state));
    const t=Date.now();assert.equal((await call(since(started.version),null,guest.token)).body.version,next.version);assert(Date.now()-t<500);
    config.longPollMs=100;assert.equal((await call(since(next.version),null,guest.token)).body.version,next.version);config.longPollMs=3000;
    const lobbyWait=call(since(next.version),null,guest.token);await pause(100);await call('leave',{code},host.token);
    const lobby=(await lobbyWait).body;assert.equal(lobby.phase,'lobby');
    const closedWait=call(since(lobby.version),null,guest.token);await pause(100);await call('leave',{code},guest.token);
    assert.equal((await closedWait).status,404);
  }finally{config.longPollMs=wait;await close();}
});
test('A bot reply wakes a waiting state request',async()=>{
  const {call,close}=await open(),wait=config.longPollMs;config.longPollMs=5000;
  try{
    const host=(await call('create',{})).body,code=host.code;await call('settings',{code,mode:'bot',undoEnabled:false},host.token);
    const started=(await call('start',{code},host.token)).body;
    const moved=(await call('move',{code,version:started.version,action:{type:'place',bug:'Q',to:'0,0'}},host.token)).body;
    const t=Date.now(),next=(await call(`state?code=${code}&since=${moved.version}`,null,host.token)).body;
    assert.equal(next.state.ply,2);assert(Date.now()-t<2000);
  }finally{config.longPollMs=wait;await close();}
});
