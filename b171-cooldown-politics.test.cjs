const fs=require('fs'), vm=require('vm');
function ok(c,m){ if(!c) throw new Error(m); console.log('PASS',m); }
const root=__dirname;
const app=fs.readFileSync(root+'/app.js','utf8');
const index=fs.readFileSync(root+'/index.html','utf8');
const sw=fs.readFileSync(root+'/service-worker.js','utf8');
const ctx={window:{},console}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(root+'/word-data.js','utf8'),ctx);
const words=ctx.window.WORD_MEMORY_WORDS||[];
const group='四级核心 Unit 10 政治法律';
const pol=words.filter(w=>(w.groups||[]).includes(group));
ok(index.includes('>B171</span>'),'version badge B171');
ok(app.includes('isRecentReviewCooldown'),'review cooldown helper exists');
ok(app.includes('.filter((word) => !isRecentReviewCooldown(word))'),'main queue enforces cooldown');
ok(app.includes('delay = 2 * 60 * 1000') && app.includes('label = "2分钟"'),'forgot delay remains exactly 2 minutes');
ok(app.includes('state.reviewCooldowns[cooldownKey] = progress.nextReviewAt'),'rating writes hard cooldown deadline');
ok(pol.length===105,'Unit 10 politics main study group has 105 records');
ok(pol.filter(w=>/\s/.test(String(w.term||'').trim())).length===42,'Unit 10 politics includes 42 phrase records');
const fixedIds=['cet-20260810-31-022','cet4-core-u1-064','cet4-core-u1-058','blueforest-20260818-45-031','lansen-pdf-a-20260624-049','cet4-042','cet4-043','cet4-20260818-39-025','cet4-20260818-39-026','cet4-20260818-39-027','cet4-core-u6-paper-091'];
for(const id of fixedIds){ const w=words.find(x=>x.id===id); ok(w && (w.groups||[]).includes(group),`politics group restored: ${id}`); }
ok(words.length===8230 && new Set(words.map(w=>w.id)).size===8230,'8230 unique IDs preserved');
ok(app.includes('B168_GOLDEN_BASELINE') && app.includes('B169_QUICK_STORAGE_KEY'),'B168/B169 progress protection preserved');
ok(sw.includes('word-memory-v70-b171'),'service worker cache bumped B171');
console.log('B171 QA PASS');
