(async function () {
  document.body.innerHTML='<main style="max-width:720px;margin:40px auto;font:18px sans-serif"><h1>导出本机存档线索</h1><p>此页面只读取存档，不运行学习、恢复或同步代码。</p><button id="rescue">下载本机存档线索</button><p id="status"></p></main>';
  document.getElementById('rescue').onclick=async()=>{
    const result={exportedAt:new Date().toISOString(),url:location.href,localStorage:{},indexedDB:[],errors:[]};
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(/word.memory|wordMemory/i.test(k)&&!/(cloud|token|auth|supabase)/i.test(k))result.localStorage[k]=localStorage.getItem(k);}
    try {
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('word-memory-trainer-mobile:v1');r.onupgradeneeded=()=>{r.transaction.abort();reject(Error('No existing database'));};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      for(const name of db.objectStoreNames){const rows=await new Promise((resolve,reject)=>{const r=db.transaction(name,'readonly').objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});result.indexedDB.push({store:name,rows});}db.close();
    }catch(e){result.errors.push(String(e));}
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(result)],{type:'application/json'}));a.download='本机存档线索.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),30000);
    document.getElementById('status').textContent='已导出。请将文件发回以核对旧快照和最新记录；此文件不是普通导入备份。';
  };
}());
