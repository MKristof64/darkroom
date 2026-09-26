import assert from 'node:assert/strict';
import { TOPICS, LETTERS, makeRoom, apply, view, expire, totalFor, makeCode, scoreRound } from '../lib/game.mjs';

// Score through the round calculation so validity affects actual awarded points.
function scoreAnswer(answer,letter='A') {
 const round={letter,topics:TOPICS.slice(0,7),players:[{id:'one',answers:[answer,...Array(6).fill('')]}]};
 scoreRound(round);
 return round.players[0].points[0];
}
for(const answer of ['', 'A', 'Á', 'Ar', 'Ár', 'A12', 'A!?', 'A r 2 !', 'A\u0301r\u0301', 'Aß', 'A𐐀']) {
 assert.equal(scoreAnswer(answer),0,`Fewer than three Unicode letters must score zero: ${JSON.stringify(answer)}`);
}
for(const answer of ['Agy', 'Ágy', 'A\u0301gy', '  áGY  ', 'AβЖ', 'A𐐀β', 'A 1 r ! t']) {
 assert.equal(scoreAnswer(answer),1,`Three actual Unicode letters must qualify: ${JSON.stringify(answer)}`);
}
for(const answer of ['Béla', '!Alma', '123Alma']) {
 assert.equal(scoreAnswer(answer),0,`The initial letter must still match: ${JSON.stringify(answer)}`);
}
const normalizedDuplicates={letter:'A',topics:TOPICS.slice(0,7),players:[
 {id:'first',answers:['Ágy','A  saját',...Array(5).fill('')]},
 {id:'second',answers:[' aGY ',' a saját ',...Array(5).fill('')]},
 {id:'third',answers:['Alma','A harmadik',...Array(5).fill('')]},
]};
scoreRound(normalizedDuplicates);
assert.deepEqual(normalizedDuplicates.players.map(p=>p.points.slice(0,2)),[[0,0],[0,0],[1,1]]);
const s=makeRoom('123456','host','Házigazda','private-host');
s.players.push({id:'guest',name:'Vendég',hash:'private-guest',removed:false});
const host=s.players[0], guest=s.players[1];
for(let i=0;i<2000;i++)assert.match(makeCode(),/^\d{6}$/);
assert.equal(TOPICS.length,26);
assert.throws(()=>apply(s,guest,'start'),/házigazda/);
apply(s,host,'start');
assert.equal(s.rounds[0].topics.length,7);assert.equal(new Set(s.rounds[0].topics).size,7);
let r=s.rounds.at(-1);r.letter='A';
apply(s,host,'answers',{roundId:r.id,answers:['Alma','Alfa','','Béla','Ágy','A saját','A hatodik']});
apply(s,guest,'answers',{roundId:r.id,answers:['aLMA','A másik','','','aGy','A vendég','']});
const concealed=view(s,guest);assert.equal(concealed.round.players[0].answers,undefined);assert.equal(JSON.stringify(concealed).includes('private-host'),false);
apply(s,host,'submit',{roundId:r.id,answers:r.players[0].answers});
assert.throws(()=>apply(s,host,'answers',{roundId:r.id,answers:Array(7).fill('Alma')}),/beküldted/);
apply(s,guest,'submit',{roundId:r.id,answers:r.players[1].answers});
assert.equal(s.phase,'review');assert.deepEqual(r.players[0].points,[0,1,0,0,0,1,1]);assert.deepEqual(r.players[1].points,[0,1,0,0,0,1,0]);
assert.throws(()=>apply(s,guest,'score',{roundId:r.id,playerId:'guest',value:80}),/házigazda/);
apply(s,host,'score',{roundId:r.id,playerId:'guest',value:23});assert.equal(totalFor(s,'guest'),23);
apply(s,host,'score',{roundId:r.id,playerId:'guest',index:0,value:4});assert.equal(totalFor(s,'guest'),27);
apply(s,host,'kick',{playerId:'guest'});assert.equal(guest.removed,true);
apply(s,host,'start');assert.equal(s.rounds.at(-1).players.length,1);
assert.throws(()=>apply(s,host,'answers',{roundId:r.id,answers:Array(7).fill('')}),/lezárult/);
assert.equal(expire(s,s.rounds.at(-1).deadline+1),true);assert.equal(s.phase,'review');
const deck=makeRoom('222222','h','H','x');for(let i=0;i<LETTERS.length;i++){apply(deck,deck.players[0],'start');apply(deck,deck.players[0],'stop',{roundId:deck.rounds.at(-1).id});}assert.equal(new Set(deck.rounds.map(r=>r.letter)).size,LETTERS.length);apply(deck,deck.players[0],'start');assert.equal(deck.usedLetters.length,1);
console.log('PASS: minimum three Unicode letters; accents and supplementary letters; numbers/punctuation cannot bypass minimum; normalized duplicates; 6-digit codes; 7 distinct topics; nonrepeating letter deck; hidden answers; 1/0 scoring; locked submissions; host permissions; score edits; kick; stale rounds; timeout.');
if(!process.argv[2])process.exit(0);
const base=process.argv[2];
async function api(action,data={},session,expected=200){const res=await fetch(base+'/api/game',{method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.token}:{})},body:JSON.stringify({action,...(session?{code:session.code}:{}),...data})});const json=await res.json();assert.equal(res.status,expected,JSON.stringify(json));return json;}
async function get(session,expected=200){const res=await fetch(base+'/api/game?code='+session.code,{headers:{Authorization:'Bearer '+session.token}});const json=await res.json();assert.equal(res.status,expected,JSON.stringify(json));return json;}
const created=await api('create',{name:'Teszt házigazda'});const h={code:created.state.code,token:created.token};assert.match(h.code,/^\d{6}$/);
const join=await Promise.all([api('join',{code:h.code,name:'Teszt Anna'}),api('join',{code:h.code,name:'Teszt Bálint'})]);
const a={code:h.code,token:join[0].token},b={code:h.code,token:join[1].token};const ai=join[0].state.you,bi=join[1].state.you;
assert.equal((await get(h)).players.length,3);await api('start',{},a,403);await api('settings',{seconds:60},h);
let started=await api('start',{},h);const rr=started.state.round;assert.equal(rr.topics.length,7);assert.equal(new Set(rr.topics).size,7);
await api('join',{code:h.code,name:'Későn érkező'},undefined,400);
const ha=[rr.letter+' teszt',rr.letter+' saját','','X rossz',rr.letter,rr.letter+'12 !',rr.letter+'ár'];
const aa=[rr.letter.toLowerCase()+' TESZT',rr.letter+' Anna','','',rr.letter+'a',rr.letter+'a123 !',rr.letter.toLowerCase()+'AR'];
const ba=[rr.letter+' Bálint','','','',rr.letter+'ab',rr.letter+'a-b',''];
await Promise.all([api('answers',{roundId:rr.id,answers:ha},h),api('answers',{roundId:rr.id,answers:aa},a),api('answers',{roundId:rr.id,answers:ba},b)]);
const av=await get(a);assert.equal(av.round.players.find(p=>p.id===created.state.you).answers,undefined);assert.deepEqual(av.round.players.find(p=>p.id===ai).answers,aa.map(x=>x.trim()));
await Promise.all([api('submit',{roundId:rr.id,answers:ha},h),api('submit',{roundId:rr.id,answers:aa},a),api('submit',{roundId:rr.id,answers:ba},b)]);
let reviewed=await get(h);assert.equal(reviewed.phase,'review');assert.equal(reviewed.round.players.find(p=>p.id===ai).points[0],0);assert.equal(reviewed.round.players.find(p=>p.id===bi).points[0],1);
assert.deepEqual(reviewed.round.players.find(p=>p.id===created.state.you).points.slice(4),[0,0,0]);
assert.deepEqual(reviewed.round.players.find(p=>p.id===ai).points.slice(4),[0,0,0]);
assert.deepEqual(reviewed.round.players.find(p=>p.id===bi).points.slice(4),[1,1,0]);
await api('score',{roundId:rr.id,playerId:ai,value:25},a,403);await api('score',{roundId:rr.id,playerId:ai,value:25},h);assert.equal((await get(a)).players.find(p=>p.id===ai).total,25);
await api('kick',{playerId:bi},a,403);await api('kick',{playerId:bi},h);await get(b,410);
let next=await api('start',{},h);assert.equal(next.state.round.players.length,2);await api('answers',{roundId:rr.id,answers:ha},h,400);
await api('stop',{roundId:next.state.round.id},h);await api('finish',{},h);assert.equal((await get(a)).phase,'finished');await get({code:h.code,token:'forged'},401);
console.log('PASS: real D1 API room creation; simultaneous joins and autosaves; identity/host checks; hidden peer answers; short-answer rejection; three-letter qualification; punctuation/digits minimum; accent/case duplicates; 1/0 scoring; manual totals; removal; next round; stale packets; finish; forged token.');
