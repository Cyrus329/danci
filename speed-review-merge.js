(function(){
  const names=['known','meaning','unknown'];
  function stamp(snapshot,id){return Date.parse(snapshot?.entryUpdatedAt?.[id] || snapshot?.updatedAt || '')||0;}
  function merge(left={},right={}){
    const cleared=Math.max(Date.parse(left.clearedAt||'')||0,Date.parse(right.clearedAt||'')||0);
    const entries=new Map();
    for(const snapshot of [left,right])for(const bucket of names)for(const id of snapshot.buckets?.[bucket]||[]){
      const time=stamp(snapshot,id),previous=entries.get(id);
      if(time<=cleared)continue;
      if(!previous||time>previous.time)entries.set(id,{bucket,time});
    }
    const result={...left,...right,buckets:{known:[],meaning:[],unknown:[]},entryUpdatedAt:{},clearedAt:cleared?new Date(cleared).toISOString():''};
    for(const [id,e] of entries){result.buckets[e.bucket].push(id);result.entryUpdatedAt[id]=new Date(e.time).toISOString();}
    return result;
  }
  window.mergeSpeedReviewSnapshots=merge;
}());
