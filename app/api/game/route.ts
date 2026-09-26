import { env } from 'cloudflare:workers';
import { apply, expire, view, makeRoom, makeCode, GameError } from '../../../lib/game.mjs';
export const dynamic = 'force-dynamic';
const response=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function hash(token:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function nameOf(input:any){const name=typeof input==='string'?input.trim():'';if(!name||name.length>24)throw new GameError('Adj meg egy 1–24 karakteres becenevet.');return name;}
function db(){if(!env.DB)throw new GameError('A játék most nem elérhető. Próbáld újra kicsit később.',503);return env.DB;}
async function load(code:string){if(!/^\d{6}$/.test(code))throw new GameError('Hatjegyű szobakódot írj be.');const row:any=await db().prepare('SELECT state,revision,expires FROM ov_rooms WHERE code = ?').bind(code).first();if(!row||row.expires<Date.now())throw new GameError('Nincs ilyen szoba, vagy lejárt. Kérj új kódot.',404);return row;}
async function mutate(code:string,fn:(state:any)=>any){for(let attempt=0;attempt<8;attempt++){const row=await load(code);const state=JSON.parse(row.state);const result=fn(state);const saved=await db().prepare('UPDATE ov_rooms SET state = ?, revision = revision + 1 WHERE code = ? AND revision = ?').bind(JSON.stringify(state),code,row.revision).run();if(saved.meta.changes===1)return result;if(attempt<7)await new Promise(r=>setTimeout(r,10+Math.random()*40));}throw new GameError('Sokan írtok egyszerre. Próbáld újra.',409);}
function member(s:any,h:string){const p=s.players.find((p:any)=>p.hash===h);if(!p)throw new GameError('Lépj be újra a szobába.',401);if(p.removed)throw new GameError('Eltávolítottak a szobából.',410);return p;}
export async function GET(request:Request){try{const url=new URL(request.url),code=url.searchParams.get('code')||'',token=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';const h=await hash(token);const row=await load(code);const s=JSON.parse(row.state);const p=member(s,h);if(expire(s))return response(await mutate(code,s=>{const p=member(s,h);expire(s);return view(s,p);}));return response(view(s,p));}catch(e:any){return response({error:e instanceof GameError?e.message:'Nem sikerült betölteni a szobát.'},e.status||500);}}
export async function POST(request:Request){try{
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)throw new GameError('Érvénytelen kérés.',403);
 const raw=await request.text();if(raw.length>6000)throw new GameError('Túl hosszú kérés.');const body=JSON.parse(raw);
 if(body.action==='create'){
  const name=nameOf(body.name),id=crypto.randomUUID(),token=crypto.randomUUID()+crypto.randomUUID(),h=await hash(token);
  for(let i=0;i<10;i++){const code=makeCode(),s=makeRoom(code,id,name,h);const created=await db().prepare('INSERT OR IGNORE INTO ov_rooms (code,state,revision,expires) VALUES (?,?,0,?)').bind(code,JSON.stringify(s),Date.now()+86400000).run();if(created.meta.changes===1)return response({token,state:view(s,s.players[0])});}throw new GameError('Nem sikerült szobát létrehozni. Próbáld újra.',503);
 }
 const code=String(body.code||'');
 if(body.action==='join'){
  const name=nameOf(body.name),id=crypto.randomUUID(),token=crypto.randomUUID()+crypto.randomUUID(),h=await hash(token);
  return response(await mutate(code,s=>{expire(s);if(!['lobby','review'].includes(s.phase))throw new GameError(s.phase==='finished'?'Ez a játék már véget ért.':'Épp folyik a kör. A kör végén tudsz csatlakozni.');if(s.players.filter((p:any)=>!p.removed).length>=20)throw new GameError('A szoba megtelt (20 játékos).');if(s.players.some((p:any)=>!p.removed&&p.name.toLocaleLowerCase('hu')===name.toLocaleLowerCase('hu')))throw new GameError('Ez a becenév már foglalt.');if(s.players.length>=100)throw new GameError('Ez a szoba túl sok belépést fogadott. Készítsetek újat.');const p={id,name,hash:h,removed:false};s.players.push(p);return {token,state:view(s,p)};}));
 }
 const h=await hash(request.headers.get('Authorization')?.replace(/^Bearer /,'')||'');
 return response(await mutate(code,s=>{const p=member(s,h);expire(s);apply(s,p,body.action,body);return {state:view(s,p)};}));
 }catch(e:any){if(!(e instanceof GameError))console.error('game request failed',e);return response({error:e instanceof GameError?e.message:'Nem sikerült menteni. Próbáld újra.'},e.status||500);}}
