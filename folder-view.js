(function(){
  const data = window.ENGLISH_FOLDER_LIBRARY || [];
  const sourceBox = document.querySelector('#folderSourceList');
  const contentBox = document.querySelector('#folderContent');
  if (!sourceBox || !contentBox || !data.length) return;
  let currentFolder = data[0].name;
  let currentSub = data[0].children[0]?.name || '';
  let query = '';
  const batchSize = 30;
  let pageStart = 0;

  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function folder(){return data.find(x=>x.name===currentFolder)||data[0];}
  function sub(){const f=folder();return f.children.find(x=>x.name===currentSub)||f.children[0];}
  function allWords(){return data.flatMap(f=>f.children.flatMap(s=>s.words.map(w=>({...w,folder:f.name,sub:s.name}))));}
  function resetPage(){pageStart = 0;}

  function cleanNote(note){
    const n = String(note || '').trim();
    if(!n) return '';
    if(/^来源[:：]/.test(n)) return '';
    if(n.includes('按 “构词法/前缀” 背')) return '';
    return n;
  }

  function renderSources(){
    sourceBox.innerHTML=data.map(f=>`<button class="folder-source-btn ${f.name===currentFolder?'active':''}" data-folder-source="${esc(f.name)}"><span class="folder-icon">📁</span><span><strong>${esc(f.name)}</strong><span>${f.children.length} 组 · ${f.count} 条</span></span></button>`).join('');
  }

  function getWords(){
    const f=folder();
    if(!f) return [];
    if(!currentSub || !f.children.some(s=>s.name===currentSub)) currentSub=f.children[0]?.name||'';
    const selected=sub();
    let words=(query?allWords():selected.words.map(w=>({...w,folder:f.name,sub:selected.name})));
    if(query){
      const q=query.toLowerCase();
      words=words.filter(w=>[w.term,w.meaning,w.phrase,w.note,w.tag,w.folder,w.sub].join(' ').toLowerCase().includes(q));
    }
    return words;
  }

  function keepOnlyMeaning(text){
    let t = String(text || '').replace(/\s+/g, ' ').trim();
    if(!t) return '';
    // 资料夹只看“意思”：去掉例句、搭配、英文短语等额外内容。
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

  function card(w){
    const parsed = splitMeaning(w.meaning);
    const tag = w.sub || w.tag || (w.folder === 'Word List' ? 'Word List' : w.folder);
    const term = String(w.term || '').trim();
    return `<article class="folder-word-card folder-word-card-compact-v21">
      <div class="folder-word-topline folder-word-topline-v21">
        <div class="folder-word-main folder-word-main-v21">
          <div class="folder-word-term">${esc(term)}</div>
          <div class="folder-word-chip">${esc(tag)}</div>
        </div>
        <div class="folder-pron-actions">
          <button class="folder-pron-btn" data-pron-term="${esc(term)}" data-pron-accent="us" type="button">美</button>
          <button class="folder-pron-btn" data-pron-term="${esc(term)}" data-pron-accent="uk" type="button">英</button>
        </div>
      </div>
      <div class="folder-word-one-line folder-word-one-line-v21">
        ${parsed.pos?`<span class="folder-word-pos">${esc(parsed.pos)}</span>`:''}
        <span class="folder-word-meaning-text">${esc(parsed.meaning)}</span>
      </div>
    </article>`;
  }

  function renderContent(){
    const f=folder(); if(!f)return;
    if(!currentSub || !f.children.some(s=>s.name===currentSub)) currentSub=f.children[0]?.name||'';
    const words=getWords();
    if(pageStart >= words.length) pageStart = 0;
    const visible=words.slice(pageStart, pageStart + batchSize);
    const selected=sub();
    const from = words.length ? pageStart + 1 : 0;
    const to = Math.min(pageStart + batchSize, words.length);
    contentBox.innerHTML=`
      <div class="folder-search-row"><input id="folderSearchInput" value="${esc(query)}" placeholder="搜索单词 / 中文 / 搭配"><span>${words.length} 条</span></div>
      <div class="folder-subgrid">${f.children.map((s)=>`<button class="folder-sub-btn ${s.name===currentSub?'active':''}" data-folder-sub="${esc(s.name)}"><b>${esc(s.name)}</b><span>${s.count} 条</span></button>`).join('')}</div>
      <div class="folder-lite-home folder-lite-home-v21">
        <div><strong>${esc(query ? '搜索结果' : selected.name)}</strong><p>当前 ${from}-${to} / ${words.length}；只显示词性和释义。</p></div>
        <span class="folder-count-pill">${from}-${to}</span>
      </div>
      ${words.length ? `<div class="folder-word-grid folder-word-grid-lite folder-word-grid-v21">${visible.map(card).join('')}</div>` : '<div class="folder-empty">没有匹配内容</div>'}
      <div class="folder-bottom-switch">
        ${words.length > batchSize && to < words.length ? `<button class="folder-more-current" data-folder-action="more" type="button">继续看本组 ${to+1}-${Math.min(to+batchSize, words.length)}</button>` : ''}
        <div class="folder-bottom-title">切换分组</div>
        <div class="folder-bottom-group-grid">
          ${f.children.map((s)=>`<button class="folder-bottom-sub ${s.name===currentSub?'active':''}" data-folder-sub="${esc(s.name)}" type="button">${esc(s.name)}<span>${s.count} 条</span></button>`).join('')}
        </div>
      </div>`;
  }

  function render(){renderSources();renderContent();}
  document.addEventListener('click',e=>{
    const p=e.target.closest('[data-pron-term]');
    if(p){
      e.preventDefault();
      p.classList.add('is-playing');
      if (typeof window.speakTerm === 'function') {
        window.speakTerm(p.dataset.pronTerm, { accent: p.dataset.pronAccent || 'us' });
      } else {
        alert('发音模块还没加载出来，请刷新页面后再试');
      }
      setTimeout(()=>p.classList.remove('is-playing'), 700);
      return;
    }
    const f=e.target.closest('[data-folder-source]');
    if(f){currentFolder=f.dataset.folderSource;currentSub='';query='';resetPage();render();return;}
    const s=e.target.closest('[data-folder-sub]');
    if(s){currentSub=s.dataset.folderSub;query='';resetPage();renderContent();return;}
    const a=e.target.closest('[data-folder-action]');
    if(a){
      const words=getWords();
      if(a.dataset.folderAction==='more'){
        pageStart = pageStart + batchSize;
        if(pageStart >= words.length) pageStart = 0;
        renderContent();
        return;
      }
    }
  });
  document.addEventListener('input',e=>{if(e.target.id==='folderSearchInput'){query=e.target.value;resetPage();renderContent();}});
  render();
})();
