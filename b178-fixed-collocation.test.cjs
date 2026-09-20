const fs=require('fs'),vm=require('vm'),path=require('path');
const root=__dirname;
function load(file,key){const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c);return c.window[key];}
const words=load('word-data.js','WORD_MEMORY_WORDS');
const lib=load('library-folder-data.js','ENGLISH_FOLDER_LIBRARY');
const grp='四级固定搭配专项';
const fixed=words.filter(w=>(w.groups||[]).includes(grp));
function assert(x,msg){if(!x)throw new Error(msg);}
assert(fixed.length===48,`固定搭配专项应为48条，实际${fixed.length}`);
assert(fixed.every(w=>/\s/.test(String(w.term||''))), '专项中存在非多词搭配');
assert(fixed.filter(w=>(w.groups||[]).includes('四级翻译 政治')).length===13,'政治翻译固定搭配不是13条');
assert(fixed.filter(w=>(w.groups||[]).includes('四级翻译 经济')).length===20,'经济翻译固定搭配不是20条');
assert(fixed.some(w=>w.term==='in horror'&&w.meaning==='惊恐地'),'缺少 in horror');
assert(fixed.some(w=>w.term==='culture shock'&&w.meaning==='文化冲击'),'缺少 culture shock');
const folder=lib.find(x=>x.name==='固定搭配专项');assert(folder&&folder.count===48,'资料夹固定搭配专项计数错误');
assert((folder.children||[]).map(x=>x.count).join(',')==='13,20,15','资料夹子组应为13/20/15');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');assert(html.includes('spellingHubCollocationStart'),'缺少拼写固定搭配专项入口');assert(html.includes('value="固定搭配专项"'),'缺少拼写来源筛选');
const hub=fs.readFileSync(path.join(root,'spelling-hub.js'),'utf8');assert(hub.includes('function collocationQueue()'),'缺少固定搭配专项队列');assert(hub.includes("source:'固定搭配专项'"),'专项队列未绑定固定搭配来源');
console.log('B178 fixed collocation test PASS');
