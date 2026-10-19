import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable,tableView,joinTable,configure,startTable,moveTable,undoTable,rematchTable,leaveTable,tickTable,tickTables} from '../table.mjs';
const opening={type:'place',bug:'Q',to:'0,0'};
function local(mode='hotseat'){const r=createTable('TEST','host','Fern',0);configure(r,0,{mode},0);startTable(r,0,{},0);return r;}
test('Only the host chooses mode, timer, and starts',()=>{const r=createTable('TEST','host','Fern',0);assert.throws(()=>configure(r,1,{timer:30}));configure(r,0,{timer:60});assert.equal(r.timer,60);assert.throws(()=>startTable(r,0));joinTable(r,'guest','Moss');assert.throws(()=>configure(r,0,{mode:'bot'}));startTable(r,0,{},100);assert.equal(r.deadline,60100);assert.throws(()=>configure(r,0,{timer:30}));});
test('Undo reverts exactly one move, expires at two seconds, and cannot repeat',()=>{const r=local();moveTable(r,0,opening,r.version,100);assert.equal(r.undo.until,2100);undoTable(r,0,2099);assert.equal(r.state.ply,0);assert.throws(()=>undoTable(r,0,2099));moveTable(r,0,opening,r.version,3000);assert.throws(()=>undoTable(r,0,5000));});
test('Online undo belongs to its author and disappears after an opposing move',()=>{const r=createTable('TEST','host','Fern',0);joinTable(r,'guest','Moss',0);startTable(r,0,{},0);moveTable(r,0,opening,r.version,100);assert.equal(tableView(r,'guest',200).undoUntil,null);assert.throws(()=>undoTable(r,1,200));moveTable(r,1,{...opening,to:'1,0'},r.version,300);assert.throws(()=>undoTable(r,0,400));undoTable(r,1,400);assert.equal(r.state.ply,1);});
test('Bot waits out undo, then makes one legal move',()=>{const r=local('bot');moveTable(r,0,opening,r.version,100);tickTable(r,2100);assert.equal(r.state.ply,1);tickTable(r,2300);assert.equal(r.state.ply,2);assert.equal(r.state.turn,0);assert.equal(r.undo,null);});
test('Undo cancels a scheduled bot reply',()=>{const r=local('bot');moveTable(r,0,opening,r.version,100);undoTable(r,0,500);tickTable(r,5000);assert.equal(r.state.ply,0);assert.equal(r.botAt,null);});
test('Timer executes a legal move and resets the deadline',()=>{const r=createTable('TEST','host','Fern',0);configure(r,0,{timer:30},0);joinTable(r,'guest','Moss',0);startTable(r,0,{},0);tickTable(r,29999);assert.equal(r.state.ply,0);tickTable(r,30000);assert.equal(r.state.ply,1);assert.equal(r.deadline,60000);assert.equal(r.undo,null);});
test('Leaving transfers host, ends unfinished games, and closes empty tables',()=>{const r=createTable('TEST','host','Fern',0);joinTable(r,'guest','Moss',0);startTable(r,0,{},0);moveTable(r,0,opening,r.version,10);assert.equal(leaveTable(r,0,20),true);assert.equal(r.host,1);assert.equal(r.phase,'lobby');assert.equal(r.state.ply,0);assert.equal(r.undo,null);assert.equal(leaveTable(r,1,30),false);});
test('Rematch keeps wins, resets the board, and requires both online players',()=>{const r=createTable('TEST','host','Fern',0);joinTable(r,'guest','Moss',0);startTable(r,0,{},0);r.state.result=0;r.wins=[1,0];rematchTable(r,0,10);assert.equal(r.state.result,0);rematchTable(r,0,11);assert.equal(r.round,1);rematchTable(r,1,20);assert.equal(r.state.result,null);assert.equal(r.round,2);assert.deepEqual(r.wins,[1,0]);});
test('A completed game records one win; undo reverses that result',()=>{
  const r=local();r.state.turns=[4,4];r.state.reserves[0].Q=0;r.state.reserves[1].Q=0;
  for(const[k,type,owner=0]of [['0,0','Q',1],['1,0','Q'],['1,-1','A'],['0,-1','A'],['-1,0','A'],['-1,1','A'],['1,1','B'],['0,2','A'],['0,3','G']])r.state.board[k]=[{type,owner,id:k}];
  moveTable(r,0,{type:'move',from:'0,3',to:'0,1'},r.version,100);assert.equal(r.state.result,0);assert.deepEqual(r.wins,[1,0]);tickTable(r,500);assert.deepEqual(r.wins,[1,0]);undoTable(r,0,1000);assert.equal(r.state.result,null);assert.deepEqual(r.wins,[0,0]);
});
test('Re-selecting Online play preserves the seated guest name',()=>{const r=createTable('TEST','host','Fern',0);joinTable(r,'guest','Moss',0);configure(r,0,{mode:'online'},0);assert.equal(r.state.names[1],'Moss');});
test('Tables expire after a day without client activity',()=>{const rooms=new Map([['TEST',local()]]);tickTables(rooms,86400000);assert(rooms.has('TEST'));tickTables(rooms,86400001);assert(!rooms.has('TEST'));});
test('A failing table is logged and disarmed while other tables keep running',()=>{
  const broken=local('bot'),healthy=createTable('GOOD','host','Fern',0),errors=[],log=(...parts)=>errors.push(parts.join(' '));
  configure(healthy,0,{timer:30},0);joinTable(healthy,'guest','Moss',0);startTable(healthy,0,{},0);
  moveTable(broken,0,opening,broken.version,100);broken.state.reserves=null;
  const rooms=new Map([['TEST',broken],['GOOD',healthy]]);
  tickTables(rooms,30000,{log});assert.equal(healthy.state.ply,1);assert.equal(broken.botAt,null);assert.equal(errors.length,1);assert.match(errors[0],/TEST/);
  tickTables(rooms,30200,{log});assert.equal(errors.length,1);
});
