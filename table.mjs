import {initial, apply, actions, bot, normalizeExpansions} from './public/engine.js';
import {randomName} from './public/names.js';

const clean=(name,fallback)=>String(name||'').trim().slice(0,24)||fallback;
export function createTable(code,token,name,now=Date.now()) {
  return {code,tokens:[token,null],host:0,mode:'online',phase:'lobby',state:initial([clean(name,randomName()),'Waiting for a player']),version:0,timer:0,undoEnabled:true,expansions:[],deadline:null,botAt:null,undo:null,wins:[0,0],draws:0,round:1,rematch:[],updated:now};
}
export function tableView(r,token,now=Date.now()) {
  // repetitions only serves the server's draw check and grows every turn, so clients never receive it.
  const you=r.tokens.indexOf(token),{repetitions,...state}=r.state;
  return {code:r.code,version:r.version,state,you,host:r.host,mode:r.mode,phase:r.phase,seated:r.tokens.map(Boolean),ready:r.tokens.every(Boolean),timer:r.timer,undoEnabled:r.undoEnabled,expansions:r.expansions,deadline:r.deadline,wins:r.wins,draws:r.draws,round:r.round,rematch:r.rematch,serverNow:now,undoUntil:r.undoEnabled&&r.undo?.actor===you?r.undo.until:null};
}
function hostOnly(r,you){if(you!==r.host)throw Error('Only the host can change this.');}
function arm(r,now){
  r.deadline=r.mode==='online'&&r.phase==='game'&&r.state.result===null&&r.timer?now+r.timer*1000:null;
  r.botAt=r.phase==='game'&&r.mode==='bot'&&r.state.turn!==r.host&&r.state.result===null?now+(r.undoEnabled?2200:550):null;
}
export function joinTable(r,token,name,now=Date.now()) {
  if(r.mode!=='online'||r.phase!=='lobby')throw Error('This table is not open for joining.');
  const seat=r.tokens.indexOf(null);if(seat<0)throw Error('This table already has two players.');
  r.tokens[seat]=token;r.state.names[seat]=clean(name,randomName(r.state.names));r.wins[seat]=0;r.version++;r.updated=now;return seat;
}
export function configure(r,you,data,now=Date.now()) {
  hostOnly(r,you);if(r.phase!=='lobby')throw Error('Settings can only change in the lobby.');
  if(data.timer!==undefined&&![0,30,60,120].includes(data.timer))throw Error('Choose one of the timer options.');
  if(data.undoEnabled!==undefined&&typeof data.undoEnabled!=='boolean')throw Error('Choose Enable Undo or Disable undo.');
  if(data.expansions!==undefined)normalizeExpansions(data.expansions);
  if(data.mode!==undefined){
    if(!['online','hotseat','bot'].includes(data.mode))throw Error('Unknown game mode.');
    if(data.mode!=='online'&&r.tokens.filter(Boolean).length>1)throw Error('Your friend is seated. Leave Online play selected while they are here.');
    const changed=r.mode!==data.mode;r.mode=data.mode;
    if(changed)r.state.names[1-r.host]=data.mode==='bot'?randomName(r.state.names):data.mode==='hotseat'?clean(data.otherName,randomName(r.state.names)):'Waiting for a player';
  }
  if(data.otherName!==undefined&&r.mode==='hotseat')r.state.names[1-r.host]=clean(data.otherName,r.state.names[1-r.host]);
  if(data.timer!==undefined)r.timer=data.timer;
  if(data.undoEnabled!==undefined)r.undoEnabled=data.undoEnabled;
  if(data.expansions!==undefined){r.expansions=normalizeExpansions(data.expansions);r.state=initial(r.state.names,r.expansions);}
  r.version++;r.updated=now;
}
export function startTable(r,you,data={},now=Date.now()) {
  hostOnly(r,you);if(r.phase!=='lobby')throw Error('The game is already running.');
  if(r.mode==='online'&&!r.tokens.every(Boolean))throw Error('A second player needs to join first.');
  if(r.mode==='hotseat')r.state.names[1-r.host]=clean(data.otherName,r.state.names[1-r.host]);
  r.state=initial(r.state.names,r.expansions);r.phase='game';r.undo=null;r.rematch=[];r.version++;r.updated=now;arm(r,now);
}
export function moveTable(r,you,action,version,now=Date.now(),automatic=false) {
  if(r.phase!=='game')throw Error('The host needs to start the game first.');
  if(version!==r.version)throw Error('The board changed. Try again.');
  if(!automatic&&(r.mode==='online'?r.state.turn!==you:you!==r.host||r.mode==='bot'&&r.state.turn!==r.host))throw Error('It is your opponent’s turn.');
  const before={state:r.state,wins:[...r.wins],draws:r.draws};
  r.state=apply(r.state,action);
  if(r.state.result==='draw')r.draws++;else if(r.state.result!==null)r.wins[r.state.result]++;
  r.undo=automatic||!r.undoEnabled?null:{...before,actor:you,until:now+2000};
  if(automatic)r.state.log[r.state.log.length-1]+=' · '+(r.mode==='bot'&&you!==r.host?'bot':'timer');
  r.version++;r.updated=now;r.rematch=[];arm(r,now);
}
export function undoTable(r,you,now=Date.now()) {
  if(!r.undoEnabled||!r.undo||r.undo.actor!==you||now>=r.undo.until)throw Error('Undo is available only for two seconds after your own latest move when enabled.');
  r.state=r.undo.state;r.wins=r.undo.wins;r.draws=r.undo.draws;r.undo=null;r.version++;r.updated=now;arm(r,now);
}
export function rematchTable(r,you,now=Date.now()) {
  if(r.state.result===null)throw Error('Finish this game first.');
  if(!r.rematch.includes(you))r.rematch.push(you);
  if(r.mode!=='online'||r.rematch.length===2){r.state=initial(r.state.names,r.expansions);r.round++;r.undo=null;r.rematch=[];arm(r,now);}
  r.version++;r.updated=now;
}
export function leaveTable(r,you,now=Date.now()) {
  r.tokens[you]=null;r.state.names[you]='Waiting for a player';r.undo=null;r.deadline=null;r.botAt=null;r.rematch=[];
  if(r.tokens.every(t=>!t))return false;
  if(r.host===you)r.host=1-you;
  r.phase='lobby';r.mode='online';r.state=initial(r.state.names,r.expansions);r.version++;r.updated=now;return true;
}
export function tickTable(r,now=Date.now()) {
  if(r.phase!=='game'||r.state.result!==null)return;
  if(r.botAt&&now>=r.botAt){const a=bot(r.state);moveTable(r,1-r.host,a,r.version,now,true);}
  else if(r.deadline&&now>=r.deadline){const legal=actions(r.state);moveTable(r,r.state.turn,legal[Math.floor(Math.random()*legal.length)],r.version,now,true);}
}
// Advances every table and expires idle ones: unstarted lobbies after ten minutes, games after a day.
// A table whose automatic move fails is logged and disarmed so one bad table cannot stop the others.
export function tickTables(rooms,now=Date.now(),{expireMs=86400000,idleLobbyMs=600000,log=console.error}={}) {
  for(const[code,r]of rooms){
    if(now-r.updated>(r.phase==='lobby'?idleLobbyMs:expireMs)){rooms.delete(code);continue;}
    try{tickTable(r,now);}catch(e){log(`Table ${code} stopped its automatic move:`,e);r.botAt=null;r.deadline=null;}
  }
}
