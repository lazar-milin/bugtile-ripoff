import test from 'node:test';
import assert from 'node:assert/strict';
import {server,config} from '../server.mjs';
async function open(){
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  const call=async(path,data,token)=>{const r=await fetch(base+'/api/'+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,body:await r.json()};};
  return {base,call,close:()=>new Promise(r=>server.close(r))};
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('At the table limit only an abandoned lobby makes room; active lobbies and games are kept',async()=>{
  const {call,close}=await open(),limit=config.maxTables,window=config.openTableMs;config.maxTables=2;config.openTableMs=100;
  const full=async()=>{const r=await call('create',{});assert.equal(r.status,503);assert.equal(r.body.error,'The server is full. Try again later.');};
  try{
    const first=(await call('create',{})).body,second=(await call('create',{})).body;await full();
    await pause(150);await call('state?code='+first.code,null,first.token);
    const third=(await call('create',{})).body;assert.match(third.code,/^[A-F0-9]{8}$/);
    assert.equal((await call('state?code='+second.code,null,second.token)).status,404);
    for(const t of [first,third]){await call('settings',{code:t.code,mode:'hotseat'},t.token);await call('start',{code:t.code},t.token);}
    await pause(150);await full();
    for(const t of [first,third])await call('leave',{code:t.code},t.token);
  }finally{config.maxTables=limit;config.openTableMs=window;await close();}
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
test('Malformed requests get player-facing messages instead of raw Node errors',async()=>{
  const {base,call,close}=await open(),error=async r=>({status:r.status,error:(await r.json()).error});
  try{
    assert.deepEqual(await error(await fetch(base+'/art/')),{status:404,error:'Not found.'});
    assert.deepEqual(await error(await fetch(base+'/missing.png')),{status:404,error:'Not found.'});
    assert.deepEqual(await error(await fetch(base+'/%E0%A4%A')),{status:400,error:'Bad request.'});
    assert.deepEqual(await error(await fetch(base+'/%00')),{status:400,error:'Bad request.'});
    for(const body of ['{bad','null','[]'])assert.deepEqual(await error(await fetch(base+'/api/create',{method:'POST',headers:{'Content-Type':'application/json'},body})),{status:400,error:'Expected a JSON request body.'});
    const host=(await call('create',{})).body,code=host.code;await call('settings',{code,mode:'hotseat'},host.token);const game=(await call('start',{code},host.token)).body;
    const move=await call('move',{code,version:game.version,action:null},host.token);
    assert.deepEqual({status:move.status,error:move.body.error},{status:400,error:'That move is not legal. Choose a highlighted hex.'});
    await call('leave',{code},host.token);
  }finally{await close();}
});
test('Static files can be revalidated with an ETag instead of downloaded again',async()=>{
  const {base,close}=await open();
  try{
    const first=await fetch(base+'/art/Q.svg'),etag=first.headers.get('etag');await first.text();
    assert.match(etag??'',/^"[^"]+"$/);assert.equal(first.headers.get('cache-control'),'no-cache');
    const again=await fetch(base+'/art/Q.svg',{headers:{'If-None-Match':etag}});assert.equal(again.status,304);assert.equal(await again.text(),'');
    const stale=await fetch(base+'/art/Q.svg',{headers:{'If-None-Match':'"stale"'}});assert.equal(stale.status,200);await stale.text();
  }finally{await close();}
});
test('Every response forbids MIME sniffing and sends no referrer',async()=>{
  const {base,close}=await open();
  try{
    for(const path of ['/','/art/Q.svg','/api/tables','/missing']){
      const r=await fetch(base+path);await r.arrayBuffer();
      assert.equal(r.headers.get('x-content-type-options'),'nosniff',path);assert.equal(r.headers.get('referrer-policy'),'no-referrer',path);
    }
  }finally{await close();}
});
test('Discord sign-in names the player and can be required instead of guest play',async()=>{
  const {call,close}=await open(),realFetch=globalThis.fetch,guests=config.guests;
  process.env.DISCORD_CLIENT_ID='app-1';process.env.DISCORD_CLIENT_SECRET='secret';
  // Stand-in for Discord's OAuth and user endpoints; every other request goes to the real network stack.
  globalThis.fetch=async(url,init)=>{
    if(String(url)==='https://discord.com/api/oauth2/token'){const code=new URLSearchParams(String(init.body)).get('code');return new Response(JSON.stringify(code==='good'?{access_token:'discord-token'}:{error:'invalid_grant'}),{status:code==='good'?200:400});}
    if(String(url)==='https://discord.com/api/v10/users/@me')return new Response(JSON.stringify({id:'42',username:'ogi',global_name:'Ognjen'}));
    return realFetch(url,init);
  };
  try{
    assert.deepEqual((await call('config')).body,{clientId:'app-1',guests:true});
    const bad=await call('login',{code:'bad'});assert.equal(bad.status,400);assert.equal(bad.body.error,'Discord authorization failed. Reopen the Activity.');
    const login=(await call('login',{code:'good'})).body;assert.equal(login.name,'Ognjen');assert.equal(login.access_token,'discord-token');assert.match(login.identity,/^[a-f0-9]{36}$/);
    config.guests=false;assert.equal((await call('config')).body.guests,false);
    const guest=await call('create',{name:'Fern'});assert.equal(guest.status,403);assert.equal(guest.body.error,'Open this game inside Discord.');
    const host=(await call('create',{name:'Not Ognjen',identity:login.identity})).body;assert.equal(host.state.names[0],'Ognjen');
    const stale=await call('join',{code:host.code,name:'Moss',identity:'expired'});assert.equal(stale.status,401);assert.equal(stale.body.error,'Discord sign-in expired. Reopen the Activity.');
    await call('leave',{code:host.code},host.token);
  }finally{globalThis.fetch=realFetch;config.guests=guests;delete process.env.DISCORD_CLIENT_ID;delete process.env.DISCORD_CLIENT_SECRET;await close();}
});
