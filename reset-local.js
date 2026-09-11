// B151 reset screen. No app, cloud, progress timers or hydration run on this screen.
(function () {
  'use strict';
  const ownedKey = key => key.startsWith('word-memory-trainer:') || key.startsWith('wordMemory');
  const cleanWord = word => ({...word, status:'new',stage:-1,history:[],progress:{},
    nextReviewAt:'',lastStudiedAt:'',updatedAt:'',mastery:'未学',important:false});
  function customWords(payload) {
    if (!payload || typeof payload !== 'object') return [];
    return Array.isArray(payload.customWords) ? payload.customWords : [];
  }
  function clearDatabase(dbFactory) {
    if (!dbFactory) return Promise.resolve([]);
    return new Promise((resolve,reject) => {
      const request = dbFactory.open('word-memory-trainer-mobile:v1');
      request.onerror = () => reject(request.error || Error('无法打开手机存档'));
      request.onblocked = () => reject(Error('存档正被其他页面占用，请关闭其他单词页面后重试'));
      request.onsuccess = () => {
        const db=request.result;
        if (!db.objectStoreNames.contains('snapshots')) { db.close(); resolve([]); return; }
        const tx=db.transaction('snapshots','readwrite'),store=tx.objectStore('snapshots');
        let retained=[];
        const read=store.getAll();
        read.onsuccess=()=>{
          const snapshots=read.result || [];
          const primary=snapshots.find(x=>x.key==='words-primary');
          // The current snapshot wins; older deleted custom words are not resurrected.
          retained=customWords(primary?.payload);
          store.clear();
        };
        tx.oncomplete=()=>{db.close();resolve(retained);};
        tx.onerror=tx.onabort=()=>{db.close();reject(tx.error || Error('清空手机存档失败'));};
      };
    });
  }
  async function resetStores(storage, session, dbFactory) {
    let payload=null;
    const raw=storage.getItem('word-memory-trainer:v1');
    if (raw) payload=JSON.parse(raw); // Invalid data must not be silently discarded.
    const retained=new Map(customWords(payload).map(w=>[w.id,w]));
    const fromDb=await clearDatabase(dbFactory);
    fromDb.forEach(w=>{if(!retained.has(w.id)) retained.set(w.id,w);});
    // Legacy full-record storage can retain its vocabulary with all learning fields reset.
    const full=Array.isArray(payload)?payload:(!payload?.compact&&Array.isArray(payload?.words)?payload.words:null);
    const clean=full ? full.map(cleanWord) : {
      app:'专升本单词记忆',version:31,compact:true,savedAt:new Date().toISOString(),
      progress:[],customWords:[...retained.values()].map(cleanWord),
      studySession:{mode:'new',activeGroup:'all',activeId:null,savedAt:''},
      browsePractice:{version:1,updatedAt:'',activeKind:'word',autoBritish:true,word:{},phrase:{}}
    };
    for(const s of [storage,session]){
      if(!s)continue;
      const keys=Array.from({length:s.length},(_,i)=>s.key(i)).filter(k=>k&&ownedKey(k));
      keys.forEach(k=>s.removeItem(k));
    }
    storage.setItem('word-memory-trainer:v1',JSON.stringify(clean));
    return true;
  }
  if(typeof module==='object'&&module.exports) {module.exports={ownedKey,cleanWord,resetStores};return;}
  document.title='清空本机学习进度 · B151';
  const panel=document.createElement('main');
  panel.style.cssText='max-width:520px;margin:8vh auto;padding:28px;border:1px solid #d9e2d8;border-radius:22px;background:#fffefa;color:#263c30;font:16px/1.8 system-ui';
  panel.innerHTML='<p style="color:#50735d">B151 · 本机存档管理</p><h1 style="font-size:25px">从零开始学习</h1><p>保留词库，清空本机的卡片、拼写、全词练习、快速复盘、Peppa、学习时长和打卡记录。手机大容量存档也会清空。</p><p>请先返回主页导出备份，并关闭其他单词页面。清空后会断开本机云同步连接，云端备份不删除；重新载入旧云存档仍会恢复旧进度。</p><button id="resetConfirm" style="width:100%;min-height:52px;margin:16px 0;background:#963f30;color:white;border:0;border-radius:12px;font-size:16px">我已备份，清空本机全部学习进度</button><p id="resetStatus" role="status"></p><a id="resetBack" href="#study">返回主页</a>';
  document.body.append(panel);
  document.getElementById('resetBack').onclick=e=>{e.preventDefault();location.hash='study';location.reload();};
  document.getElementById('resetConfirm').onclick=async function(){
    if(!confirm('确定清空本机全部学习进度？此操作不能撤销，请确认已导出所需备份。'))return;
    this.disabled=true;
    const status=document.getElementById('resetStatus');
    status.textContent='正在清空，请稍候…';
    try {
      await resetStores(localStorage,sessionStorage,window.indexedDB);
      status.textContent='已清空。点击“返回主页”，从零开始。刷新不会再自动恢复包里的旧存档。';
      this.textContent='已清空';document.getElementById('resetBack').textContent='返回主页，从零开始';
    } catch(error){
      status.textContent='未完成清空：'+error.message+'。请关闭其他单词页面后重试。';
      this.disabled=false;
    }
  };
}());
