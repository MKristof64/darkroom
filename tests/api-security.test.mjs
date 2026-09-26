import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';

// This runner creates only disposable rooms. Pass an isolated Wrangler/D1 origin.
const base=process.argv[2];
if(!base)throw new Error('Usage: node tests/api-security.test.mjs http://127.0.0.1:4178');
const endpoint=base+'/api/game';
async function request(method,body,session,extra={}){
 const res=await fetch(endpoint+(method==='GET'?'?code='+session.code:''),{
  method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(session?{Authorization:'Bearer '+session.token}:{}),...extra},
  ...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{}),
 });
 const raw=await res.text();let json=null;try{json=raw?JSON.parse(raw):null;}catch{json={error:raw};}return {res,json};
}
async function post(action,data={},session,expected=200,headers={}){
 const result=await request('POST',{action,...(session?{code:session.code}:{}),...data},session,headers);
 assert.equal(result.res.status,expected,JSON.stringify(result.json));return result.json;
}
async function get(session,expected=200,headers={}){
 const result=await request('GET',undefined,session,headers);assert.equal(result.res.status,expected,JSON.stringify(result.json));return result.json;
}
function session(created){return {code:created.state.code,token:created.token,id:created.state.you};}
const host=session(await post('create',{name:'Biztonsági host'}));
const guest=session(await post('join',{code:host.code,name:'Biztonsági guest'}));
for(const origin of ['https://localhost','https://mkristof64.github.io',new URL(base).origin,...(['localhost','127.0.0.1'].includes(new URL(base).hostname)?['http://127.0.0.1:4176','http://localhost:4176']:[])]){
 const preflight=await request('OPTIONS',undefined,undefined,{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'});
 assert.equal(preflight.res.status,204);assert.equal(preflight.res.headers.get('Access-Control-Allow-Origin'),origin);
 assert.match(preflight.res.headers.get('Access-Control-Allow-Headers'),/Authorization/);
 const read=await request('GET',undefined,host,{Origin:origin});assert.equal(read.res.status,200);assert.equal(read.res.headers.get('Access-Control-Allow-Origin'),origin);
 const denied=await request('POST',{action:'start',code:host.code},guest,{Origin:origin});assert.equal(denied.res.status,403);assert.equal(denied.res.headers.get('Access-Control-Allow-Origin'),origin);
 assert.match(read.res.headers.get('Vary'),/Origin/);assert.equal(read.res.headers.get('Cache-Control'),'no-store');
}
for(const origin of ['https://localhost.evil.example','http://localhost','https://mkristof64.github.io.evil.example','https://untrusted.example','null']){
 for(const method of ['GET','POST','OPTIONS']){
  const denied=await request(method,method==='POST'?{action:'create',name:'Forbidden'}:undefined,host,{Origin:origin});
  assert.equal(denied.res.status,403,method+' '+origin);assert.equal(denied.res.headers.get('Access-Control-Allow-Origin'),null);
 }
}
for(const body of ['{','null','[]','{}','{"action":123}'])assert.equal((await request('POST',body)).res.status,400);
// Wrangler's local proxy can invalidate its upstream connection after an early rejection.
// A read between oversized cases lets that proxy re-establish it (GET is retried by Wrangler).
async function rejectedBody(chunks,headers={}){
 return new Promise((resolve,reject)=>{
  const transport=new URL(endpoint).protocol==='https:'?https:http;
  const req=transport.request(endpoint,{method:'POST',agent:false,headers:{'Content-Type':'application/json',...headers}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
  req.on('error',reject);for(const chunk of chunks)req.write(chunk);req.end();
 });
}
const utf8=Buffer.from(JSON.stringify({action:'create',name:'é'.repeat(5000)}));
assert.equal(await rejectedBody([utf8],{'Content-Length':utf8.byteLength}),413,'Limit must count UTF-8 bytes, not JS characters');
await get(host);
assert.equal(await rejectedBody([Buffer.from('{"action":"create","name":"'),Buffer.alloc(9000,65)]),413,'Chunked body without declared length must be bounded');
await get(host);
await get({...host,token:'forged'},401);
for(const authorization of ['', 'Basic '+host.token, 'Bearer '+ 'x'.repeat(257)]){
 const denied=await fetch(endpoint+'?code='+host.code,{headers:{Authorization:authorization}});assert.equal(denied.status,401);
}
for(const action of ['start','stop','score','kick','settings','finish'])await post(action,{playerId:host.id,seconds:90,value:99},guest,403);
await post('kick',{playerId:host.id},host,400);
const started=(await post('start',{},host)).state;
const round=started.round,answers=Array(7).fill(round.letter+' saját');
await post('answers',{roundId:round.id,answers,answerRevision:20,playerId:guest.id},host);
for(const answerRevision of [19,20])await post('answers',{roundId:round.id,answers:Array(7).fill('stale'),answerRevision},host,409);
const fresh=Array(7).fill(round.letter+' frissebb');
const revisions=await Promise.all([21,22].map(answerRevision=>request('POST',{action:'answers',code:host.code,roundId:round.id,answers:answerRevision===22?fresh:answers,answerRevision},host)));
assert.equal(revisions[1].res.status,200);assert.ok([200,409].includes(revisions[0].res.status));
const own=(await get(host)).round.players.find(p=>p.id===host.id);assert.equal(own.answerRevision,22);assert.deepEqual(own.answers,fresh);
const concealed=await get(guest);const hidden=concealed.round.players.find(p=>p.id===host.id);
assert.deepEqual(Object.keys(hidden).sort(),['id','name','submitted']);assert.ok(!JSON.stringify(concealed).includes(host.token));
await post('submit',{roundId:round.id,answers:fresh,answerRevision:23},host);
await post('answers',{roundId:round.id,answers,answerRevision:24},host,400);
await post('leave',{},host);await get(host,410);
const ended=await get(guest);assert.equal(ended.phase,'finished');assert.ok(ended.round.closed);
assert.deepEqual(ended.round.players.find(p=>p.id===host.id).points,Array(7).fill(1));
const departedHost=ended.players.find(p=>p.id===host.id);
assert.equal(departedHost.total,7);assert.equal(departedHost.departed,true);
await post('start',{},guest,403);await post('join',{code:host.code,name:'Too late'},undefined,400);

// A CAS retry must preserve every player's separate draft and enforce the cap atomically.
const crowd=session(await post('create',{name:'Párhuzamos host'}));
async function contestedJoin(i){
 for(let retry=0;retry<4;retry++){
  const result=await request('POST',{action:'join',code:crowd.code,name:'Párhuzamos '+i});
  if(result.res.status===409)continue;
  assert.ok([200,400].includes(result.res.status),JSON.stringify(result.json));return result;
 }
 throw new Error('CAS join did not settle');
}
const joins=await Promise.all(Array.from({length:22},(_,i)=>contestedJoin(i)));
const members=joins.filter(r=>r.res.status===200).map(r=>session(r.json));
assert.equal(members.length,19);assert.equal(joins.filter(r=>r.res.status===400).length,3);assert.equal((await get(crowd)).players.length,20);
const crowdRound=(await post('start',{},crowd)).state.round;
async function contestedSave(member,i){
 const words=Array(7).fill(crowdRound.letter+' játékos '+i);
 for(let retry=0;retry<4;retry++){
  const result=await request('POST',{action:'answers',code:crowd.code,roundId:crowdRound.id,answers:words,answerRevision:1},member);
  if(result.res.status===409)continue;
  assert.equal(result.res.status,200,JSON.stringify(result.json));return words;
 }
 throw new Error('CAS save did not settle');
}
const crowdMembers=[crowd,...members],drafts=await Promise.all(crowdMembers.map(contestedSave));
await post('stop',{roundId:crowdRound.id},crowd);
const crowdReview=await get(crowd);
for(let i=0;i<crowdMembers.length;i++)assert.deepEqual(crowdReview.round.players.find(p=>p.id===crowdMembers[i].id).answers,drafts[i]);
await post('score',{roundId:crowdRound.id,playerId:members[0].id,value:37},crowd);
await post('kick',{playerId:members[0].id},crowd);await get(members[0],410);await post('answers',{roundId:crowdRound.id,answers},members[0],410);
await post('start',{},crowd);await post('answers',{roundId:crowdRound.id,answers},crowd,400);
await post('leave',{},crowd);assert.equal((await get(members[1])).phase,'finished');

// Invalid create attempts also consume the anonymous budget, without creating rooms.
let limited=false;
for(let i=0;i<21;i++){
 const result=await request('POST',{action:'create',name:''},undefined,{'CF-Connecting-IP':'198.51.100.77'});
 assert.ok([400,429].includes(result.res.status));if(result.res.status===429){limited=true;break;}
}
assert.ok(limited,'Anonymous creation must have a persistent request budget');
// A valid token also has a persistent write budget; commands that fail rules still count.
limited=false;
for(let i=0;i<241;i++){
 const result=await request('POST',{action:'unknown',code:guest.code},guest);
 assert.ok([400,429].includes(result.res.status));if(result.res.status===429){limited=true;break;}
}
assert.ok(limited,'Authenticated writes must be rate limited');
console.log('PASS: exact Android/GitHub CORS including errors/preflight; rejected lookalike origins; bounded UTF-8/chunked bodies; malformed JSON; bearer auth; host permissions; own identity; private peer answers/revisions; late draft protection; locked submit; atomic host exit; 20-player join race; simultaneous CAS draft preservation; removed-token revocation; stale rounds; anonymous/authenticated persistent write limits.');
