const fs=require('fs'),vm=require('vm'),assert=require('assert');
function load(file,name){const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(file,'utf8'),c);return c.window[name];}
const words=load('word-data.js','WORD_MEMORY_WORDS');
const lib=load('library-folder-data.js','ENGLISH_FOLDER_LIBRARY');
assert.equal(words.length,8326); assert.equal(new Set(words.map(w=>w.id)).size,8326);
function count(g){return words.filter(w=>(w.groups||[]).includes(g)).length}
assert.equal(count('四级核心 Unit 10 Lesson 4'),185);
assert.equal(count('四级核心 Unit 10 Lesson 3'),30);
assert.equal(count('四级翻译 政治'),13);
assert.equal(count('四级翻译 经济'),20);
const core=lib.find(x=>x.name==='四级核心'); const trans=lib.find(x=>x.name==='四级翻译');
assert.equal(core.children.find(x=>x.name==='Unit 10 Lesson 4').count,185);
assert.equal(core.children.find(x=>x.name==='Unit 10 Lesson 3').count,30);
assert.equal(trans.children.find(x=>x.name==='政治').count,13);
assert.equal(trans.children.find(x=>x.name==='经济').count,20);
const find=t=>words.find(w=>w.term===t);
assert(find('a series of measures').groups.includes('四级翻译 政治'));
assert(find('common prosperity').groups.includes('四级翻译 经济'));
assert(find('otherwise').groups.includes('四级核心 Unit 10 Lesson 4'));
assert(find('drama').groups.includes('四级核心 Unit 10 Lesson 3'));
assert(!words.some(w=>(w.groups||[]).some(g=>g.startsWith('四级听力'))));
console.log('B177 import PASS');
