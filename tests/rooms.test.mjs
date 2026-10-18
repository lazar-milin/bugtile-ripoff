import test from 'node:test';
import assert from 'node:assert/strict';
import {server} from '../server.mjs';
test('Lobby creation, discovery, two-player start, moves, reconnect and leave',async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  const call=async(path,data,token)=>{const r=await fetch(base+'/api/'+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,body:await r.json()};};
  try{
    const host=(await call('create',{name:'Fern'})).body;
    assert.equal(host.you,0);assert.equal(host.phase,'lobby');assert.equal(host.host,0);assert.match(host.code,/^[A-F0-9]{8}$/);
    assert((await call('tables')).body.tables.some(t=>t.code===host.code));
    assert.equal((await call('start',{code:host.code},host.token)).status,400);
    const guest=(await call('join',{code:host.code,name:'Moss'})).body;
    assert.equal(guest.you,1);assert.equal(guest.ready,true);
    assert.equal((await call('start',{code:host.code},guest.token)).status,400);
    assert.equal((await call('join',{code:host.code,name:'Third'})).status,400);
    assert.equal((await call('state?code='+host.code)).status,403);
    const started=(await call('start',{code:host.code},host.token)).body;
    assert.equal(started.phase,'game');assert(!(await call('tables')).body.tables.some(t=>t.code===host.code));
    const a={type:'place',bug:'Q',to:'0,0'};
    assert.equal((await call('move',{code:host.code,version:started.version,action:a},guest.token)).status,400);
    const move=await call('move',{code:host.code,version:started.version,action:a},host.token);
    assert.equal(move.status,200);assert.equal(move.body.state.ply,1);assert(move.body.undoUntil>move.body.serverNow);
    const seen=(await call('state?code='+host.code,null,guest.token)).body;
    assert.equal(seen.state.ply,1);assert.equal(seen.undoUntil,null);
    assert.equal((await call('undo',{code:host.code},guest.token)).status,400);
    assert.equal((await call('move',{code:host.code,version:started.version,action:{...a,to:'1,0'}},guest.token)).status,409);
    assert.equal((await call('move',{code:host.code,version:seen.version,action:{...a,to:'1,0'}},guest.token)).status,200);
    assert.equal((await call('undo',{code:host.code},host.token)).status,400);
    const rejoin=(await call('join',{code:host.code,name:'Moss'},guest.token)).body;
    assert.equal(rejoin.you,1);assert.equal(rejoin.state.ply,2);
    assert.equal((await call('leave',{code:host.code},host.token)).status,200);
    const remaining=(await call('state?code='+host.code,null,guest.token)).body;
    assert.equal(remaining.host,1);assert.equal(remaining.phase,'lobby');assert.equal(remaining.state.ply,0);
    assert.equal((await call('leave',{code:host.code},guest.token)).status,200);
    assert.equal((await call('state?code='+host.code,null,guest.token)).status,404);
    const html=await fetch(base);assert.equal(html.status,200);assert((await html.text()).includes('BugTile Rip-off'));assert.equal((await fetch(base+'/art/Q.png')).status,200);
  }finally{await new Promise(r=>server.close(r));}
});
