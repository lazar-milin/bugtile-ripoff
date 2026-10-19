import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {networkInterfaces} from 'node:os';
import {createTable,tableView,joinTable,configure,startTable,moveTable,undoTable,rematchTable,leaveTable,tickTable,tickTables} from './table.mjs';
const root=path.resolve(fileURLToPath(new URL('./public/',import.meta.url)));
const rooms=new Map(),token=()=>randomBytes(18).toString('hex');
// Limits for a public host. Tests shorten them. Guests are browser players without Discord sign-in;
// ALLOW_GUESTS=false or NODE_ENV=production makes the server Discord-only.
export const config={maxTables:500,openTableMs:60000,idleLobbyMs:600000,longPollMs:25000,guests:process.env.ALLOW_GUESTS!=='false'&&process.env.NODE_ENV!=='production'};
// Discord sign-ins by identity token: the verified Discord name a player sits down with. They last a day.
const identities=new Map();
const missing='Table not found. It may have closed. Create a table or choose an open one.',unseated='Your seat is no longer at this table. Join again from the entrance.';
const send=(res,status,data)=>{if(res.writableEnded||res.destroyed)return;res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
// State requests held open until their table changes, closes, or drops their seat.
const waiters=new Set();
function answer(w){
  waiters.delete(w);clearTimeout(w.timer);const r=rooms.get(w.code);
  if(!r)return send(w.res,404,{error:missing});if(!r.tokens.includes(w.token))return send(w.res,403,{error:unseated});send(w.res,200,tableView(r,w.token));
}
function wake(){for(const w of waiters){const r=rooms.get(w.code);if(r?.version!==w.since||!r.tokens.includes(w.token))answer(w);}}
export const server=http.createServer(async(req,res)=>{try{
  res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){
    if(req.method==='POST')res.once('finish',wake);
    let data={};
    if(req.method==='POST'){let body='';for await(const c of req){body+=c;if(body.length>10000)throw Error('Request too large.');}
      try{data=JSON.parse(body||'{}');}catch{data=null;}if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Expected a JSON request body.');}
    else if(req.method!=='GET')return send(res,405,{error:'Method not allowed.'});
    const endpoint=url.pathname.slice(5);
    // Only lobbies whose host is still connected; an abandoned lobby drops off within a minute.
    if(req.method==='GET'&&endpoint==='tables')return send(res,200,{tables:[...rooms.values()].filter(r=>r.phase==='lobby'&&r.mode==='online'&&r.tokens.filter(Boolean).length===1&&Date.now()-r.updated<config.openTableMs).map(r=>({code:r.code,name:r.state.names[r.host],players:1}))});
    if(req.method==='GET'&&endpoint==='config')return send(res,200,{clientId:process.env.DISCORD_CLIENT_ID||'',guests:config.guests});
    if(req.method==='POST'&&endpoint==='login'){
      // Exchanges the Activity's OAuth code server-side, so the client secret never reaches the browser.
      if(!process.env.DISCORD_CLIENT_ID||!process.env.DISCORD_CLIENT_SECRET)throw Error('The host needs to configure Discord credentials.');
      const grant=await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.DISCORD_CLIENT_ID,client_secret:process.env.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code:String(data.code||'')}),signal:AbortSignal.timeout(15000)});
      if(!grant.ok)throw Error('Discord authorization failed. Reopen the Activity.');
      const {access_token}=await grant.json();
      const profile=await fetch('https://discord.com/api/v10/users/@me',{headers:{authorization:`Bearer ${access_token}`},signal:AbortSignal.timeout(15000)});
      if(!profile.ok)throw Error('Could not verify your Discord identity.');
      const user=await profile.json(),identity=token(),name=String(user.global_name||user.username).trim().slice(0,24);
      identities.set(identity,{id:user.id,name,created:Date.now()});return send(res,200,{identity,name,access_token});
    }
    // A Discord player sits down under their verified Discord name; guests choose their own.
    if(req.method==='POST'&&(endpoint==='create'||endpoint==='join')){
      const who=data.identity?identities.get(data.identity):null;
      if(data.identity&&!who)return send(res,401,{error:'Discord sign-in expired. Reopen the Activity.'});
      if(!who&&!config.guests)return send(res,403,{error:'Open this game inside Discord.'});
      if(who)data.name=who.name;
    }
    if(req.method==='POST'&&endpoint==='create'){
      if(rooms.size>=config.maxTables){
        // Make room by closing a lobby whose host has gone. Active lobbies and running games are never closed.
        const idle=[...rooms.values()].filter(r=>r.phase==='lobby'&&Date.now()-r.updated>=config.openTableMs).sort((a,b)=>a.updated-b.updated)[0];
        if(!idle)return send(res,503,{error:'The server is full. Try again later.'});
        rooms.delete(idle.code);
      }
      let code;do{code=randomBytes(4).toString('hex').toUpperCase();}while(rooms.has(code));
      const t=token(),r=createTable(code,t,data.name);rooms.set(code,r);return send(res,200,{...tableView(r,t),token:t});
    }
    const code=String(data.code||url.searchParams.get('code')||'').toUpperCase(),r=rooms.get(code);
    if(!r)return send(res,404,{error:missing});
    const t=req.headers.authorization?.replace('Bearer ',''),you=r.tokens.indexOf(t);
    if(req.method==='POST'&&endpoint==='join'){
      if(you>=0)return send(res,200,tableView(r,t));
      const next=token();joinTable(r,next,data.name);return send(res,200,{...tableView(r,next),token:next});
    }
    if(you<0)return send(res,403,{error:unseated});
    r.updated=Date.now();tickTable(r);
    if(req.method==='GET'&&endpoint==='state'){
      // ?since=<version> waits until the table is newer than the client's copy, or until config.longPollMs passes.
      if(url.searchParams.get('since')!==String(r.version))return send(res,200,tableView(r,t));
      const w={res,code,token:t,since:r.version};w.timer=setTimeout(()=>answer(w),config.longPollMs);
      waiters.add(w);res.on('close',()=>{clearTimeout(w.timer);waiters.delete(w);});return;
    }
    if(req.method!=='POST')return send(res,404,{error:'Unknown action.'});
    if(endpoint==='settings')configure(r,you,data);
    else if(endpoint==='start')startTable(r,you,data);
    else if(endpoint==='move'){
      if(data.version!==r.version)return send(res,409,{error:'The board changed. Try again.'});
      moveTable(r,you,data.action,data.version);
    }
    else if(endpoint==='undo')undoTable(r,you);
    else if(endpoint==='rematch')rematchTable(r,you);
    else if(endpoint==='leave'){
      if(!leaveTable(r,you))rooms.delete(code);
      return send(res,200,{left:true});
    }else return send(res,404,{error:'Unknown action.'});
    return send(res,200,tableView(r,t));
  }
  const requested=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
  const file=path.resolve(root,requested);
  if(!file.startsWith(root+path.sep))return send(res,403,{error:'Forbidden'});
  // no-cache plus an ETag: browsers revalidate each load and get 304 when nothing changed.
  const info=await stat(file),etag=`"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`;
  if(req.headers['if-none-match']===etag){res.writeHead(304,{etag,'cache-control':'no-cache'});return res.end();}
  const bytes=await readFile(file),ext=path.extname(file);
  res.writeHead(200,{etag,'content-type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf','.ogg':'audio/ogg'})[ext]||'application/octet-stream','cache-control':'no-cache'});res.end(bytes);
}catch(e){
  // Errors thrown on purpose by the rules and table code are written for players; Node's own errors are not.
  if(e.code==='ENOENT'||e.code==='EISDIR')return send(res,404,{error:'Not found.'});
  if(e instanceof URIError||e.code==='ERR_INVALID_ARG_VALUE')return send(res,400,{error:'Bad request.'});
  if(e.constructor===Error&&!e.code)return send(res,400,{error:e.message});
  console.error(e);send(res,500,{error:'Something went wrong. Try again.'});
}});
const ticker=setInterval(()=>{tickTables(rooms,Date.now(),config);wake();},200);ticker.unref();
setInterval(()=>{for(const[k,v]of identities)if(Date.now()-v.created>86400000)identities.delete(k);},60000).unref();
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||3007);
  // 0.0.0.0 allows same-network play and container hosts; HOST=127.0.0.1 keeps it on this computer.
  server.listen(port,process.env.HOST||'0.0.0.0',()=>{console.log(`BugTile Rip-off ready: http://127.0.0.1:${port}`);for(const list of Object.values(networkInterfaces()))for(const n of list||[])if(n.family==='IPv4'&&!n.internal)console.log(`Same-network play: http://${n.address}:${port}`);});
}
