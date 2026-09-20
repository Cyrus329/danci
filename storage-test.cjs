const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/app.js','utf8');
function func(name){const start=source.indexOf('function '+name+'(');assert(start>=0,name);const next=source.indexOf('\nfunction ',start+9);return source.slice(start,next<0?undefined:next);}
const j=JSON.parse(fs.readFileSync(process.argv[2]));
const c={window:{},PROGRESS_MODES:Object.keys(j.words[0].progress),normalizeText:x=>String(x||''),normalizeWord:w=>w,ALL_BUILTIN_WORDS:j.words,builtinDedupeTermKey:x=>x, captureStudySessionSnapshot:()=>j.studySession,normalizeBrowsePracticeSnapshot:x=>x,state:{words:j.words,browsePractice:j.browsePractice},restoredBrowsePractice:{}};
vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/storage-codec.js','utf8'),c);
for(const n of ['compactProgress','compactWordRecord','compactCustomWord','compactPayloadForStorage'])vm.runInContext(func(n),c);
const p=c.compactPayloadForStorage(j.words,{localLite:true}),codec=c.window.WordMemoryStorageCodec;
let encoded=codec.encode(p),decoded=codec.decode(JSON.parse(JSON.stringify(encoded)));
assert.deepStrictEqual(JSON.parse(JSON.stringify(decoded)),JSON.parse(JSON.stringify(p)));
for(let i=0;i<5;i++)decoded=codec.decode(JSON.parse(JSON.stringify(codec.encode(decoded))));
assert.deepStrictEqual(JSON.parse(JSON.stringify(decoded)),JSON.parse(JSON.stringify(p)));
const mem=new Map(),storage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v)};
Object.assign(c,{localStorage:storage,STORAGE_KEY:'test'});
for(const n of ['payloadSavedAt','parseLocalStoragePayload','writeCompactStorage'])vm.runInContext(func(n),c);
mem.set('test',JSON.stringify({...p,savedAt:'2020-01-01'}));c.writeCompactStorage(p);
assert.equal(c.parseLocalStoragePayload().savedAt,p.savedAt);
console.log(JSON.stringify({tests:'PASS lossless 5 refresh cycles, newer packed chosen over legacy, all modes preserved',rawBytes:JSON.stringify(p).length,packedBytes:JSON.stringify(encoded).length,records:p.progress.length}));
