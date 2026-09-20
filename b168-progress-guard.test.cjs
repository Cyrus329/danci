const fs=require('fs'), vm=require('vm');
function ok(v,m){if(!v){console.error('FAIL:',m);process.exit(1)} console.log('PASS:',m)}
function loadWindowAssignment(path,key){const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path,'utf8'),ctx);return ctx.window[key];}
const golden=loadWindowAssignment('b168-golden-baseline.js','B168_GOLDEN_BASELINE');
ok(golden && golden.label.includes('黄金恢复基线'),'golden baseline loaded');
ok(golden.words.length===8205,'golden baseline has 8205 word records');
ok(Number(golden.studyTime.totalSeconds)===540459,'golden study time is 540459 seconds');
const stageCount={}; for(const w of golden.words){const s=Number(w?.progress?.card?.stage ?? w.stage ?? -1); stageCount[s]=(stageCount[s]||0)+1;}
ok(stageCount[6]===7881,'golden stage-6 count is 7881');
const words=loadWindowAssignment('word-data.js','WORD_MEMORY_WORDS');
ok(words.length===8230,'B167/B168 builtin word data preserved at 8230');
const ids=new Set(words.map(w=>String(w.id||'')));
const terms=new Set(words.map(w=>String(w.term||'').trim().toLowerCase().replace(/[’‘`]/g,"'").replace(/\s+/g,' ')));
const unmatched=golden.words.filter(w=>!ids.has(String(w.id||''))&&!terms.has(String(w.term||'').trim().toLowerCase().replace(/[’‘`]/g,"'").replace(/\s+/g,' ')));
ok(unmatched.length===0,'all 8205 golden records map to current builtins by id or term');
const app=fs.readFileSync('app.js','utf8');
ok(app.includes('B168_GUARD_DB_KEY = "b168-progress-guard"'),'rolling IndexedDB guard exists');
ok(app.includes('b168ApplyGoldenBaselineToWords(state.words)'),'golden baseline is reapplied before save/hydration');
ok(app.includes('b168DetectCatastrophicRegression'),'catastrophic rollback detector exists');
ok(app.includes('return false;') && app.includes('检测到学习进度异常回退'),'rollback save blocking path exists');
const startup=fs.readFileSync('startup.js','utf8');
ok(startup.includes('b168-golden-baseline.js?v=70b168'),'golden baseline loads before app');
const index=fs.readFileSync('index.html','utf8');
ok(index.includes('version-badge">B168'),'version badge B168');
ok(index.includes('<span>今日完成</span>'),'daily completed label clarified');
const sw=fs.readFileSync('service-worker.js','utf8');
ok(sw.includes('word-memory-v70-b168'),'service worker cache B168');
ok(sw.includes('b168-golden-baseline.js?v=70b168'),'golden baseline is cached offline');
console.log('B168 progress protection QA complete');
