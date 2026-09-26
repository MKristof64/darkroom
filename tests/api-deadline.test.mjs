import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

// Fixtures deliberately change only the dedicated local D1 instance, never Sites data.
const [base,persistArg]=process.argv.slice(2),url=new URL(base||'http://invalid');
assert.ok(['127.0.0.1','localhost'].includes(url.hostname)&&url.port==='4178','Use the isolated local server on port 4178');
assert.ok(persistArg&&path.isAbsolute(persistArg),'Pass the absolute isolated --persist-to directory');
const persist=path.resolve(persistArg);
assert.equal(path.basename(persist),'darkroom-security-d1','Refusing to change a database outside the dedicated test instance');
const endpoint=base+'/api/game';
async function post(action,data={},s,expected=200){
 const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(s?{Authorization:'Bearer '+s.token}:{})},body:JSON.stringify({action,...(s?{code:s.code}:{}),...data})});
 const body=await res.json();assert.equal(res.status,expected,JSON.stringify(body));return body;
}
async function get(s,expected=200){
 const res=await fetch(endpoint+'?code='+s.code,{headers:{Authorization:'Bearer '+s.token}});const body=await res.json();assert.equal(res.status,expected,JSON.stringify(body));return body;
}
function fixture(code,assignment){
 assert.match(code,/^\d{6}$/);
 const result=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to',persist,'--command',`UPDATE ov_rooms SET ${assignment}, revision=revision+1 WHERE code='${code}'`],{
  encoding:'utf8',env:{...process.env,SITES_RUNTIME_ROOT:path.join(path.dirname(persist),'darkroom-security-runtime')},
 });
 assert.equal(result.status,0,result.stderr||result.stdout);
}
const created=await post('create',{name:'Óra host'}),h={code:created.state.code,token:created.token,id:created.state.you};
const joined=await post('join',{code:h.code,name:'Óra guest'}),g={code:h.code,token:joined.token,id:joined.state.you};
const round=(await post('start',{},h)).state.round;
const ha=Array(7).fill(round.letter+' host'),ga=Array(7).fill(round.letter+' guest');
await Promise.all([post('answers',{roundId:round.id,answers:ha},h),post('answers',{roundId:round.id,answers:ga},g)]);
assert.equal((await get(g)).round.players.find(p=>p.id===h.id).answers,undefined);
fixture(h.code,"state=json_set(state,'$.rounds[0].deadline',0)");
await post('answers',{roundId:round.id,answers:Array(7).fill(round.letter+' túl késő')},h,400);
const ended=await Promise.all([get(h),get(g)]);
for(const state of ended){
 assert.equal(state.phase,'review');assert.ok(state.round.closed);
 assert.deepEqual(state.round.players.find(p=>p.id===h.id).answers,ha);
 assert.deepEqual(state.round.players.find(p=>p.id===g.id).answers,ga);
 assert.deepEqual(state.round.players.map(p=>p.points),[Array(7).fill(1),Array(7).fill(1)]);
}
await post('score',{roundId:round.id,playerId:g.id,value:91},h);
for(const s of [h,g,h])assert.equal((await get(s)).players.find(p=>p.id===g.id).total,91,'Polling must not re-score a closed round');
await post('answers',{roundId:round.id,answers:ga},g,400);
fixture(h.code,'expires=0');
await get(h,404);await post('score',{roundId:round.id,playerId:g.id,value:1},h,404);
console.log('PASS: real D1 deadline transition; late writes rejected; simultaneous expiry reads converge; persisted drafts scored once; manual corrections survive polls; expired room cannot be read or mutated.');
