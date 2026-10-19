import {TYPES,EXPANSIONS,actions,carryActions,top,xy,pressure,tileCount} from './engine.js';
import {LeaveIcon,ScrollIcon,ClockIcon,BotIcon,UndoIcon,InternetIcon,HotseatIcon} from './icons.js';
import {createFireflyLights} from './fireflies.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storage={get(k){try{return JSON.parse((k==='room'?sessionStorage:localStorage).getItem('hive-garden:'+k));}catch{return null;}},set(k,v){try{(k==='room'?sessionStorage:localStorage).setItem('hive-garden:'+k,JSON.stringify(v));}catch{}}};
// discord holds the SDK and the server-verified identity when running as a Discord Activity.
// entryLock is a message that keeps the entrance closed, for example while signing in.
let discord=null,entryLock='';
let room=null,state=null,busy=false,selection=null,pan={x:0,y:0},zoom=1,offset=0,epoch=0,noticeTimer=null,muted=storage.get('muted')??true;
let hoverInstructions=storage.get('hoverInstructions')??false,hoveredRule=null,hoveredStack=null,previewSignature='';
const hostGem='<svg class="host-gem" viewBox="0 0 16 18" role="img" aria-label="Host"><path d="M4 1h8v2h3v8l-2 2-5 4-5-4-2-2V3h3z" fill="currentColor"/><path d="M5 4h6v6l-3 3-3-3z" fill="#fff4bc"/><path d="M5 4h3v9l-3-3z" fill="#d9b34b"/></svg>';
const legalSVG='<svg class="legal-outline" viewBox="0 0 102 116" aria-hidden="true"><polygon points="51,3 99,30 99,86 51,113 3,86 3,30"/></svg>';
const speciesSVG='<svg class="species-outline" viewBox="0 0 102 116" aria-hidden="true"><path d="M65 20 92 35v46l-41 23-41-23V35l27-15"/></svg>';
const surroundSVG=filled=>`<svg class="surround-hex ${filled?'filled':''}" viewBox="0 0 14 16" aria-hidden="true"><polygon points="7,1 13,4.5 13,11.5 7,15 1,11.5 1,4.5"/></svg>`;
const glowSVG='<svg class="tile-glow" viewBox="0 0 102 116" aria-hidden="true"><polygon points="51,0 102,29 102,87 51,116 0,87 0,29"/></svg>';
const fireflies=createFireflyLights({onChange:(id,src)=>{
  for(const node of document.querySelectorAll('[data-firefly]'))if(node.dataset.firefly===id){
    if(node.tagName==='IMG')node.src=src;else node.style.backgroundImage=`url('${src}')`;
  }
}});
for(const src of ['/art/F.svg','/art/F-lit.svg']){const preload=new Image();preload.src=src;}
const artSource=(type,id)=>type==='F'?fireflies.src(id):`/art/${type}.svg`;
const lightAttribute=(type,id)=>type==='F'?`data-firefly="${esc(id)}"`:'';
function sound(kind='select_001'){if(!muted)new Audio(`/audio/${kind}.ogg`).play().catch(()=>{});}
function notice(message){$('notice').textContent=message;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').textContent='',5000);}
function now(){return Date.now()+offset;}
function save(){if(room)storage.set('room',room);}
async function api(endpoint,data,auth=room?.token){
  const res=await fetch('/api/'+endpoint,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},...(data?{body:JSON.stringify(data)}:{})});
  const value=await res.json();if(!res.ok)throw Error(value.error||'Connection failed.');return value;
}
function ownTurn(){return room?.phase==='game'&&state.result===null&&(room.mode==='online'?room.you===state.turn:room.you===room.host&&(room.mode==='hotseat'||state.turn===room.host));}
function canPlay(){return ownTurn()&&!busy;}
function candidates(){
  if(!selection||!state)return [];
  return actions(state).filter(a=>selection.kind==='place'?a.type==='place'&&a.bug===selection.bug:selection.kind==='carry'?a.type==='carry'&&a.via===selection.via&&a.from===selection.from:selection.kind==='move'?a.type==='move'&&a.from===selection.from:false);
}
function tile(t,classes=''){
  const id=t.id||`reserve-${t.owner}-${t.type}`;
  return `<span class="hex ${t.owner?'dark':''} ${classes}" style="--bug:${TYPES[t.type].color}">${speciesSVG}${glowSVG}<span class="tile-letter">${t.type}</span><img ${lightAttribute(t.type,id)} src="${artSource(t.type,id)}" alt=""></span>`;
}
function guideEntry(type,id='guide'){
  const bug=TYPES[type];
  return `<div class="guide-entry"><img ${lightAttribute(type,id)} src="${artSource(type,id)}" alt=""><span><strong>${bug.name}</strong>${bug.hint}</span></div>`;
}
function renderPreviews(){
  const playing=room?.phase==='game',type=playing&&hoverInstructions&&hoveredRule,stack=playing&&state.board[hoveredStack];
  const layers=stack?.length>1?stack:[],signature=JSON.stringify([type,layers]);
  if(signature===previewSignature)return;previewSignature=signature;
  $('hover-rule').hidden=!type;
  $('hover-rule').innerHTML=type?guideEntry(type,'hover-rule'):'';
  $('stack-preview').hidden=!layers.length;
  $('stack-preview').innerHTML=layers.length?`<strong>Stack:</strong><ol class="stack-tiles" aria-label="Bottom to top">${layers.map((piece,i)=>`<li class="stack-piece" style="z-index:${i}" aria-label="${i===0?'Bottom':i===layers.length-1?'Top':'Layer '+(i+1)}: ${esc(state.names[piece.owner])}, ${TYPES[piece.type].name}">${tile(piece,'preview-tile')}</li>`).join('')}</ol>`:'';
}
function inspectTile(target){
  const reserve=target?.closest?.('#tray [data-bug]'),hex=target?.closest?.('#board [data-hex]');
  if(target?.closest?.('#turn-previews'))return;
  hoveredRule=reserve?.dataset.bug||null;
  hoveredStack=hex?.dataset.hex||null;
  renderPreviews();
}
function reserveStack(type,owner,count,selected){
  const depth=Math.max(0,count-1);
  const backs=Array.from({length:depth},(_,i)=>`<span class="hex reserve-back ${owner?'dark':''}" style="--depth:${depth-i}" aria-hidden="true"></span>`).join('');
  return `<div class="mini" style="--stack-depth:${depth}">${backs}${tile({type,owner},`reserve-top ${selected?'selected':''}`)}</div>`;
}
function boardPoints(){
  const keys=new Set([...Object.keys(state.board),...candidates().map(a=>a.to)]);if(!keys.size)keys.add('0,0');
  return [...keys].map(k=>{const[q,r]=xy(k);return [100.459*(q+r/2),87*r];});
}
function bounds(){const pts=boardPoints(),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);return {left:Math.min(...xs)-53,right:Math.max(...xs)+53,top:Math.min(...ys)-60,bottom:Math.max(...ys)+60};}
// The board fills the table; automatic fitting uses the clear space between overlays.
function clearBoardArea(){
  const board=$('board').getBoundingClientRect(),players=$('players').getBoundingClientRect(),controls=document.querySelector('.board-controls').getBoundingClientRect(),turn=document.querySelector('.hand-heading').getBoundingClientRect();
  const top=Math.max(16,players.bottom-board.top+20,controls.bottom-board.top+12),bottom=Math.max(top+120,turn.top-board.top-16);
  return {width:board.width-32,height:bottom-top,x:board.width/2,y:(top+bottom)/2};
}
function contain(){
  const w=$('board').clientWidth,h=$('board').clientHeight;if(!w||!h)return;
  const b=bounds(),pad=16,max=Math.min(1.8,(w-pad*2)/(b.right-b.left),(h-pad*2)/(b.bottom-b.top));
  zoom=Math.max(.04,Math.min(zoom,max));
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  pan.x=clamp(pan.x,pad-w/2-b.left*zoom,w/2-pad-b.right*zoom);
  pan.y=clamp(pan.y,pad-h/2-b.top*zoom,h/2-pad-b.bottom*zoom);
}
function drawBoard(){
  if(!room||room.phase!=='game')return;contain();
  const board=$('board'),w=board.clientWidth,h=board.clientHeight,targets=new Set(candidates().map(a=>a.to));let html='';
  const position=k=>{const[q,r]=xy(k);return `left:${w/2+pan.x+100.459*(q+r/2)*zoom}px;top:${h/2+pan.y+87*r*zoom}px;width:${102*zoom}px;height:${116*zoom}px;--size:${102*zoom}px;`;};
  if(!Object.keys(state.board).length)targets.add('0,0');
  for(const k of targets)if(!state.board[k])html+=`<button class="hex target" data-to="${k}" style="${position(k)}" aria-label="${state.ply===0?'Starting hex':'Legal destination'} ${k}">${legalSVG}</button>`;
  for(const[k,stack]of Object.entries(state.board)){
    const carrySource=selection?.kind==='carry'&&!selection.from&&carryActions(state,selection.via).some(a=>a.from===k);
    const t=stack.at(-1),css=`${t.owner?'dark':''} ${selection?.from===k||selection?.via===k?'selected':''} ${state.last?.to===k?'last':''} ${targets.has(k)||carrySource?'target':''}`;
    html+=`<button class="hex ${css}" data-hex="${k}" style="${position(k)}--bug:${TYPES[t.type].color}" aria-label="${esc(state.names[t.owner])} ${TYPES[t.type].name} at ${k}${stack.length>1?', stack of '+stack.length:''}">${speciesSVG}${glowSVG}<span class="tile-letter">${t.type}</span><span class="bug-art" ${lightAttribute(t.type,t.id)} style="background-image:url('${artSource(t.type,t.id)}')"></span>${stack.length>1?`<span class="stack-count">×${stack.length}</span>`:''}${targets.has(k)||carrySource?legalSVG:''}</button>`;
  }
  board.innerHTML=html;$('first-hint').hidden=state.ply!==0;renderPreviews();
}
function fit(){
  if(!state||room?.phase!=='game')return;
  $('game').style.setProperty('--table-top',`${$('table').getBoundingClientRect().top+window.scrollY}px`);
  $('game').style.setProperty('--players-height',`${$('players').offsetHeight}px`);
  const b=bounds(),w=$('board').clientWidth,h=$('board').clientHeight;if(!w||!h)return;
  const clear=clearBoardArea();
  zoom=Math.max(.04,Math.min(1,(clear.width-28)/(b.right-b.left+65),(clear.height-24)/(b.bottom-b.top+65)));
  pan={x:clear.x-w/2-(b.left+b.right)/2*zoom,y:clear.y-h/2-(b.top+b.bottom)/2*zoom};
  $('first-hint').style.top=`${clear.y+84*zoom}px`;drawBoard();
}
function renderPlayers(){
  $('players').innerHTML=state.names.map((name,i)=>{
    const empty=room.phase==='lobby'&&room.mode==='online'&&!room.seated[i],count=Object.values(state.reserves[i]).reduce((a,b)=>a+b,0),p=pressure(state,i);
    const enclosure=`<span class="queen-info ${p>=5?'danger':p>=4?'caution':''}" aria-label="Queen surrounded ${p} of 6"><span>${state.reserves[i].Q?'Queen in reserve':'Queen surrounded'}</span><span class="queen-hexes" style="--opponent:${i?'#e8efd6':'#24442e'}">${Array.from({length:6},(_,j)=>surroundSVG(j<p)).join('')}</span></span>`;
    const details=room.phase==='game'?`${tileCount(state)-count} in hive · ${count} in reserve<br>${enclosure}`:empty?'Waiting for a friend':i===room.host?'Table host':room.mode==='bot'?'Practice opponent':room.mode==='hotseat'?'On this screen':'Ready to play';
    const own=room.mode==='hotseat'?i===state.turn:i===room.you;
    return `<article class="player ${i?'dark':''} ${empty?'empty':''} ${room.phase==='game'&&state.result===null&&state.turn===i?'active':''}"><strong>${i===room.host?hostGem:room.mode==='bot'?BotIcon:''}<span class="${own&&!empty?'own-name':''}" ${own&&!empty?'aria-label="Your colony"':''}>${esc(empty?'Empty seat':name)}</span></strong><small>${details}</small></article>`;
  }).join('');
}
function render(){
  const has=!!room,game=has&&room.phase==='game';
  document.body.className=has?`table-screen ${game?'game-screen':''}`:'entrance-screen';
  $('entrance').hidden=has;$('table').hidden=!has;
  for(const id of ['copy','timer-toggle','undo-toggle','scoreboard-toggle','leave-room'])$(id).hidden=!has;
  $('log-toggle').hidden=!game;$('mode-label').hidden=!has;
  if(!has){hoveredRule=null;hoveredStack=null;renderPreviews();updateClocks();return;}
  $('mode-label').textContent=({online:'Online play',hotseat:'Hot-seat play',bot:'Local game'})[room.mode];
  $('table-code').textContent='Table '+room.code;
  $('turn-number').textContent=game?`Turn ${state.ply+1} · Copy code`:'Lobby · Copy code';
  $('lobby').hidden=game;$('game').hidden=!game;renderPlayers();
  const host=room.you===room.host;
  $('timer-toggle').hidden=!host||room.mode!=='online';
  $('undo-toggle').hidden=!host||game;
  if($('timer-toggle').hidden){$('timer-panel').hidden=true;$('timer-toggle').setAttribute('aria-expanded','false');}
  if($('undo-toggle').hidden){$('undo-panel').hidden=true;$('undo-toggle').setAttribute('aria-expanded','false');}
  document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('chosen',b.dataset.mode===room.mode);b.setAttribute('aria-pressed',String(b.dataset.mode===room.mode));b.disabled=!host||busy;});
  $('second-name').hidden=room.mode!=='hotseat';$('other-name').disabled=!host;
  if(document.activeElement!==$('other-name')&&room.mode==='hotseat')$('other-name').value=state.names[1-room.host];
  $('lobby-summary').textContent=room.mode==='online'?`${room.seated.filter(Boolean).length}/2 players seated. Share the table code to invite a friend.`:room.mode==='hotseat'?'Two colonies, one screen. Take turns placing and moving your bugs.':`A quiet practice game against ${state.names[1-room.host]}.`;
  $('lobby-timer').hidden=room.mode!=='online';
  $('lobby-timer').textContent=room.timer?`Turn timer: ${room.timer} seconds`:'No turn timer. Take your time.';
  $('start').hidden=!host;$('waiting-host').hidden=host;
  $('lobby-leave').hidden=!host;
  $('start').disabled=busy||room.mode==='online'&&!room.ready;
  document.querySelectorAll('[data-timer]').forEach(b=>{b.classList.toggle('chosen',Number(b.dataset.timer)===room.timer);b.disabled=!host||game||busy;});
  document.querySelectorAll('[data-undo]').forEach(b=>{b.classList.toggle('chosen',(b.dataset.undo==='true')===room.undoEnabled);b.setAttribute('aria-pressed',String((b.dataset.undo==='true')===room.undoEnabled));b.disabled=!host||game||busy;});
  document.querySelectorAll('[data-expansion]').forEach(b=>{const enabled=room.expansions.includes(b.dataset.expansion);b.classList.toggle('chosen',enabled);b.setAttribute('aria-pressed',String(enabled));b.disabled=!host||game||busy;});
  $('classic-rules').classList.toggle('chosen',!room.expansions.length);$('classic-rules').setAttribute('aria-pressed',String(!room.expansions.length));$('classic-rules').disabled=!host||game||busy;
  $('timer-note').textContent=game?'The timer is set for this game. Choose its duration in the lobby before the next game.':'The host can set a timer before starting. When time runs out, a legal move is made automatically.';
  $('score-meta').textContent=`Round ${room.round} · ${room.draws} ${room.draws===1?'draw':'draws'}`;
  $('scores').innerHTML=state.names.map((n,i)=>`<li><span>${i===room.host?hostGem:room.mode==='bot'?BotIcon:''}${esc(n)}</span><strong>${room.wins[i]} ${room.wins[i]===1?'win':'wins'}</strong></li>`).join('');
  $('log').innerHTML=state.log.length?state.log.map((line,i)=>`<li><span class="log-seq">${i+1}.</span>${esc(line)}</li>`).join(''):'<li>No moves yet.</li>';
  if(!game){updateClocks();return;}
  const ended=state.result!==null,p=state.turn,forced=state.turns[p]>=3&&state.reserves[p].Q;
  $('turn-title').textContent=ended?(state.result==='draw'?'A draw.':`${state.names[state.result]} wins!`):room.mode==='bot'&&p!==room.host?`${state.names[p]} is thinking…`:`${state.names[p]}’s turn`;
  $('turn-hint').textContent=ended?'The result has been added to the table scoreboard.':forced?'Your fourth turn: place your queen.':state.reserves[p].Q?'Place a bug. Your queen must arrive by your fourth turn.':'Place a bug from your reserve, or select one in the hive to move.';
  const reserveOwner=room.mode==='hotseat'?p:room.you,legal=canPlay()?actions(state):[];
  $('reserve-title').textContent=room.mode==='hotseat'?`${state.names[p]}’s reserve`:'Your reserve';
  $('reserve-count').textContent=`${Object.values(state.reserves[reserveOwner]).reduce((a,b)=>a+b,0)} TILES LEFT`;
  $('tray').innerHTML=Object.entries(TYPES).filter(([k])=>!EXPANSIONS.includes(k)||state.expansions.includes(k)).map(([k,t])=>`<button class="reserve-bug ${selection?.bug===k?'selected':''}" data-bug="${k}" aria-disabled="${!legal.some(a=>a.bug===k)}" aria-label="${t.name}, ${state.reserves[reserveOwner][k]} remaining" aria-pressed="${selection?.bug===k}">${reserveStack(k,reserveOwner,state.reserves[reserveOwner][k],selection?.bug===k)}<span class="bug-name">${k==='A'?'Ant':t.name}</span><span class="count">× ${state.reserves[reserveOwner][k]} remaining</span></button>`).join('');
  const selectedType=selection?.bug||((selection?.via||selection?.from)&&top(state,selection.via||selection.from)?.type);
  $('bug-hint').textContent=selectedType?TYPES[selectedType].hint:'Choose a tile to see where it can go.';
  const via=selection?.via||selection?.from,canCarry=via&&canPlay()&&carryActions(state,via).length>0;
  $('ability-controls').hidden=!canCarry;
  $('carry-hint').hidden=!canCarry;
  if(canCarry){const type=top(state,via).type;$('carry-toggle').style.setProperty('--action-colour',TYPES[type].color);}
  $('carry-toggle').textContent=selection?.kind==='carry'?'Move this bug instead':'Carry a bug';
  $('carry-hint').textContent=selection?.kind==='carry'?(selection.from?'Choose a dashed destination.':'Choose one of the highlighted neighboring bugs.'):'Use this bug’s Pillbug ability instead of moving it.';
  $('pass').hidden=!canPlay()||legal[0]?.type!=='pass';$('rematch').hidden=!ended;
  $('rematch').disabled=busy||room.rematch.includes(room.you);
  $('rematch').textContent=room.rematch.includes(room.you)?'Rematch requested':'Rematch';
  updateClocks();drawBoard();
}
function updateClocks(){
  const undo=room?.undoEnabled&&room?.phase==='game'&&room.undoUntil>now();$('undo').hidden=!undo;
  if(undo){$('undo-seconds').textContent=Math.max(0,(room.undoUntil-now())/1000).toFixed(1)+'s';$('undo').disabled=busy;}
  const timer=room?.mode==='online'&&room.timer>0;$('timer-status').hidden=!timer;
  $('undo-status').hidden=!room||room.undoEnabled;
  if(timer){const running=room.deadline&&state?.result===null,left=running?Math.max(0,Math.ceil((room.deadline-now())/1000)):room.timer;$('timer-status-label').textContent=running?`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`:`${room.timer} sec`;$('timer-status').classList.toggle('urgent',running&&left<=10);$('timer-status').setAttribute('aria-label',`Turn timer: ${left} seconds`);}
}
function accept(next,force=false){
  if(room&&next.code===room.code&&next.version<room.version)return;
  offset=next.serverNow-Date.now();const changed=force||!room||next.code!==room.code||next.version!==room.version;
  const oldPly=state?.ply,newScreen=!room||room.code!==next.code||room.phase!==next.phase;room={...next,token:next.token||room?.token};state=room.state;save();
  if(changed){selection=null;render();if(room.phase==='game')fit();if(newScreen)window.scrollTo(0,0);if(oldPly!==undefined&&state.ply>oldPly)sound('drop_001');}else updateClocks();
}
async function request(endpoint,data={}){
  if(busy||!room)return;busy=true;const run=epoch,code=room.code;render();
  try{const next=await api(endpoint,{code,...data});if(run!==epoch||code!==room?.code)return;busy=false;accept(next,true);}
  catch(e){notice(e.message);}finally{busy=false;if(room)render();}
}
async function enter(create,code=''){
  if(entryLock)return notice(entryLock);if(busy)return;const name=$('name').value.trim();busy=true;$('create').disabled=true;$('join').disabled=true;
  try{const saved=storage.get('room');const next=await api(create?'create':'join',{name,code,...(discord?{identity:discord.identity}:{})},!create&&saved?.code===code?saved.token:undefined);storage.set('name',next.state.names[next.you]);renderName();epoch++;room=null;state=null;busy=false;accept(next,true);sound('confirmation_001');}
  catch(e){notice(e.message);}finally{busy=false;$('create').disabled=!!entryLock;$('join').disabled=!!entryLock;}
}
async function refreshTables(){
  if(room)return;try{const result=await api('tables');if(room)return;$('tables').innerHTML=result.tables.length?`<div class="table-list">${result.tables.map(t=>`<article class="open-patch"><a href="#table-${esc(t.code)}" data-join="${esc(t.code)}" class="open-table"><span class="patch-grass" aria-hidden="true"></span><strong>Table ${esc(t.code)}</strong><small>${esc(t.name)} · 1/2 players</small><span class="patch-join">Take a seat →</span></a></article>`).join('')}</div>`:'<p>No open tables yet. Create one!</p>';}
  catch{$('tables').innerHTML='<p>Couldn’t load open tables. Retrying…</p>';}
}
function pickHex(k){
  const action=candidates().find(a=>a.to===k);if(action&&canPlay())return request('move',{version:room.version,action});
  if(!canPlay())return;
  if(selection?.kind==='carry'&&carryActions(state,selection.via).some(a=>a.from===k)){selection={kind:'carry',via:selection.via,from:k};sound();render();return;}
  const t=top(state,k);
  if(t&&t.owner===state.turn){
    if(state.reserves[state.turn].Q)return notice('Place your queen before moving your bugs.');
    if(!actions(state).some(a=>a.type==='move'&&a.from===k)&&!carryActions(state,k).length)return notice('This bug is blocked or holds the hive together.');
    selection=selection?.from===k?null:{kind:'move',from:k};sound();render();
  }else if(!state.ply)notice('Choose a bug from your reserve first.');else{selection=null;render();}
}
let drag=null,dragged=false;
const board=$('board');
board.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,pan:{...pan}};dragged=false;});
board.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>5)dragged=true;if(dragged){pan={x:drag.pan.x+dx,y:drag.pan.y+dy};drawBoard();}});
window.addEventListener('pointerup',()=>drag=null);board.addEventListener('pointercancel',()=>drag=null);
board.addEventListener('click',e=>{if(dragged){dragged=false;return;}const b=e.target.closest('[data-hex],[data-to]');if(b)pickHex(b.dataset.hex||b.dataset.to);});
board.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.04,zoom*(e.deltaY>0?.9:1.1));drawBoard();},{passive:false});
$('entry').onsubmit=e=>{e.preventDefault();enter(true);};
$('join').onclick=()=>{const code=$('code').value.trim().toUpperCase();if(!code)return notice('Enter a table code first.');enter(false,code);};
$('code').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('join').click();}};
$('tables').onclick=e=>{const b=e.target.closest('[data-join]');if(b){e.preventDefault();enter(false,b.dataset.join);}};
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>request('settings',{mode:b.dataset.mode,otherName:$('other-name').value}));
$('other-name').onchange=()=>request('settings',{otherName:$('other-name').value});
$('start').onclick=()=>request('start',{otherName:$('other-name').value});
$('tray').onclick=e=>{const b=e.target.closest('[data-bug]');if(!b||b.getAttribute('aria-disabled')==='true')return;selection=selection?.bug===b.dataset.bug?null:{kind:'place',bug:b.dataset.bug};sound();render();};
$('undo').onclick=()=>request('undo');$('pass').onclick=()=>request('move',{version:room.version,action:{type:'pass'}});$('rematch').onclick=()=>request('rematch');
$('carry-toggle').onclick=()=>{const via=selection.via||selection.from;selection=selection.kind==='carry'?{kind:'move',from:via}:{kind:'carry',via};render();};
$('recenter').onclick=fit;$('zoom-in').onclick=()=>{zoom*=1.2;drawBoard();};$('zoom-out').onclick=()=>{zoom=Math.max(.04,zoom/1.2);drawBoard();};
function renderSound(){
  $('sound-toggle').innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17V5l11-2v12M9 9l11-2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 16h6v5H3zm11-2h6v5h-6z" fill="currentColor"/>${muted?'<path d="M3 3l18 18" stroke="#ba4949" stroke-width="3"/>':''}</svg>`;
  $('sound-toggle').setAttribute('aria-label',muted?'Unmute sounds':'Mute sounds');$('sound-toggle').title=muted?'Unmute sounds':'Mute sounds';
}
$('sound-toggle').onclick=()=>{muted=!muted;storage.set('muted',muted);renderSound();sound();};renderSound();
function closePanels(){for(const[id,button]of [['table-log','log-toggle'],['table-scoreboard','scoreboard-toggle'],['timer-panel','timer-toggle'],['undo-panel','undo-toggle']]){$(id).hidden=true;$(button).setAttribute('aria-expanded','false');}}
function togglePanel(id,button){const show=$(id).hidden;closePanels();$(id).hidden=!show;$(button).setAttribute('aria-expanded',String(show));}
$('log-toggle').onclick=()=>togglePanel('table-log','log-toggle');$('scoreboard-toggle').onclick=()=>togglePanel('table-scoreboard','scoreboard-toggle');$('timer-toggle').onclick=()=>togglePanel('timer-panel','timer-toggle');
$('undo-toggle').onclick=()=>togglePanel('undo-panel','undo-toggle');
for(const b of document.querySelectorAll('[data-close]'))b.onclick=closePanels;
for(const b of document.querySelectorAll('[data-timer]'))b.onclick=()=>request('settings',{timer:Number(b.dataset.timer)});
for(const b of document.querySelectorAll('[data-undo]'))b.onclick=()=>request('settings',{undoEnabled:b.dataset.undo==='true'});
$('help').onclick=()=>$('rules').showModal();document.querySelector('.close').onclick=()=>$('rules').close();
function renderHoverSetting(){
  $('hover-instructions').classList.toggle('chosen',hoverInstructions);
  $('hover-instructions').setAttribute('aria-pressed',String(hoverInstructions));
}
$('hover-instructions').onclick=()=>{hoverInstructions=!hoverInstructions;storage.set('hoverInstructions',hoverInstructions);renderHoverSetting();renderPreviews();};
renderHoverSetting();
document.addEventListener('pointerover',e=>inspectTile(e.target));
document.addEventListener('focusin',e=>inspectTile(e.target));
document.documentElement.addEventListener('pointerleave',()=>{hoveredRule=null;hoveredStack=null;renderPreviews();});
$('leave-room').onclick=()=>{
  $('leave-message').textContent=room.mode==='online'&&room.seated.filter(Boolean).length===2?'Leaving ends an unfinished game and returns your friend to the lobby. If you are the host, they become the host. Finished-game wins stay on the table.':'Leaving closes this table. You can create a new table from the entrance.';
  $('leave-dialog').showModal();
};
$('stay').onclick=()=>$('leave-dialog').close();
$('lobby-leave').onclick=()=>$('leave-room').click();
$('confirm-leave').onclick=async()=>{
  if(busy)return;busy=true;try{await api('leave',{code:room.code});epoch++;room=null;state=null;selection=null;storage.set('room',null);closePanels();$('leave-dialog').close();$('resume').hidden=true;render();refreshTables();notice('You left the table.');}catch(e){notice(e.message);}finally{busy=false;}
};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(room.code);notice('Table code copied: '+room.code);}catch{notice('Table code: '+room.code);}};
$('resume').onclick=async()=>{
  if(busy)return;busy=true;try{const saved=storage.get('room');if(!saved)throw Error('No saved table.');const next=await api('state?code='+saved.code,undefined,saved.token);epoch++;room={token:saved.token};busy=false;accept(next,true);}catch(e){notice(e.message);storage.set('room',null);$('resume').hidden=true;}finally{busy=false;}
};
function renderName(){
  if(discord){$('name').value=discord.name;$('name').disabled=true;$('clear-name').hidden=true;return;}
  const saved=storage.get('name');$('name').disabled=!!saved;$('clear-name').hidden=!saved;if(saved)$('name').value=saved;}
