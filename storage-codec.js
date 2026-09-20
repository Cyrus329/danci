// Lossless packing of repeated per-mode progress. Original legacy key is retained.
(function () {
  const fields = ['status','stage','nextReviewAt','lastStudiedAt','resetAt','history'];
  function encode(payload) {
    const table=[], index=new Map(), modes=[];
    const packWord = word => {
      if (!word.progress) return word;
      const refs=[];
      for(const [mode,p] of Object.entries(word.progress)) {
        const key=JSON.stringify(p);
        if(!index.has(key)){index.set(key,table.length);table.push(p);}
        if(!modes.includes(mode))modes.push(mode);
        refs.push(modes.indexOf(mode),index.get(key));
      }
      const {progress,...rest}=word;
      return {...rest,modeRecordRefs:refs};
    };
    const packed={...payload,progress:(payload.progress||[]).map(packWord),customWords:(payload.customWords||[]).map(packWord)};
    return {codec:'mode-table-v1',payload:packed,table,modes};
  }
  function decode(encoded) {
    if(encoded?.codec!=='mode-table-v1')return encoded;
    if(!Array.isArray(encoded.table))throw Error('Invalid progress table');
    const unpack=word=>{
      if(!word.modeRecordRefs)return word;
      const {modeRecordRefs,...rest}=word,progress={};
      for(let i=0;i<modeRecordRefs.length;i+=2){
        const mode=encoded.modes[modeRecordRefs[i]],ref=modeRecordRefs[i+1];
        if(!Number.isInteger(ref)||!encoded.table[ref])throw Error('Invalid progress reference');
        progress[mode]=JSON.parse(JSON.stringify(encoded.table[ref]));
      }
      return {...rest,progress};
    };
    return {...encoded.payload,progress:encoded.payload.progress.map(unpack),customWords:encoded.payload.customWords.map(unpack)};
  }
  window.WordMemoryStorageCodec={encode,decode};
}());
