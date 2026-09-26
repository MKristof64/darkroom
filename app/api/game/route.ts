import { env } from 'cloudflare:workers';
import { apply, expire, view, makeRoom, makeCode, GameError } from '../../../lib/game.mjs';
export const dynamic = 'force-dynamic';
function allowedOrigin(request:Request){
 const origin=request.headers.get('Origin');if(!origin)return null;
 if(origin===new URL(request.url).origin||origin==='https://mkristof64.github.io'||origin==='https://localhost')return origin;
 const localHost=['localhost','127.0.0.1'].includes(new URL(request.url).hostname);
 if(localHost&&['http://localhost:5174','http://127.0.0.1:5174','http://localhost:4173','http://127.0.0.1:4173','http://localhost:4176','http://127.0.0.1:4176'].includes(origin))return origin;
 return null;
}
function cors(request?:Request){const origin=request&&allowedOrigin(request);return {'Cache-Control':'no-store','Vary':'Origin',...(origin?{'Access-Control-Allow-Origin':origin}:{})};}
const response=(data:any,status=200,request?:Request)=>Response.json(data,{status,headers:cors(request)});
export function OPTIONS(request:Request){if(request.headers.get('Origin')&&!allowedOrigin(request))return new Response(null,{status:403,headers:cors(request)});return new Response(null,{status:204,headers:{...cors(request),'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Max-Age':'3600'}});}
async function hash(token:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function requestOrigin(request:Request){if(request.headers.get('Origin')&&!allowedOrigin(request))throw new GameError('Érvénytelen kérés.',403);}
function tokenOf(request:Request){
 const value=request.headers.get('Authorization')||'';
 if(!/^Bearer [\w-]{1,256}$/.test(value))throw new GameError('Lépj be újra a szobába.',401);
 return value.slice(7);
}
async function bodyOf(request:Request){
 const limit=8192, declared=request.headers.get('Content-Length');
 if(declared&&Number(declared)>limit){await request.body?.cancel();throw new GameError('Túl hosszú kérés.',413);}
 const reader=request.body?.getReader();if(!reader)throw new GameError('Érvénytelen kérés.');
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw new GameError('Túl hosszú kérés.',413);chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 let body:any;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new GameError('Érvénytelen JSON kérés.');}
 if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.action!=='string')throw new GameError('Érvénytelen kérés.');
 return body;
}
function nameOf(input:any){const name=typeof input==='string'?input.trim():'';if(!name||name.length>24)throw new GameError('Adj meg egy 1–24 karakteres becenevet.');return name;}
function db(){if(!env.DB)throw new GameError('A játék most nem elérhető. Próbáld újra kicsit később.',503);return env.DB;}
let schemaReady:Promise<void>|undefined;
async function initializeDatabase(){
 // A locally packaged deployment can bind a new database before migrations run.
 // This creates only the initial table; existing rooms and scores stay intact.
 schemaReady??=db().batch([
  db().prepare('CREATE TABLE IF NOT EXISTS ov_rooms (code TEXT PRIMARY KEY NOT NULL, state TEXT NOT NULL, revision INTEGER DEFAULT 0 NOT NULL, expires INTEGER NOT NULL)'),
  db().prepare('CREATE TABLE IF NOT EXISTS ov_request_limits (bucket TEXT PRIMARY KEY NOT NULL, window INTEGER NOT NULL, hits INTEGER NOT NULL, expires INTEGER NOT NULL)'),
 ]).then(()=>{}).catch(error=>{schemaReady=undefined;throw error;});
 await schemaReady;
}
async function load(code:string){if(!/^\d{6}$/.test(code))throw new GameError('Hatjegyű szobakódot írj be.');const row:any=await db().prepare('SELECT state,revision,expires FROM ov_rooms WHERE code = ?').bind(code).first();if(!row||row.expires<=Date.now())throw new GameError('Nincs ilyen szoba, vagy lejárt. Kérj új kódot.',404);return row;}
async function mutate(code:string,fn:(state:any)=>any){for(let attempt=0;attempt<8;attempt++){const row=await load(code);const state=JSON.parse(row.state);const result=fn(state);const saved=await db().prepare('UPDATE ov_rooms SET state = ?, revision = revision + 1 WHERE code = ? AND revision = ? AND expires = ? AND expires > ?').bind(JSON.stringify(state),code,row.revision,row.expires,Date.now()).run();if(saved.meta.changes===1)return result;if(attempt<7)await new Promise(r=>setTimeout(r,10+Math.random()*40));}throw new GameError('Sokan írtok egyszerre. Próbáld újra.',409);}
let lastRateCleanup=0;
async function writeLimit(bucket:string,limit:number){
 const now=Date.now();
 const row:any=await db().prepare('INSERT INTO ov_request_limits (bucket,window,hits,expires) VALUES (?,?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits = CASE WHEN ov_request_limits.expires > excluded.window THEN ov_request_limits.hits + 1 ELSE 1 END, window = CASE WHEN ov_request_limits.expires > excluded.window THEN ov_request_limits.window ELSE excluded.window END, expires = CASE WHEN ov_request_limits.expires > excluded.window THEN ov_request_limits.expires ELSE excluded.expires END WHERE ov_request_limits.expires <= excluded.window OR ov_request_limits.hits < ? RETURNING hits').bind(bucket,now,now+60000,limit).first();
 if(now-lastRateCleanup>60000){lastRateCleanup=now;await db().prepare('DELETE FROM ov_request_limits WHERE expires < ?').bind(now).run();}
 if(!row||row.hits>limit)throw new GameError('Túl sok kérés. Várj egy percet, majd próbáld újra.',429);
}
// Polling has a lightweight per-isolate guard; it does not add a D1 write on every poll.
const readLimits=new Map<string,{window:number,hits:number}>();
function readLimit(bucket:string){
 const window=Math.floor(Date.now()/60000),old=readLimits.get(bucket),entry=old?.window===window?old:{window,hits:0};
 if(readLimits.size>=10000)for(const [key,value] of readLimits)if(value.window!==window)readLimits.delete(key);
 if(readLimits.size>=10000&&!readLimits.has(bucket))throw new GameError('Túl sok kérés. Próbáld újra később.',429);
 readLimits.set(bucket,entry);if(++entry.hits>240)throw new GameError('Túl sok kérés. Várj egy percet, majd próbáld újra.',429);
}
function member(s:any,h:string){const p=s.players.find((p:any)=>p.hash===h);if(!p)throw new GameError('Lépj be újra a szobába.',401);if(p.removed)throw new GameError('Eltávolítottak a szobából.',410);return p;}
export async function GET(request:Request){const reply=(data:any,status=200)=>response(data,status,request);try{requestOrigin(request);const token=tokenOf(request);await initializeDatabase();const url=new URL(request.url),code=url.searchParams.get('code')||'';const h=await hash(token);const row=await load(code);const s=JSON.parse(row.state);const p=member(s,h);readLimit(h);if(expire(s))return reply(await mutate(code,s=>{const p=member(s,h);expire(s);return view(s,p);}));return reply(view(s,p));}catch(e:any){return reply({error:e instanceof GameError?e.message:'Nem sikerült betölteni a szobát.'},e instanceof GameError?e.status:500);}}
export async function POST(request:Request){const reply=(data:any,status=200)=>response(data,status,request);try{
 // Consume/cancel the bounded body even on origin rejection, so keep-alive requests are not disrupted.
 const body=await bodyOf(request);requestOrigin(request);await initializeDatabase();
 const ip=request.headers.get('CF-Connecting-IP');
 if(ip&&(body.action==='create'||body.action==='join'))await writeLimit('anonymous:'+body.action+':'+await hash(ip),body.action==='create'?20:100);
 if(body.action==='create'){
  const name=nameOf(body.name),id=crypto.randomUUID(),token=crypto.randomUUID()+crypto.randomUUID(),h=await hash(token);
  for(let i=0;i<10;i++){const now=Date.now(),code=makeCode(),s=makeRoom(code,id,name,h);const created=await db().prepare('INSERT INTO ov_rooms (code,state,revision,expires) VALUES (?,?,0,?) ON CONFLICT(code) DO UPDATE SET state = excluded.state, revision = ov_rooms.revision + 1, expires = excluded.expires WHERE ov_rooms.expires <= ?').bind(code,JSON.stringify(s),now+86400000,now).run();if(created.meta.changes===1)return reply({token,state:view(s,s.players[0])});}throw new GameError('Nem sikerült szobát létrehozni. Próbáld újra.',503);
 }
 const code=String(body.code||'');
 if(body.action==='join'){
  const name=nameOf(body.name),id=crypto.randomUUID(),token=crypto.randomUUID()+crypto.randomUUID(),h=await hash(token);
  return reply(await mutate(code,s=>{expire(s);if(!['lobby','review'].includes(s.phase))throw new GameError(s.phase==='finished'?'Ez a játék már véget ért.':'Épp folyik a kör. A kör végén tudsz csatlakozni.');if(s.players.filter((p:any)=>!p.removed).length>=20)throw new GameError('A szoba megtelt (20 játékos).');if(s.players.some((p:any)=>!p.removed&&p.name.toLocaleLowerCase('hu')===name.toLocaleLowerCase('hu')))throw new GameError('Ez a becenév már foglalt.');if(s.players.length>=100)throw new GameError('Ez a szoba túl sok belépést fogadott. Készítsetek újat.');const p={id,name,hash:h,removed:false};s.players.push(p);return {token,state:view(s,p)};}));
 }
 const h=await hash(tokenOf(request));
 // Verify before allocating a persistent limit bucket; forged tokens must not grow this table.
 member(JSON.parse((await load(code)).state),h);await writeLimit('member:'+h,240);
 return reply(await mutate(code,s=>{const p=member(s,h);expire(s);apply(s,p,body.action,body);return {state:view(s,p)};}));
 }catch(e:any){if(!(e instanceof GameError))console.error('game request failed',e);return reply({error:e instanceof GameError?e.message:'Nem sikerült menteni. Próbáld újra.'},e instanceof GameError?e.status:500);}}
