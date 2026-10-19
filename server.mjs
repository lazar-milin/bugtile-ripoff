import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {networkInterfaces} from 'node:os';
import {createTable,tableView,joinTable,configure,startTable,moveTable,undoTable,rematchTable,leaveTable,tickTable,tickTables} from './table.mjs';
const root=path.resolve(fileURLToPath(new URL('./public/',import.meta.url)));
const rooms=new Map(),token=()=>randomBytes(18).toString('hex');
const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
export const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){
    let data={};
    if(req.method==='POST'){let body='';for await(const c of req){body+=c;if(body.length>10000)throw Error('Request too large.');}data=JSON.parse(body||'{}');}
    else if(req.method!=='GET')return send(res,405,{error:'Method not allowed.'});
    const endpoint=url.pathname.slice(5);
    if(req.method==='GET'&&endpoint==='tables')return send(res,200,{tables:[...rooms.values()].filter(r=>r.phase==='lobby'&&r.mode==='online'&&r.tokens.filter(Boolean).length===1).map(r=>({code:r.code,name:r.state.names[r.host],players:1}))});
    if(req.method==='POST'&&endpoint==='create'){
      let code;do{code=randomBytes(4).toString('hex').toUpperCase();}while(rooms.has(code));
      const t=token(),r=createTable(code,t,data.name);rooms.set(code,r);return send(res,200,{...tableView(r,t),token:t});
    }
    const code=String(data.code||url.searchParams.get('code')||'').toUpperCase(),r=rooms.get(code);
    if(!r)return send(res,404,{error:'Table not found. It may have closed. Create a table or choose an open one.'});
    const t=req.headers.authorization?.replace('Bearer ',''),you=r.tokens.indexOf(t);
    if(req.method==='POST'&&endpoint==='join'){
      if(you>=0)return send(res,200,tableView(r,t));
      const next=token();joinTable(r,next,data.name);return send(res,200,{...tableView(r,next),token:next});
    }
    if(you<0)return send(res,403,{error:'Your seat is no longer at this table. Join again from the entrance.'});
    r.updated=Date.now();tickTable(r);
    if(req.method==='GET'&&endpoint==='state')return send(res,200,tableView(r,t));
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
  const bytes=await readFile(file),ext=path.extname(file);
  res.writeHead(200,{'content-type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf','.ogg':'audio/ogg'})[ext]||'application/octet-stream','cache-control':'no-cache'});res.end(bytes);
}catch(e){send(res,e.code==='ENOENT'?404:400,{error:e.code==='ENOENT'?'File not found':e.message});}});
const ticker=setInterval(()=>tickTables(rooms),200);ticker.unref();
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||3007);
  server.listen(port,'0.0.0.0',()=>{console.log(`BugTile Rip-off ready: http://127.0.0.1:${port}`);for(const list of Object.values(networkInterfaces()))for(const n of list||[])if(n.family==='IPv4'&&!n.internal)console.log(`Same-network play: http://${n.address}:${port}`);});
}
