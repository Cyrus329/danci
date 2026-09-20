const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const hub = fs.readFileSync('spelling-hub.js','utf8');
const app = fs.readFileSync('app.js','utf8');
const startup = fs.readFileSync('startup.js','utf8');
const index = fs.readFileSync('index.html','utf8');
const sw = fs.readFileSync('service-worker.js','utf8');
// B170 meaning fix
assert(hub.includes('meaningSegments?.(word.meaning)'));
assert(!hub.includes('meaningSegments?.(word);'));
assert(hub.includes('word.perGroupMeaning[selectedGroup]'));
assert(hub.includes("selectedSource === '四级核心'"));
assert(hub.includes('中文释义已显示'));
// spelling mastery mechanics retained
['5分钟后','今日稍后','1天后','3天后','7天后','14天后','30天后','闭卷重拼','连续三次没拼对'].forEach(x=>assert(hub.includes(x),x));
// progress/storage protection retained
['B169_QUICK_STORAGE_KEY','b169BuildQuickStoragePayload','b169WriteQuickStorage','b169ReleaseRedundantLocalCopies','B168_GUARD_DB_KEY','b168DetectCatastrophicRegression'].forEach(x=>assert(app.includes(x),x));
assert(index.includes('version-badge">B170'));
assert(sw.includes('word-memory-v70-b170'));
assert(startup.includes('spelling-hub.js?v=70b170'));
assert(sw.includes('spelling-hub.js?v=70b170'));
// current word data remains intact
const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('word-data.js','utf8'),ctx);
const words=ctx.window.WORD_MEMORY_WORDS;
assert(Array.isArray(words)&&words.length===8230, 'word count');
assert(new Set(words.map(w=>String(w.id))).size===words.length, 'unique ids');
assert(words.every(w=>typeof w.meaning==='string'), 'all meanings strings');
console.log('B170 full regression: PASS');
