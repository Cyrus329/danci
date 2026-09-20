const fs=require('fs');
function ok(v,m){if(!v){console.error('FAIL:',m);process.exit(1)} console.log('PASS:',m)}
function load(path){const s=fs.readFileSync(path,'utf8'); return JSON.parse(s.slice(s.indexOf('=')+1,s.lastIndexOf(';')).trim())}
const words=load('word-data.js');
const group='四级核心 Unit 10 Lesson 2';
ok(words.length===8230,'word count 8230');
ok(new Set(words.map(w=>w.id)).size===words.length,'all IDs unique');
const g=words.filter(w=>(w.groups||[]).includes(group));
ok(g.length===74,'Unit 10 Lesson 2 has 74 actually imported visible entries');
const expected=['commission','committee','commit','commitment','summit','peak','ceiling','altitude','attitude','aptitude','password','cross','crossing','code','regulate','regulation','regulator','regulatory','regular','regularity','irregular','relate','relation','relationship','relative','relativity','relevant','relevance','narrate','narration','narrative','narrator','hesitate','hesitation','hesitant','compensate','compensation','compensatory','candidate','candidacy','negotiate','negotiation','negotiable','initiate','initial','initially','initiation','initiative','launch','innovate','innovation','innovative','renovate'];
for(const term of expected) ok(g.some(w=>w.term.toLowerCase()===term.toLowerCase()),'group contains '+term);
const relevant=g.find(w=>w.term.toLowerCase()==='relevant');
ok(relevant && !String(relevant.id).startsWith('dictation-'),'normal/core relevant does not reuse dictation ID');
ok(fs.existsSync('spelling-hub.js') && fs.readFileSync('spelling-hub.js','utf8').includes('wordMemorySpellingLabV2'),'B166 spelling mastery center preserved');
const index=fs.readFileSync('index.html','utf8');
ok(index.includes('version-badge">B167'),'version badge B167');
ok(!index.includes('data-module-target="peppa" class="module-card') || index.includes('hidden'), 'Peppa entry remains hidden/protected');
const app=fs.readFileSync('app.js','utf8');
ok(app.includes('builtins:v70-b167-u10l2-politics-20260916'),'B167 built-in merge key');
const sw=fs.readFileSync('service-worker.js','utf8');
ok(sw.includes('word-memory-v70-b167'),'service worker B167');
console.log('B167 Unit 10 Lesson 2 politics import QA complete');
