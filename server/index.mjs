import http from 'node:http';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile,realpath,stat} from 'node:fs/promises';
import {extname,join,resolve,sep} from 'node:path';
import {adminRead,adminWrite} from './admin.mjs';
import {date,num,problem,reserve,rows} from './database.mjs';

const password=process.env.HABIB_ADMIN_PASSWORD;
if (!process.env.TATNET_API_KEY || !password || password.length<16) throw Error('Configure TATNET_API_KEY and HABIB_ADMIN_PASSWORD (at least 16 characters)');
const passwordHash=createHash('sha256').update(password).digest();
const port=Number(process.env.PORT||8080);
const host=process.env.HOST||'127.0.0.1';
const webRoot=await realpath(process.env.STATIC_DIR||resolve('dist'));
const sessions=new Map(), limits=new Map();
const prune=setInterval(()=>{
  for (const [key,expires] of sessions) if (expires<=Date.now()) sessions.delete(key);
  for (const [key,item] of limits) if (item.until<=Date.now()) limits.delete(key);
},60000);
prune.unref();
function limit(key,max,windowMs) {
  let item=limits.get(key);
  if (!item || item.until<=Date.now()) {
    item={count:0,until:Date.now()+windowMs}; limits.set(key,item);
  }
  if (++item.count>max) throw problem(429,'too_many_requests');
}
const mime={'.xml':'application/xml','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.jpg':'image/jpeg','.webp':'image/webp','.png':'image/png','.txt':'text/plain'};
async function staticFile(url,res) {
  const parts=decodeURIComponent(url.pathname).split('/').filter(Boolean);
  if(parts.some(p=>p.startsWith('.')||p.includes('\\'))) throw problem(404,'not_found');
  let file=join(webRoot,...parts);
  try {
    if((await stat(file)).isDirectory()) {
      if(!url.pathname.endsWith('/')) {
        res.writeHead(308,{Location:url.pathname.replace(/^\/+/, '/')+'/'+url.search});return res.end();
      }
      file=join(file,'index.html');
    }
    file=await realpath(file);
    if(!file.startsWith(webRoot+sep) || !mime[extname(file)]) throw Error();
  } catch { throw problem(404,'not_found'); }
  res.setHeader('Content-Type',mime[extname(file)]);
  res.end(await readFile(file));
}
async function payload(req) {
  if(req.headers['content-type']?.split(';')[0]!=='application/json') throw problem(415,'expected_json');
  let bytes=0; const chunks=[];
  for await (const chunk of req) {bytes+=chunk.length;if(bytes>8192)throw problem(413,'too_large');chunks.push(chunk);}
  try {
    const data=JSON.parse(Buffer.concat(chunks).toString());
    if (!data || Array.isArray(data) || typeof data!=='object') throw Error();
    return data;
  } catch { throw problem(400,'invalid_json'); }
}
const sessionKey=req=> (req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('habib_sid='))?.slice(10);
const cache=new Map();
async function cached(key,ttl,fn) {
  const hit=cache.get(key);
  if (hit && hit.until>Date.now()) return hit.value;
  const value=fn();
  cache.set(key,{until:Date.now()+ttl,value});
  if(cache.size>300) cache.delete(cache.keys().next().value);
  try{return await value;}catch(error){cache.delete(key);throw error;}
}
const server=http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('X-Frame-Options','DENY');
  if (!url.pathname.startsWith('/api/')) {
    if(!['GET','HEAD'].includes(req.method)) throw problem(405,'method_not_allowed');
    return await staticFile(url,res);
  }
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  const path=url.pathname.slice(4);
  const publicPath=['/services','/reserve','/slots'].includes(path);
  const origin=req.headers.origin;
  const localHost=/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host||'');
  const expected=process.env.APP_ORIGIN || ((localHost?'http://':'https://')+req.headers.host);
  const allowed= !origin || origin===expected || (publicPath && origin===process.env.ALLOWED_ORIGIN);
  if(!allowed) throw problem(403,'invalid_origin');
  if(origin) {
    res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
    if(!publicPath)res.setHeader('Access-Control-Allow-Credentials','true');
  }
  if(req.method==='OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods','GET, POST');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.writeHead(204);return res.end();
  }
  // Trust the last proxy-provided hop only when this port is reachable exclusively through that proxy.
  const ip=(process.env.TRUST_PROXY==='1' && String(req.headers['x-forwarded-for']||'').split(',').at(-1).trim()) || req.socket.remoteAddress;
  limit('all:'+ip,200,60000);
  let result;
  const token=sessionKey(req);
  const cookie=(value,age)=>'habib_sid='+value+'; Path=/api; HttpOnly; SameSite=Strict; Max-Age='+age+(localHost?'':'; Secure');
  if(path==='/login' && req.method==='POST') {
    limit('login:'+ip,10,900000);
    const b=await payload(req);
    if(typeof b.password!=='string' || !timingSafeEqual(passwordHash,createHash('sha256').update(b.password).digest())) throw problem(401,'unauthorized');
    const key=randomBytes(32).toString('hex');
    sessions.delete(token); sessions.set(key,Date.now()+8*3600000);
    res.setHeader('Set-Cookie',cookie(key,28800)); result={ok:true};
  } else if(path==='/logout' && req.method==='POST') {
    await payload(req); sessions.delete(token);res.setHeader('Set-Cookie',cookie('',0));result={ok:true};
  } else if(path.startsWith('/admin/')) {
    if(!(sessions.get(token)>Date.now())) throw problem(401,'unauthorized');
    if(req.method==='GET')result=await adminRead(path,url.searchParams);
    else if(req.method==='POST'){result=await adminWrite(path,await payload(req));cache.clear();}
    else throw problem(405,'method_not_allowed');
  } else if(path==='/services' && req.method==='GET') {
    result=await cached('services',10000,()=>rows('select * from habib.services where active order by id'));
  } else if(path==='/slots' && req.method==='GET') {
    const service=num(url.searchParams.get('service')), day=date(url.searchParams.get('day'));
    result=await cached(service+day,1500,()=>rows(`select * from habib.slots(${service},${day})`));
  } else if(path==='/reserve' && req.method==='POST') {
    limit('book:'+ip,8,600000);result=await reserve(await payload(req),false);cache.clear();
  } else throw problem(404,'not_found');
  res.end(JSON.stringify(result));
 } catch(error) {
   res.writeHead(error.status||500,{'Content-Type':'application/json','Cache-Control':'no-store'});
   res.end(JSON.stringify({error:error.status ? error.message : 'internal_error'}));
 }
});
server.requestTimeout=35000; server.headersTimeout=15000;
server.listen(port,host,()=>console.log('HABIB server listening on '+host+':'+port));
