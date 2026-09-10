// B143：分组快速切换、搜索焦点与去重、当前分组释义、双向分页。
// v70 B135：专题1因果词59条完整释义；保留B134蓝色森林59与Unit8 Lesson2/3。
(function(){
  const data = window.ENGLISH_FOLDER_LIBRARY || [];
  const richWords = Array.isArray(window.WORD_MEMORY_WORDS) ? window.WORD_MEMORY_WORDS : [];
  const richById = new Map(richWords.map((word) => [String(word.id || ''), word]));
  const richByTerm = new Map(richWords.map((word) => [String(word.term || '').trim().toLowerCase(), word]));
  const sourceBox = document.querySelector('#folderSourceList');
  const contentBox = document.querySelector('#folderContent');
  if (!sourceBox || !contentBox || !data.length) return;
  let currentFolder = data[0].name;
  let currentSub = data[0].children[0]?.name || '';
  let cet4Home = false;
  let currentCoreFamily = '';
  let query = '';
  const batchSize = 30;
  let pageStart = 0;

  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function folder(){return data.find(x=>x.name===currentFolder)||data[0];}
  function sub(){const f=folder();return f.children.find(x=>x.name===currentSub)||f.children[0];}
  function allWords(){return data.flatMap(f=>f.children.flatMap(s=>(s.words||[]).map(w=>({...w,folder:f.name,sub:s.name}))));}
  function resetPage(){pageStart = 0;}
  const cet4FolderNames = ['四级核心','四级翻译','四级'];
  function isCet4FolderName(name){ return cet4FolderNames.includes(String(name||'')); }
  function cet4Folders(){ return cet4FolderNames.map(name=>data.find(x=>x.name===name)).filter(Boolean); }
  function cet4DisplayName(name){ return name === '四级' ? '普通四级词库' : name; }
  function cet4FolderHint(name){ return ({'四级核心':'按教材 Unit 归类','四级翻译':'翻译高频词与表达','四级':'普通四级分组'})[name] || ''; }
  function isCoreUnit(){return currentFolder === '四级核心' && /^Unit \d+\s/.test(String(sub()?.name||''));}

  function cleanNote(note){
    const n = String(note || '').trim();
    if(!n) return '';
    if(/^来源[:：]/.test(n)) return '';
    if(n.includes('按 “构词法/前缀” 背')) return '';
    return n;
  }

  function renderSources(){
    const rendered=[];
    let cet4Inserted=false;
    data.forEach(item=>{
      if(isCet4FolderName(item.name)){
        if(cet4Inserted) return;
        cet4Inserted=true;
        const parts=cet4Folders();
        rendered.push(`<button class="folder-source-btn ${(cet4Home||isCet4FolderName(currentFolder))?'active':''}" data-folder-source="__cet4_parent__"><span class="folder-icon">📁</span><span><strong>四级</strong><span>核心 · 翻译 · 普通词库</span></span></button>`);
        return;
      }
      rendered.push(`<button class="folder-source-btn ${item.name===currentFolder?'active':''}" data-folder-source="${esc(item.name)}"><span class="folder-icon">📁</span><span><strong>${esc(item.name)}</strong><span>${item.children.length} 组 · ${item.count} 条</span></span></button>`);
    });
    sourceBox.innerHTML=rendered.join('');
  }

  function getWords(){
    const f=folder();
    if(!f) return [];
    if(!currentSub || !f.children.some(s=>s.name===currentSub)) currentSub=f.children[0]?.name||'';
    const selected=sub();
    let words=(query?allWords():(selected.words||[]).map(w=>({...w,folder:f.name,sub:selected.name})));
    if(query){
      const q=query.toLowerCase();
      words=words.filter(w=>[w.term,w.meaning, ...Object.values(w.perGroupMeaning || {}),w.phrase,w.note,w.tag,w.folder,w.sub,w.coreFamily,w.coreFamilyLabel,w.coreRelation].join(' ').toLowerCase().includes(q));
      // One result per learning ID, even when a word belongs to several folders.
      const unique = new Map();
      words.forEach(w => { if (!unique.has(w.id)) unique.set(w.id, w); });
      words = [...unique.values()];
    }
    return words;
  }

  function keepOnlyMeaning(text){
    let t = String(text || '').replace(/\s+/g, ' ').trim();
    if(!t) return '';
    const parts = t.split(/(?<=[。；;])/);
    const kept = [];
    for (const part of parts){
      const p = part.trim();
      if(!p) continue;
      if(/[A-Za-z]/.test(p)){
        const idx = p.search(/[A-Za-z]/);
        const before = p.slice(0, idx).trim().replace(/[，,、\s]+$/,'');
        if(/[\u4e00-\u9fff]/.test(before)) kept.push(before);
        continue;
      }
      kept.push(p);
    }
    let out = kept.join('').replace(/\s+/g,' ').trim();
    out = out.replace(/^[。；;，,、\s]+/,'').replace(/[；;\s]+$/,'').trim();
    return out || t;
  }

  function splitMeaning(text){
    const raw = String(text || '').trim();
    const posRe = /\b(n|v|adj|adv|prep|pron|conj|num|art|aux|modal)\.\s*/gi;
    const found = [];
    let match;
    while((match = posRe.exec(raw))){
      const value = match[0].trim().replace(/\s+/g,' ');
      if(!found.some(x => x.toLowerCase() === value.toLowerCase())) found.push(value);
    }
    let meaning = raw.replace(posRe, '').replace(/\s+/g,' ').trim();
    meaning = meaning.replace(/^[:：;；,.，。\s]+/, '').trim();
    meaning = keepOnlyMeaning(meaning);
    return { pos: found.join(' / '), meaning: meaning || raw };
  }

  function coreCompare(a,b){
    return Number(a.coreFamilyOrder||999)-Number(b.coreFamilyOrder||999)
      || Number(a.coreRelationOrder||99)-Number(b.coreRelationOrder||99)
      || Number(a.coreItemOrder||999)-Number(b.coreItemOrder||999)
      || String(a.term||'').localeCompare(String(b.term||''),'en',{sensitivity:'base'});
  }

  function coreFamilies(words){
    const map = new Map();
    [...words].sort(coreCompare).forEach(w=>{
      const id=String(w.coreFamily||'').trim();
      if(!id) return;
      if(!map.has(id)) map.set(id,{id,label:w.coreFamilyLabel||`${id} 词族`,order:Number(w.coreFamilyOrder||999),words:[]});
      map.get(id).words.push(w);
    });
    return [...map.values()].sort((a,b)=>a.order-b.order);
  }

  function card(w){
    const tag = w.sub || w.tag || (w.folder === 'Word List' ? 'Word List' : w.folder);
    const term = String(w.term || '').trim();
    const rich = richById.get(String(w.id || '')) || richByTerm.get(term.toLowerCase()) || w;
    const wordFolder = w.folder || currentFolder;
    const group = wordFolder === '蓝色森林' ? tag : `${wordFolder} ${tag}`;
    const groupMeaning = w.perGroupMeaning?.[group] || rich.perGroupMeaning?.[group];
    const coreAllMeaning = wordFolder === '四级核心' ? String(w.coreMeaning || rich.coreMeaning || w.meaning || '').trim() : '';
    const parsed = splitMeaning(groupMeaning || coreAllMeaning || w.meaning);
    const phonetic = String(rich.phonetic || rich.ipa || w.phonetic || w.ipa || '').trim();
    const relation = currentFolder === '四级核心' ? String(rich.coreRelation || w.coreRelation || '').trim() : '';
    const chunks = (Array.isArray(rich.memoryChunks) ? rich.memoryChunks : [])
      .map((item) => ({ text: String(item?.text || item || '').trim(), meaning: String(item?.meaning || '').trim() }))
      .filter((item) => item.text).slice(0, 2);
    return `<article class="folder-word-card folder-word-card-compact-v21 ${currentFolder==='四级核心'?'folder-core-family-card':''}">
      <div class="folder-word-topline folder-word-topline-v21">
        <div class="folder-word-main folder-word-main-v21">
          <div class="folder-word-term">${esc(term)}</div>
          ${phonetic ? `<div class="folder-word-phonetic-v52">${esc(phonetic)}</div>` : ''}
          <div class="folder-core-card-tags">
            ${relation?`<span class="folder-core-relation relation-${esc(relation)}">${esc(relation)}</span>`:''}
            <span class="folder-word-chip">${esc(tag)}</span>
          </div>
        </div>
        <div class="folder-pron-actions">
          <button class="folder-pron-btn" data-pron-term="${esc(term)}" data-pron-accent="us" type="button">美</button>
          <button class="folder-pron-btn" data-pron-term="${esc(term)}" data-pron-accent="uk" type="button">英</button>
        </div>
      </div>
      <div class="folder-word-one-line folder-word-one-line-v21${currentFolder === '四级核心' ? ' folder-core-all-meaning' : ''}">
        ${parsed.pos?`<span class="folder-word-pos">${esc(parsed.pos)}</span>`:''}
        <span class="folder-word-meaning-text">${esc(parsed.meaning)}</span>
      </div>
      ${window.WordMemoryImageMemory?.render?.(rich, { compact: true }) || ''}
      ${chunks.length ? `<details class="folder-memory-chunks-v52 folder-memory-chunks-v53"><summary>高频词组 · 记忆语块（可选）</summary>${chunks.map((item, index) => `<div><b>${index + 1}</b><span>${esc(item.text)}</span>${item.meaning ? `<em>${esc(item.meaning)}</em>` : ''}</div>`).join('')}</details>` : ''}
    </article>`;
  }

  function renderCoreFamilySection(family){
    const relationMap = new Map();
    [...family.words].sort(coreCompare).forEach(w=>{
      const relation=String(w.coreRelation||'关联词').trim()||'关联词';
      if(!relationMap.has(relation)) relationMap.set(relation,[]);
      relationMap.get(relation).push(w);
    });
    const head=family.words.find(w=>w.coreRelation==='核心词') || family.words[0];
    const headMeaning=splitMeaning(String(head?.coreMeaning||head?.meaning||'')).meaning;
    return `<section class="folder-core-family-section">
      <div class="folder-core-family-head">
        <div><span>WORD FAMILY</span><h3>${esc(family.label)}</h3><p>${esc(headMeaning)} · ${family.words.length} 条，按当前资料关系集中记忆</p></div>
      </div>
      <div class="folder-core-relation-stack">
        ${[...relationMap.entries()].map(([relation,items])=>`<div class="folder-core-relation-section">
          <div class="folder-core-relation-title"><strong>${esc(relation)}</strong><span>${items.length} 条</span></div>
          <div class="folder-word-grid folder-word-grid-lite folder-word-grid-v21">${items.map(card).join('')}</div>
        </div>`).join('')}
        ${family.references?.length ? `<div class="folder-core-crossrefs"><div class="folder-core-relation-title"><strong>跨词族关联</strong><span>只提示关系，不重复计算进度</span></div><div>${family.references.map(ref=>`<span><b>${esc(ref.term)}</b><em>${esc(ref.relation)}</em></span>`).join('')}</div></div>` : ''}
      </div>
    </section>`;
  }

  function renderCoreUnitContent(words, selected){
    const allCore=(selected.words||[]).map(w=>({...w,folder:'四级核心',sub:selected.name})).sort(coreCompare);
    const families=coreFamilies(allCore);
    const familyMap=new Map(families.map(f=>[f.id,f]));
    richWords.forEach(w=>{
      (Array.isArray(w.coreCrossLinks)?w.coreCrossLinks:[]).forEach(link=>{
        const target=familyMap.get(String(link.family||''));
        if(!target) return;
        target.references=target.references||[];
        if(!target.references.some(ref=>String(ref.term||'').toLowerCase()===String(w.term||'').toLowerCase() && ref.relation===link.relation)) target.references.push({term:w.term,relation:link.relation||'关联词',meaning:link.meaning||w.coreMeaning||w.meaning||''});
      });
    });
    if(!currentCoreFamily || !families.some(f=>f.id===currentCoreFamily)) currentCoreFamily=families[0]?.id||'';
    const nav=`<div class="folder-core-family-nav"><div class="folder-core-family-nav-title"><b>按词族记</b><span>核心词 → 派生词 → 近/反义词 → 词组 → 纸上补充</span></div><div class="folder-core-family-nav-grid">${families.map(f=>`<button class="folder-core-family-btn ${f.id===currentCoreFamily?'active':''}" data-core-family="${esc(f.id)}" type="button"><b>${esc(f.label.replace(/^\d+\s*/,''))}</b><span>${f.words.length}条</span></button>`).join('')}</div></div>`;
    if(query){
      const q=query.toLowerCase();
      const hits=allCore.filter(w=>[w.term,w.meaning,w.coreMeaning,w.coreRelation,w.coreFamilyLabel].join(' ').toLowerCase().includes(q));
      const grouped=coreFamilies(hits);
      return `${nav}<div class="folder-lite-home folder-lite-home-v21"><div><strong>四级核心搜索结果</strong><p>${hits.length} 条，仍按所属词族归位显示。</p></div><span class="folder-count-pill">${hits.length}</span></div>${grouped.length?grouped.map(renderCoreFamilySection).join(''):'<div class="folder-empty">没有匹配内容</div>'}`;
    }
    const family=families.find(f=>f.id===currentCoreFamily)||families[0];
    return `${nav}<div class="folder-lite-home folder-lite-home-v21"><div><strong>${esc(selected.name)}</strong><p>当前只看一个词族，相关派生词、近反义词、词组和纸上补充全部放在一起。</p></div><span class="folder-count-pill">${family?family.words.length:0}</span></div>${family?renderCoreFamilySection(family):'<div class="folder-empty">没有内容</div>'}`;
  }

  function renderContent(){
    if(cet4Home){
      const parts=cet4Folders();
      contentBox.innerHTML=`<section class="folder-cet4-home"><div class="folder-cet4-home-head"><div><span>📁 四级</span><h3>先选一个小分区</h3><p>不再一次铺开全部 Unit 和普通四级分组。</p></div><b>${parts.reduce((sum,item)=>sum+Number(item.count||0),0)} 条归档</b></div><div class="folder-cet4-home-grid">${parts.map(item=>`<button class="folder-cet4-home-card" data-cet4-section="${esc(item.name)}" type="button"><span class="folder-cet4-home-icon">${item.name==='四级核心'?'🧩':item.name==='四级翻译'?'📝':'📚'}</span><strong>${esc(cet4DisplayName(item.name))}</strong><em>${esc(cet4FolderHint(item.name))}</em><small>${item.children.length} 组 · ${item.count} 条</small></button>`).join('')}</div></section>`;
      return;
    }
    const f=folder(); if(!f)return;
    if(!currentSub || !f.children.some(s=>s.name===currentSub)) currentSub=f.children[0]?.name||'';
    const selected=sub();
    const cet4Head=isCet4FolderName(currentFolder)?`<div class="folder-cet4-section-head"><button data-cet4-home="1" type="button">← 四级</button><div><b>${esc(cet4DisplayName(currentFolder))}</b><span>${esc(cet4FolderHint(currentFolder))}</span></div><em>${f.children.length} 组 · ${f.count} 条</em></div>`:'';
    const searchHeader=cet4Head+`<div class="folder-search-row"><input id="folderSearchInput" value="${esc(query)}" placeholder="搜索单词 / 中文 / 搭配"><span>${query?getWords().length:(selected.words||[]).length} 条</span></div><div class="folder-group-picker"><label for="folderGroupSelect">当前分组</label><select id="folderGroupSelect">${f.children.map(s=>`<option value="${esc(s.name)}" ${s.name===currentSub?'selected':''}>${esc(s.name)} · ${s.count} 条</option>`).join('')}</select><button type="button" data-folder-action="recent" title="快速打开最近补充的分组">最近补充 ↗</button></div><details class="folder-group-list"><summary>展开全部 ${f.children.length} 个分组</summary><div class="folder-subgrid">${f.children.map((s)=>`<button class="folder-sub-btn ${s.name===currentSub?'active':''}" data-folder-sub="${esc(s.name)}"><b>${esc(s.name)}</b><span>${s.count} 条</span></button>`).join('')}</div></details>`;
    if(isCoreUnit() && !query && selected.words?.length && selected.words.every(w => String(w.coreFamily || '').trim())){
      contentBox.innerHTML=searchHeader+renderCoreUnitContent(getWords(),selected)+`<details class="folder-group-list"><summary>切换分组</summary><div class="folder-bottom-group-grid">${f.children.map((s)=>`<button class="folder-bottom-sub ${s.name===currentSub?'active':''}" data-folder-sub="${esc(s.name)}" type="button">${esc(s.name)}<span>${s.count} 条</span></button>`).join('')}</div></details>`;
      return;
    }
    const words=getWords();
    if(pageStart >= words.length) pageStart = 0;
    const visible=words.slice(pageStart, pageStart + batchSize);
    const from = words.length ? pageStart + 1 : 0;
    const to = Math.min(pageStart + batchSize, words.length);
    contentBox.innerHTML=searchHeader+`
      <div class="folder-lite-home folder-lite-home-v21"><div><strong>${esc(query ? '搜索结果' : selected.name)}</strong><p>当前 ${from}-${to} / ${words.length}；只显示词性和释义。</p></div><span class="folder-count-pill">${from}-${to}</span></div>
      ${words.length ? `<div class="folder-word-grid folder-word-grid-lite folder-word-grid-v21">${visible.map(card).join('')}</div>` : '<div class="folder-empty">没有匹配内容</div>'}
      <div class="folder-bottom-switch"><div class="folder-pagination"><button type="button" data-folder-action="previous" ${pageStart===0?'disabled':''}>← 上一页</button><span>${from}–${to} / ${words.length}</span><button type="button" data-folder-action="more" ${to>=words.length?'disabled':''}>下一页 →</button></div></div>`;
  }

  function render(){renderSources();renderContent();}
  document.addEventListener('click',e=>{
    const p=e.target.closest('[data-pron-term]');
    if(p){e.preventDefault();p.classList.add('is-playing');if(typeof window.speakTerm==='function')window.speakTerm(p.dataset.pronTerm,{accent:p.dataset.pronAccent||'us'});else alert('发音模块还没加载出来，请刷新页面后再试');setTimeout(()=>p.classList.remove('is-playing'),700);return;}
    const cf=e.target.closest('[data-core-family]');
    if(cf){currentCoreFamily=cf.dataset.coreFamily||'';query='';resetPage();renderContent();return;}
    const home=e.target.closest('[data-cet4-home]');
    if(home){cet4Home=true;currentSub='';currentCoreFamily='';query='';resetPage();render();return;}
    const cet=e.target.closest('[data-cet4-section]');
    if(cet){cet4Home=false;currentFolder=cet.dataset.cet4Section;currentSub='';currentCoreFamily='';query='';resetPage();render();return;}
    const f=e.target.closest('[data-folder-source]');
    if(f){if(f.dataset.folderSource==='__cet4_parent__'){cet4Home=true;}else{cet4Home=false;currentFolder=f.dataset.folderSource;}currentSub='';currentCoreFamily='';query='';resetPage();render();return;}
    const s=e.target.closest('[data-folder-sub]');
    if(s){currentSub=s.dataset.folderSub;currentCoreFamily='';query='';resetPage();renderContent();return;}
    const a=e.target.closest('[data-folder-action]');
    if(a){
      const action=a.dataset.folderAction;
      if(action==='recent'){
        const target = ({'蓝色森林':'蓝色森林 65','四级核心':'Unit 9 Lesson 2'})[currentFolder];
        currentSub = folder().children.find(s=>s.name===target)?.name || folder().children.at(-1)?.name || '';
        currentCoreFamily='';query='';resetPage();renderContent();return;
      }
      const words=getWords();
      if(action==='more' && pageStart+batchSize<words.length) pageStart+=batchSize;
      else if(action==='previous') pageStart=Math.max(0,pageStart-batchSize);
      else return;
      renderContent();
      contentBox.querySelector('.folder-lite-home')?.scrollIntoView({block:'start'});
      contentBox.querySelector(`[data-folder-action="${action}"]:not(:disabled)`)?.focus({preventScroll:true});
    }
  });
  let searchTimer;
  function search(input){
    clearTimeout(searchTimer);
    searchTimer=setTimeout(()=>{
      if(!input.isConnected) return;
      const focused=document.activeElement===input;
      const start=input.selectionStart,end=input.selectionEnd;
      query=input.value;resetPage();renderContent();
      if(focused){const next=document.getElementById('folderSearchInput');next.focus({preventScroll:true});next.setSelectionRange(start,end);}
    },180);
  }
  document.addEventListener('input',e=>{if(e.target.id==='folderSearchInput' && !e.isComposing) search(e.target);});
  document.addEventListener('compositionstart',e=>{if(e.target.id==='folderSearchInput')clearTimeout(searchTimer);});
  document.addEventListener('compositionend',e=>{if(e.target.id==='folderSearchInput')search(e.target);});
  document.addEventListener('change',e=>{
    if(e.target.id==='folderGroupSelect'){
      clearTimeout(searchTimer);currentSub=e.target.value;currentCoreFamily='';query='';resetPage();renderContent();
      document.getElementById('folderGroupSelect')?.focus({preventScroll:true});
    }
  });
  render();
})();
