(function(){
  const panel = document.querySelector('#smartVocabPanel');
  const box = document.querySelector('#smartVocabContent');
  if(!panel || !box) return;
  const lib = window.ENGLISH_FOLDER_LIBRARY || [];
  const words = lib.flatMap(folder => (folder.children||[]).flatMap(group => (group.words||[]).map(w => ({...w, folder: folder.name, group: group.name}))));
  if(!words.length){ panel.hidden = true; return; }
  let active = 'affix';
  let activeKey = '';
  let limit = 40;
  const esc = s => String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm = s => String(s||'').trim().toLowerCase();
  const uniqueByTerm = list => [...new Map(list.filter(w=>norm(w.term)).map(w=>[norm(w.term),w])).values()];

  const affixes = [
    {key:'前缀 re-', test:t=>t.startsWith('re'), tip:'again / back，表示再、回'},
    {key:'前缀 un-', test:t=>t.startsWith('un'), tip:'not，表示否定'},
    {key:'前缀 in-/im-/il-/ir-', test:t=>/^(in|im|il|ir)/.test(t), tip:'not / into，常见否定或进入'},
    {key:'前缀 dis-', test:t=>t.startsWith('dis'), tip:'not / opposite，表示否定、相反'},
    {key:'前缀 pre-', test:t=>t.startsWith('pre'), tip:'before，表示以前、预先'},
    {key:'前缀 pro-', test:t=>t.startsWith('pro'), tip:'forward，表示向前、支持'},
    {key:'前缀 trans-', test:t=>t.startsWith('trans'), tip:'across，表示穿过、转变'},
    {key:'后缀 -tion/-sion', test:t=>/(tion|sion)$/.test(t), tip:'名词后缀，动作或结果'},
    {key:'后缀 -ment', test:t=>/ment$/.test(t), tip:'名词后缀，行为或结果'},
    {key:'后缀 -ness', test:t=>/ness$/.test(t), tip:'名词后缀，性质、状态'},
    {key:'后缀 -able/-ible', test:t=>/(able|ible)$/.test(t), tip:'形容词后缀，可以……的'},
    {key:'后缀 -ly', test:t=>/ly$/.test(t), tip:'副词后缀，……地'},
    {key:'后缀 -er/-or', test:t=>/(er|or)$/.test(t), tip:'人或物，执行者'},
    {key:'词根 port', test:t=>t.includes('port'), tip:'carry，搬运、港口、输入输出'},
    {key:'词根 form', test:t=>t.includes('form'), tip:'shape，形式、形成'},
    {key:'词根 spect', test:t=>t.includes('spect'), tip:'look，看、观察'},
    {key:'词根 dict', test:t=>t.includes('dict'), tip:'say，说、断言'},
    {key:'词根 scrib/script', test:t=>/(scrib|script)/.test(t), tip:'write，写'},
  ];

  function affixGroups(){
    return affixes.map(a=>({
      name:a.key, tip:a.tip,
      words: uniqueByTerm(words.filter(w=>a.test(norm(w.term).replace(/[^a-z-]/g,''))))
    })).filter(g=>g.words.length);
  }
  function similarGroups(){
    const buckets = new Map();
    uniqueByTerm(words).forEach(w=>{
      const t=norm(w.term).replace(/[^a-z]/g,'');
      if(t.length<4) return;
      const key=t.slice(0,3);
      if(!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(w);
    });
    return [...buckets.entries()].map(([key,list])=>({name:`${key} 开头形近词`, tip:'开头相近，容易看错或拼错', words:list}))
      .filter(g=>g.words.length>=2)
      .sort((a,b)=>b.words.length-a.words.length)
      .slice(0,30);
  }
  const synonymSeeds = [
    {name:'重要 / 强调', keys:['重要','强调','重点','significant','important']},
    {name:'帮助 / 支持', keys:['帮助','支持','assist','support','help']},
    {name:'改变 / 转变', keys:['改变','转变','变化','change','convert','transform']},
    {name:'完成 / 实现', keys:['完成','实现','达到','finish','complete','achieve']},
    {name:'影响 / 作用', keys:['影响','作用','effect','affect','influence']},
    {name:'提高 / 进步', keys:['提高','进步','改善','improve','progress']},
    {name:'减少 / 降低', keys:['减少','降低','decrease','reduce']},
    {name:'需要 / 要求', keys:['需要','要求','require','demand','need']},
    {name:'普通 / 一般', keys:['普通','一般','ordinary','common','general']},
    {name:'不同 / 区别', keys:['不同','区别','different','difference']},
  ];
  function synonymGroups(){
    return synonymSeeds.map(seed=>({
      name:seed.name, tip:'意思接近，适合放一起辨析',
      words: uniqueByTerm(words.filter(w=>seed.keys.some(k=>`${w.term} ${w.meaning} ${w.phrase} ${w.note}`.toLowerCase().includes(String(k).toLowerCase()))))
    })).filter(g=>g.words.length>=2);
  }
  const familyRoots = [
    ['act', 'act / active / action 一组'], ['form', 'form / inform / perform 一组'], ['port', 'port / import / export 一组'],
    ['press', 'press / express / pressure 一组'], ['spect', 'spect / inspect / respect 一组'], ['struct', 'struct / construct / instruction 一组'],
    ['duce', 'duce / produce / reduce 一组'], ['sign', 'sign / signal / significant 一组'], ['dict', 'dict / predict / dictionary 一组']
  ];
  function familyGroups(){
    return familyRoots.map(([root,name])=>({name, tip:'同一词根或同族词，放一起记更快', words:uniqueByTerm(words.filter(w=>norm(w.term).includes(root))) }))
      .filter(g=>g.words.length>=2);
  }
  function polysemyGroups(){
    const candidates = uniqueByTerm(words.filter(w=>/[；;]|一词多义|多义|熟词僻义/.test(`${w.meaning} ${w.note}`) || String(w.meaning||'').split(/[，,；;]/).filter(Boolean).length>=3));
    return [{name:'一词多义集中刷', tip:'一个词多个常考意思，适合阅读和完形', words:candidates}].filter(g=>g.words.length);
  }
  function collocationGroups(){
    const buckets = new Map();
    uniqueByTerm(words.filter(w=>String(w.phrase||'').trim())).forEach(w=>{
      const first = norm(w.phrase).split(/\s+/)[0] || '短语';
      const key = ['be','look','take','make','give','come','go','get','put','according','because','in','on','at','for','to'].includes(first) ? `${first} 搭配` : '常见固定搭配';
      if(!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(w);
    });
    return [...buckets.entries()].map(([name,list])=>({name, tip:'固定搭配只速记，不再做填空', words:list})).filter(g=>g.words.length).sort((a,b)=>b.words.length-a.words.length);
  }
  function groups(){
    if(active==='affix') return affixGroups();
    if(active==='similar') return similarGroups();
    if(active==='synonym') return synonymGroups();
    if(active==='family') return familyGroups();
    if(active==='polysemy') return polysemyGroups();
    if(active==='collocation') return collocationGroups();
    return affixGroups();
  }
  function render(){
    const gs=groups();
    if(!activeKey || !gs.some(g=>g.name===activeKey)) activeKey=gs[0]?.name||'';
    const g=gs.find(x=>x.name===activeKey);
    const list=(g?.words||[]).slice(0,limit);
    box.innerHTML=`
      <div class="smart-layout">
        <div class="smart-group-list">${gs.map(item=>`<button class="smart-group-btn ${item.name===activeKey?'active':''}" data-smart-key="${esc(item.name)}"><b>${esc(item.name)}</b><span>${item.words.length} 个 · ${esc(item.tip)}</span></button>`).join('')}</div>
        <div class="smart-detail">
          ${g?`<div class="smart-detail-head"><h3>${esc(g.name)}</h3><p>${esc(g.tip)}</p></div>`:'<p>暂无可归类内容</p>'}
          <div class="smart-word-grid">${list.map(w=>`<article class="smart-word-card"><strong>${esc(w.term)}</strong><p>${esc(w.meaning)}</p>${w.phrase?`<details><summary>例句 / 搭配</summary><p>${esc(w.phrase)}</p></details>`:''}<span>${esc(w.folder)} / ${esc(w.group)}</span></article>`).join('')}</div>
          ${g && g.words.length>list.length?`<button class="secondary-button" data-smart-more type="button">再显示 40 个</button>`:''}
        </div>
      </div>`;
  }
  document.addEventListener('click', e=>{
    const tab=e.target.closest('[data-smart-tab]');
    if(tab){ active=tab.dataset.smartTab; activeKey=''; limit=40; document.querySelectorAll('[data-smart-tab]').forEach(b=>b.classList.toggle('active', b===tab)); render(); return; }
    const key=e.target.closest('[data-smart-key]');
    if(key){ activeKey=key.dataset.smartKey; limit=40; render(); return; }
    if(e.target.closest('[data-smart-more]')){ limit+=40; render(); return; }
  });
  render();
})();
