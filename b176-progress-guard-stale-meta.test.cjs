const fs=require('fs'),vm=require('vm');
function ok(c,m){if(!c)throw new Error(m);console.log('PASS',m)}
const app=fs.readFileSync('app.js','utf8'),idx=fs.readFileSync('index.html','utf8'),st=fs.readFileSync('startup.js','utf8'),sw=fs.readFileSync('service-worker.js','utf8');
ok(idx.includes('version-badge">B176'),'B176 badge');
ok(st.includes('app.js?v=70b176'),'B176 app cache bust');
ok(sw.includes('word-memory-v70-b176'),'B176 service worker cache');
ok(app.includes('let b176ValidatedGuardMeta = null'),'validated DB guard summary state exists');
const effective=app.match(/function b168EffectiveGuardMeta\(\) \{[\s\S]*?\n\}/)?.[0]||'';
ok(effective.includes('b176ValidatedGuardMeta'),'effective floor uses validated DB summary');
ok(!effective.includes('b168ReadGuardMeta()'),'localStorage guard meta no longer hard floor');
ok(app.includes('function b176RepairStaleGuardMeta'),'stale local guard meta self-heal exists');
ok(app.includes('b176ValidatedGuardMeta = b176NormalizeGuardSummary(summary)'),'successful guard write refreshes authoritative summary');
const hard=app.match(/function b168DetectCatastrophicRegression\(current, floor\) \{[\s\S]*?\n\}/)?.[0]||'';
ok(hard.includes('current.learned')&&hard.includes('current.totalStudySeconds'),'core rollback protection still active');
ok(!hard.includes('checkInDays')&&!hard.includes('completedDays')&&!hard.includes('reviewActionDays'),'ancillary history still not hard-blocking');
console.log('B176 stale guard meta regression PASS');
