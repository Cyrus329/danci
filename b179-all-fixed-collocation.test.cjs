const fs=require('fs'),vm=require('vm');
const ctx={window:{ENGLISH_FOLDER_LIBRARY:[]}}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/fixed-collocation-data.js','utf8'),ctx);
const all=ctx.window.ALL_FIXED_COLLOCATIONS;
if(!Array.isArray(all)||all.length!==1785) throw new Error('fixed collocation count '+(all&&all.length));
const ids=new Set(all.map(x=>x.id)); if(ids.size!==all.length) throw new Error('duplicate fixed ids');
const terms=new Set(all.map(x=>String(x.term).trim().toLowerCase())); if(terms.size!==all.length) throw new Error('duplicate terms');
for(const w of all){ if(!w.term||!w.meaning) throw new Error('empty fixed item'); if(!w.virtualFixedCollocation) throw new Error('missing virtual flag'); }
const folder=ctx.window.ENGLISH_FOLDER_LIBRARY.find(x=>x.name==='固定搭配专项'); if(!folder||folder.count!==1785) throw new Error('folder missing');
for(const src of ['蓝色森林','四级核心','四级翻译','四级','Word List','短语练习','全方位','听写内容']){ if(!folder.children.find(x=>x.name===src)) throw new Error('source child '+src); }
const spell=fs.readFileSync(__dirname+'/spelling-hub.js','utf8');
for(const needle of ['fixedWords','practiceWord','全词库固定搭配专项']) if(!spell.includes(needle)) throw new Error('spelling missing '+needle);
const startup=fs.readFileSync(__dirname+'/startup.js','utf8'); if(!startup.includes('fixed-collocation-data.js?v=70b179')) throw new Error('startup missing fixed data');
console.log('B179 all fixed collocation test PASS');