$('clear-name').onclick=()=>{storage.set('name',null);$('name').value='';renderName();$('name').focus();};
$('timer-toggle').innerHTML=ClockIcon+'<span class="control-label">Turn timer</span>';
$('log-toggle').innerHTML=ScrollIcon+'<span class="control-label">Game log</span>';
$('leave-room').innerHTML=LeaveIcon+'<span class="control-label">Leave table</span>';
$('undo-toggle').innerHTML=UndoIcon+'<span class="control-label">Enable or disable Undo move</span>';
$('timer-status').innerHTML=ClockIcon+'<small id="timer-status-label"></small>';
$('undo-status').innerHTML=UndoIcon+'<svg class="cross-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18" stroke="#ba4949" stroke-width="3"/></svg>';
for(const[mode,icon]of [['online',InternetIcon],['hotseat',HotseatIcon],['bot',BotIcon]])document.querySelector(`[data-mode="${mode}"] .mode-icon`).innerHTML=icon;
$('rules-picker').innerHTML='<button id="classic-rules"><strong>Classic</strong><small>The original five bug types</small></button>'+EXPANSIONS.map(k=>`<button data-expansion="${k}"><strong>${TYPES[k].name}</strong><small><span>Adds the ${TYPES[k].name}</span><span class="expansion-tile" aria-hidden="true"><span class="hex neutral" style="--bug:${TYPES[k].color}">${speciesSVG}<img src="/art/${k}.svg" alt=""></span></span></small></button>`).join('');
$('classic-rules').onclick=()=>request('settings',{expansions:[]});
for(const b of document.querySelectorAll('[data-expansion]'))b.onclick=()=>{const key=b.dataset.expansion,next=room.expansions.includes(key)?room.expansions.filter(k=>k!==key):[...room.expansions,key];request('settings',{expansions:next});};
$('bug-guide').innerHTML=Object.keys(TYPES).map(k=>guideEntry(k)).join('');
window.addEventListener('resize',()=>room?.phase==='game'&&fit());
let fitFrame;
const layoutObserver=new ResizeObserver(()=>{cancelAnimationFrame(fitFrame);fitFrame=requestAnimationFrame(fit);});
// Hover panels must not recenter a destination underneath the pointer.
for(const element of [$('header'),$('players'),$('reserve'),document.querySelector('.hand-heading .actions')])layoutObserver.observe(element);
document.fonts.ready.then(fit);
window.addEventListener('keydown',e=>{if(e.key==='Escape'){selection=null;closePanels();if(room)render();}});
// Long poll: one request at a time, answered when the table changes or after about 25 seconds.
// A request still held for a table you left does not block polling the new one.
let poll=null;
setInterval(async()=>{
  if(!room||busy||poll?.code===room.code)return;const current=poll={code:room.code},run=epoch;
  try{const next=await api(`state?code=${current.code}&since=${room.version}`);if(run===epoch&&room?.code===current.code&&!busy)accept(next);}
  catch(e){if(run===epoch)notice('Connection lost. Retrying… '+e.message);await new Promise(r=>setTimeout(r,2000));}
  finally{if(poll===current)poll=null;}
},350);
setInterval(updateClocks,50);setInterval(refreshTables,5000);
function lockEntrance(message){
  entryLock=message;$('entry-status').textContent=message;$('entry-status').hidden=!message;
  for(const id of ['create','join','resume'])$(id).disabled=!!message;
}
// Discord's frame blocks ordinary navigation away, so the SDK asks Discord to open external links.
document.addEventListener('click',e=>{const link=e.target.closest?.('a[target="_blank"]');if(link&&discord){e.preventDefault();discord.sdk.commands.openExternalLink({url:link.href}).catch(()=>{});}});
// Inside Discord (its Activity frame adds frame_id to the URL), sign in through the Embedded App SDK:
// ready, authorize, a server-side code exchange, then authenticate. Outside Discord, guests play when allowed.
async function boot(){
  const inDiscord=new URLSearchParams(location.search).has('frame_id');
  if(inDiscord)lockEntrance('Signing in with Discord…');
  try{
    const cfg=await api('config');
    if(!inDiscord){if(!cfg.guests)lockEntrance('Open this game inside Discord.');return;}
    if(!cfg.clientId)throw Error('Discord Client ID is missing on the server.');
    const {DiscordSDK}=await import('/discord-sdk.js'),sdk=new DiscordSDK(cfg.clientId);
    await sdk.ready();
    const {code}=await sdk.commands.authorize({client_id:cfg.clientId,response_type:'code',state:'',prompt:'none',scope:['identify']});
    const login=await api('login',{code});
    await sdk.commands.authenticate({access_token:login.access_token});
    discord={sdk,identity:login.identity,name:login.name};renderName();lockEntrance('');
  }catch(e){lockEntrance(inDiscord?`Discord sign-in failed: ${e.message}`:e.message);}
}
$('name').value=storage.get('name')||'';renderName();$('resume').hidden=!storage.get('room');render();refreshTables();boot();
