// Shared rules for browsers, authoritative tables, and tests.
export const TYPES={
 Q:{name:'Queen bee',count:1,color:'#d5a337',hint:'One sliding step. Protect her six sides.'},
 A:{name:'Soldier ant',count:3,color:'#577bba',hint:'Slides any distance around the hive.'},
 B:{name:'Beetle',count:2,color:'#a477bd',hint:'One step. Can climb and cover other bugs.'},
 G:{name:'Grasshopper',count:3,color:'#749f47',hint:'Jumps a straight line of bugs to the first empty hex.'},
 F:{name:'Firefly',count:2,color:'#cc7956',hint:'Exactly three sliding steps, without retracing.'},
 M:{name:'Mosquito',count:1,color:'#8897a1',hint:'Copies a touching bug at the start of its move. On a stack it stays a beetle.'},
 L:{name:'Ladybug',count:1,color:'#cb5550',hint:'Exactly three steps: two over occupied hexes, then down to an empty hex.'},
 P:{name:'Pillbug',count:1,color:'#b3a885',hint:'One sliding step, or carry an adjacent single bug across itself to an empty neighbor.'}
};
export const EXPANSIONS=['M','L','P'];
export const DIRS=[[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
export const key=(q,r)=>`${q},${r}`;
export const xy=k=>k.split(',').map(Number);
export const neighbors=k=>{const[q,r]=xy(k);return DIRS.map(([a,b])=>key(q+a,r+b));};
export const top=(s,k)=>s.board[k]?.at(-1);
export const tileCount=s=>11+(s.expansions?.length||0);
export function normalizeExpansions(value=[]){
 if(!Array.isArray(value)||value.some(k=>!EXPANSIONS.includes(k)))throw Error('Choose Mosquito, Ladybug, or Pillbug expansions.');
 return EXPANSIONS.filter(k=>value.includes(k));
}
export function initial(names=['Fern','Moss'],expansions=[]){
 const enabled=normalizeExpansions(expansions),reserve={Q:1,A:3,B:2,G:3,F:2,M:0,L:0,P:0};
 for(const k of enabled)reserve[k]=1;
 return {board:{},turn:0,turns:[0,0],names:names.map(n=>String(n).trim().slice(0,24)||'Player'),expansions:enabled,reserves:[{...reserve},{...reserve}],ply:0,result:null,log:[],last:null,lastPiece:null,stunnedId:null,repetitions:{}};
}
const height=(b,k)=>b[k]?.length||0;
export function connected(board){
 const keys=Object.keys(board).filter(k=>height(board,k));if(!keys.length)return true;
 const seen=new Set([keys[0]]),todo=[keys[0]];
 while(todo.length)for(const n of neighbors(todo.pop()))if(height(board,n)&&!seen.has(n)){seen.add(n);todo.push(n);}
 return seen.size===keys.length;
}
function gate(b,a,d,level=0){return !neighbors(a).filter(k=>neighbors(d).includes(k)).every(k=>height(b,k)>level);}
const touching=(b,k)=>neighbors(k).some(n=>height(b,n));
function lifted(s,from){const b={...s.board};b[from]=s.board[from].slice(0,-1);if(!b[from].length)delete b[from];return b;}
export function placements(s){
 if(s.result!==null)return [];const keys=Object.keys(s.board);if(!keys.length)return ['0,0'];
 const candidates=new Set(keys.flatMap(neighbors).filter(k=>!height(s.board,k)));
 return [...candidates].filter(k=>{const adj=neighbors(k).map(n=>top(s,n)).filter(Boolean);if(s.turns[s.turn]===0)return true;return adj.some(p=>p.owner===s.turn)&&adj.every(p=>p.owner===s.turn);});
}
function movementFor(s,b,from,type){
 const out=new Set(),startHeight=height(b,from);
 const steps=at=>neighbors(at).filter(n=>!height(b,n)&&neighbors(at).some(k=>neighbors(n).includes(k)&&height(b,k))&&gate(b,at,n));
 if(type==='G'){
  const[q,r]=xy(from);for(const[dq,dr]of DIRS){let a=q+dq,c=r+dr;if(!height(b,key(a,c)))continue;do{a+=dq;c+=dr;}while(height(b,key(a,c)));out.add(key(a,c));}
 }else if(type==='B'){
  for(const n of neighbors(from)){const level=Math.max(startHeight,height(b,n)),contact=level>0||neighbors(from).some(k=>neighbors(n).includes(k)&&height(b,k));if(contact&&gate(b,from,n,level)&&(height(b,n)||touching(b,n)))out.add(n);}
 }else if(type==='Q'||type==='P')steps(from).forEach(n=>out.add(n));
 else if(type==='A'){
  const seen=new Set([from]),todo=[from];while(todo.length)for(const n of steps(todo.pop()))if(!seen.has(n)){seen.add(n);todo.push(n);out.add(n);}
 }else if(type==='F'){
  const walk=(at,path)=>{if(path.length===4){out.add(at);return;}for(const n of steps(at))if(!path.includes(n))walk(n,[...path,n]);};walk(from,[from]);
 }else if(type==='L'){
  for(const first of neighbors(from))if(height(b,first)&&gate(b,from,first,Math.max(startHeight,height(b,first)))){
   for(const second of neighbors(first))if(second!==from&&height(b,second)&&gate(b,first,second,Math.max(height(b,first),height(b,second)))){
    for(const to of neighbors(second))if(to!==from&&to!==first&&!height(b,to)&&gate(b,second,to,height(b,second)))out.add(to);
   }
  }
 }
 out.delete(from);return out;
}
function mosquitoTypes(s,from){
 if(height(s.board,from)>1)return ['B'];
 return [...new Set(neighbors(from).filter(k=>top(s,k)).map(k=>top(s,k).type).filter(t=>t!=='M'))];
}
export function moves(s,from){
 const piece=top(s,from);
 if(s.result!==null||!piece||piece.owner!==s.turn||s.reserves[s.turn].Q||piece.id===s.stunnedId)return [];
 const b=lifted(s,from);if(!connected(b))return [];
 const types=piece.type==='M'?mosquitoTypes(s,from):[piece.type],out=new Set();
 for(const type of types)for(const to of movementFor(s,b,from,type))out.add(to);
 return [...out];
}
export function carryActions(s,via){
 const actor=top(s,via);
 if(s.result!==null||s.reserves[s.turn].Q||!actor||actor.owner!==s.turn||height(s.board,via)!==1||actor.id===s.stunnedId)return [];
 const canCarry=actor.type==='P'||actor.type==='M'&&neighbors(via).some(n=>height(s.board,n)===1&&top(s,n)?.type==='P');
 if(!canCarry)return [];
 const list=[];
 for(const from of neighbors(via)){
  const piece=top(s,from);if(height(s.board,from)!==1||piece.id===s.lastPiece||piece.id===s.stunnedId)continue;
  const b=lifted(s,from);if(!connected(b)||!gate(b,from,via,1))continue;
  for(const to of neighbors(via))if(to!==from&&!height(b,to)&&gate(b,via,to,1))list.push({type:'carry',via,from,to});
 }
 return list;
}
export function actions(s){
 if(s.result!==null)return [];const list=[],spots=placements(s),forced=s.turns[s.turn]>=3&&s.reserves[s.turn].Q;
 for(const type of Object.keys(TYPES))if(s.reserves[s.turn][type]&&(!forced||type==='Q'))for(const to of spots)list.push({type:'place',bug:type,to});
 if(!forced)for(const from of Object.keys(s.board)){
  for(const to of moves(s,from))list.push({type:'move',from,to});
  list.push(...carryActions(s,from));
 }
 return list.length?list:[{type:'pass'}];
}
export function queen(s,owner){for(const[k,stack]of Object.entries(s.board))if(stack.some(p=>p.type==='Q'&&p.owner===owner))return k;return null;}
export function pressure(s,owner){const k=queen(s,owner);return k?neighbors(k).filter(n=>height(s.board,n)).length:0;}
function transition(s,a){
 const n=structuredClone(s),p=n.turn;let tile;
 if(a.type==='place'){
  n.reserves[p][a.bug]--;tile={owner:p,type:a.bug,id:`${p}-${a.bug}-${TYPES[a.bug].count-n.reserves[p][a.bug]}`};n.board[a.to]=[tile];
 }else if(a.type==='move'||a.type==='carry'){
  tile=n.board[a.from].pop();if(!n.board[a.from].length)delete n.board[a.from];(n.board[a.to]??=[]).push(tile);
 }
 n.turns[p]++;n.ply++;n.last={...a,owner:p};n.lastPiece=tile?.id||null;n.stunnedId=a.type==='carry'?tile.id:null;
 const description=a.type==='pass'?'passes':a.type==='carry'?`uses ${TYPES[top(s,a.via).type].name.toLowerCase()} to carry ${TYPES[tile.type].name.toLowerCase()} → ${a.to}`:`${a.type==='place'?'places':'moves'} ${TYPES[tile.type].name.toLowerCase()} → ${a.to}`;
 n.log.push(`${n.names[p]} ${description}`);n.turn=1-p;
 const dead=[0,1].map(o=>pressure(n,o)===6);if(dead.every(Boolean))n.result='draw';else if(dead[0])n.result=1;else if(dead[1])n.result=0;
 // Mobility after a Pillbug turn is part of the position, including its one-turn stun.
 const lastPosition=Object.keys(n.board).find(k=>top(n,k)?.id===n.lastPiece)||null;
 const signature=JSON.stringify([n.turn,Object.keys(n.board).sort().map(k=>[k,n.board[k].map(t=>[t.owner,t.type])]),n.reserves,n.expansions.includes('P')?[lastPosition,!!n.stunnedId]:null]);
 n.repetitions[signature]=(n.repetitions[signature]||0)+1;if(n.repetitions[signature]>=3&&n.result===null)n.result='draw';return n;
}
export function apply(s,action){
 if(s.result!==null)throw Error('This game has ended. Start a new game.');
 const legal=actions(s).find(a=>a.type===action.type&&a.bug===action.bug&&a.from===action.from&&a.to===action.to&&a.via===action.via);
 if(!legal)throw Error('That move is not legal. Choose a highlighted hex.');return transition(s,legal);
}
export function bot(s){
 const legal=actions(s),me=s.turn;let best=legal[0],score=-Infinity;
 for(const a of legal){
  const n=transition(s,a);let v=n.result===me?100000:n.result===1-me?-100000:0;
  v+=pressure(n,1-me)*35-pressure(n,me)*44;v+=a.type==='place'?4:0;v+=a.bug==='Q'&&s.turns[me]>=2?18:0;
  const target=queen(n,1-me);if(target&&a.to){const[x,y]=xy(a.to),[q,r]=xy(target);v-=Math.max(Math.abs(x-q),Math.abs(y-r),Math.abs(x+y-q-r))*.7;}
  v+=Math.random()*3;if(v>score){score=v;best=a;}
 }
 return best;
}
