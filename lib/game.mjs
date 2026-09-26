export const TOPICS = ['Alkoholmárka','Pornóműfaj','Szexpóz','Fétis fajta','Színész/színésznő','Szexjáték (tárgy)','Red flag','Random dolog egy kocsmában','Becenév partnernek','Pornóoldal','Kocsma neve','Escortnév','Szerepjátékfajta','Random pajzán szó','Ország','Város','Állat','Random bolt','Autómárka','Kétértelmű szó','Férfi név','Női név','Foglalkozás','Szakítás oka','Random étel','Ami az exedre emlékeztet'];
export const LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','R','S','T','U','V','Z'];
export class GameError extends Error { constructor(message, status=400) { super(message); this.status=status; } }
export const normalize = s => String(s).trim().toLocaleLowerCase('hu').normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/\s+/g,' ');
export function isValidAnswer(value,letter) {
 const answer=normalize(value||'');
 return answer.startsWith(normalize(letter))&&(answer.match(/\p{L}/gu)||[]).length>=3;
}
export function randomInt(n) { const a=new Uint32Array(1); const limit=Math.floor(4294967296/n)*n; do { crypto.getRandomValues(a); } while(a[0]>=limit); return a[0]%n; }
export function shuffle(items) { const a=[...items]; for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];} return a; }
export const makeCode = () => String(100000+randomInt(900000));
export function makeRoom(code,id,name,hash,seconds=120) {
 return {code,phase:'lobby',host:id,players:[{id,name,hash,removed:false}],rounds:[],usedLetters:[],seconds,created:Date.now()};
}
export function scoreRound(r) {
 for(const p of r.players) p.points=r.topics.map((_,i)=>{
   const answer=normalize(p.answers[i]||'');
   if(!isValidAnswer(answer,r.letter)) return 0;
   return r.players.some(other=>other.id!==p.id&&normalize(other.answers[i]||'')===answer)?0:1;
 });
}
export function closeRound(s) { const r=s.rounds.at(-1); if(s.phase!=='playing'||!r)return; scoreRound(r); r.closed=Date.now(); s.phase='review'; }
export function expire(s,now=Date.now()) { const r=s.rounds.at(-1); if(s.phase==='playing'&&now>=r.deadline){closeRound(s);return true;} return false; }
const requireHost=(s,p)=>{if(p.id!==s.host)throw new GameError('Ezt csak a házigazda teheti meg.',403);};
export function totalFor(s,id){return s.rounds.reduce((sum,r)=>{const p=r.players.find(p=>p.id===id);return sum+(p?p.points.reduce((a,b)=>a+b,0)+(p.adjustment||0):0);},0);}
export function apply(s,p,action,data={}) {
 const r=s.rounds.at(-1);
 if(action==='start') {
  requireHost(s,p); if(!['lobby','review'].includes(s.phase))throw new GameError('Most nem indítható új kör.');
  if(s.rounds.length>=50)throw new GameError('Elértétek az 50 kört. Zárjátok le a játékot.');
  if(s.usedLetters.length===LETTERS.length)s.usedLetters=[];
  const letter=shuffle(LETTERS.filter(l=>!s.usedLetters.includes(l)))[0]; s.usedLetters.push(letter);
  s.rounds.push({id:crypto.randomUUID(),number:s.rounds.length+1,letter,topics:shuffle(TOPICS).slice(0,7),started:Date.now(),deadline:Date.now()+s.seconds*1000,players:s.players.filter(p=>!p.removed).map(p=>({id:p.id,name:p.name,answers:Array(7).fill(''),points:Array(7).fill(0),adjustment:0,submitted:false}))});s.phase='playing';
 } else if(action==='answers'||action==='submit') {
  if(s.phase!=='playing'||data.roundId!==r?.id)throw new GameError('Ez a kör már lezárult.');
  const own=r.players.find(a=>a.id===p.id);if(!own||own.submitted)throw new GameError('A válaszaidat már beküldted.');
  if(!Array.isArray(data.answers)||data.answers.length!==7||data.answers.some(x=>typeof x!=='string'||x.length>100))throw new GameError('Pontosan 7, legfeljebb 100 karakteres válasz adható meg.');
  own.answers=data.answers.map(a=>a.trim());if(action==='submit')own.submitted=true;
  if(r.players.every(a=>a.submitted||s.players.find(p=>p.id===a.id)?.removed))closeRound(s);
 } else if(action==='stop') {requireHost(s,p);if(s.phase!=='playing'||data.roundId!==r?.id)throw new GameError('Ez a kör már lezárult.');closeRound(s);
 } else if(action==='kick'||action==='leave') {
  if(action==='kick')requireHost(s,p);const target=s.players.find(x=>x.id===(action==='leave'?p.id:data.playerId));
  if(!target||target.id===s.host)throw new GameError('A házigazda nem távolítható el.');target.removed=true;
  if(s.phase==='playing'&&r.players.every(a=>a.submitted||s.players.find(p=>p.id===a.id)?.removed))closeRound(s);
 } else if(action==='score') {
  requireHost(s,p);if(s.phase!=='review'||data.roundId!==r?.id)throw new GameError('Pontot a kör végén módosíthatsz.');
  const player=r.players.find(x=>x.id===data.playerId);if(!player)throw new GameError('Nincs ilyen játékos.');
  if(data.index!==undefined){if(!Number.isInteger(data.index)||data.index<0||data.index>6||!Number.isInteger(data.value)||data.value<0||data.value>100)throw new GameError('0–100 közötti egész pont adható.');player.points[data.index]=data.value;}
  else {if(!Number.isInteger(data.value)||data.value<0||data.value>10000)throw new GameError('0–10 000 közötti összpont adható.');player.adjustment=(player.adjustment||0)+data.value-totalFor(s,player.id);}
 } else if(action==='settings') {
  requireHost(s,p);if(s.phase!=='lobby')throw new GameError('Az időt az első kör előtt állítsd be.');if(![60,90,120,180].includes(data.seconds))throw new GameError('Érvénytelen idő.');s.seconds=data.seconds;
 } else if(action==='finish') {requireHost(s,p);if(!['lobby','review'].includes(s.phase))throw new GameError('Előbb zárd le a kört.');s.phase='finished';
 } else throw new GameError('Ismeretlen művelet.');
 return s;
}
export function view(s,p) {
 const latest=s.rounds.at(-1);
 return {code:s.code,phase:s.phase,host:s.host,you:p.id,seconds:s.seconds,roundCount:s.rounds.length,serverNow:Date.now(),players:s.players.filter(p=>!p.removed).map(p=>({id:p.id,name:p.name,total:totalFor(s,p.id)})),round:latest?{...latest,players:latest.players.map(x=>s.phase==='playing'&&x.id!==p.id?{id:x.id,name:x.name,submitted:x.submitted}:x)}:null};
}
