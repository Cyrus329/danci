// v70 B181：快速复盘增加 IndexedDB 大容量镜像；localStorage 满时不再丢分类，启动时自动合并恢复。
(function () {
  'use strict';

  const api = window.WordMemoryApp;
  if (!api) return;

  const STORAGE_KEY = 'wordMemorySpeedReviewV1';
  const DURABLE_DB = 'word-memory-speed-review-v1';
  const DURABLE_STORE = 'snapshots';
  const DURABLE_KEY = 'latest';
  const STORE_VERSION = 2;
  const BATCH_SIZE = 30;
  const byId = (id) => document.getElementById(id);
  const escapeHTML = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const canonicalId = (id) => {
    let key = String(id ?? '').trim();
    const aliases = window.WORD_MEMORY_ID_ALIASES && typeof window.WORD_MEMORY_ID_ALIASES === 'object'
      ? window.WORD_MEMORY_ID_ALIASES : {};
    const seen = new Set();
    while (aliases[key] && !seen.has(key)) {
      seen.add(key);
      key = String(aliases[key]);
    }
    return key;
  };

  const els = {
    overlay: byId('speedReviewOverlay'),
    title: byId('speedReviewTitle'),
    scope: byId('speedReviewScope'),
    progressText: byId('speedReviewProgressText'),
    progressBar: byId('speedReviewProgressBar'),
    content: byId('speedReviewContent'),
    footer: byId('speedReviewFooter'),
    source: byId('speedReviewSource'),
    strategy: byId('speedReviewStrategy'),
    coach: byId('speedReviewCoach'),
    resume: byId('speedReviewResume'),
    knownCount: byId('speedReviewKnownCount'),
    meaningCount: byId('speedReviewMeaningCount'),
    unknownCount: byId('speedReviewUnknownCount'),
  };

  const bucketMeta = {
    known: { label: '会 / 认识', mark: '✓', className: 'known' },
    meaning: { label: '看中文才会', mark: '◐', className: 'meaning' },
    unknown: { label: '不会', mark: '×', className: 'unknown' },
  };

  let store = loadStore();

  function openDurableDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
      const request = indexedDB.open(DURABLE_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DURABLE_STORE)) db.createObjectStore(DURABLE_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
      request.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }
  async function readDurableStore() {
    const db = await openDurableDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(DURABLE_STORE, 'readonly');
        const request = tx.objectStore(DURABLE_STORE).get(DURABLE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
      });
    } finally { db.close(); }
  }
  async function writeDurableStore(snapshot) {
    const db = await openDurableDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DURABLE_STORE, 'readwrite');
        tx.objectStore(DURABLE_STORE).put(JSON.parse(JSON.stringify(snapshot)), DURABLE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB write aborted'));
      });
    } finally { db.close(); }
  }

  function defaultStore() {
    return {
      version: STORE_VERSION,
      updatedAt: '',
      settings: { source: 'all', strategy: 'smart' },
      buckets: { known: [], meaning: [], unknown: [] },
      session: null,
    };
  }

  function sanitizeIds(ids, options = {}) {
    const out = [];
    const seen = new Set();
    (Array.isArray(ids) ? ids : []).forEach((raw) => {
      const id = canonicalId(raw);
      if (!id || seen.has(id) || (!options.keepMissing && !api.getWord?.(id))) return;
      seen.add(id);
      out.push(id);
    });
    return out;
  }

  function normalizeBuckets(input = {}) {
    const result = { known: [], meaning: [], unknown: [] };
    const globallySeen = new Set();
    ['known', 'meaning', 'unknown'].forEach((name) => {
      sanitizeIds(input[name], { keepMissing: true }).forEach((id) => {
        if (globallySeen.has(id)) return;
        globallySeen.add(id);
        result[name].push(id);
      });
    });
    return result;
  }

  function loadStore() {
    const base = defaultStore();
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!parsed || typeof parsed !== 'object') return base;
      // B126 migration: old “weakIds” are retained as “不会”; old known words were never stored, so cannot be guessed.
      const migratedUnknown = [
        ...(Array.isArray(parsed?.buckets?.unknown) ? parsed.buckets.unknown : []),
        ...(Array.isArray(parsed.weakIds) ? parsed.weakIds : []),
      ];
      const buckets = normalizeBuckets({
        known: parsed?.buckets?.known || [],
        meaning: parsed?.buckets?.meaning || [],
        unknown: migratedUnknown,
      });
      const result = {
        ...base,
        ...parsed,
        version: STORE_VERSION,
        settings: { ...base.settings, ...(parsed.settings || {}) },
        buckets,
      };
      if (result.session?.kind === 'batch') {
        result.session.ids = sanitizeIds(result.session.ids).slice(0, BATCH_SIZE);
        result.session.revealedIds = sanitizeIds(result.session.revealedIds);
      } else {
        result.session = null;
      }
      delete result.weakIds;
      delete result.stats;
      result.entryUpdatedAt ||= {};
      for (const ids of Object.values(result.buckets)) for (const id of ids) {
        result.entryUpdatedAt[id] ||= result.updatedAt || '1970-01-01T00:00:00.001Z';
      }
      return result;
    } catch {
      return base;
    }
  }

  function saveStore() {
    // Combine independently saved classifications before writing this tab's state.
    store = window.mergeSpeedReviewSnapshots(loadStore(), store);
    store.version = STORE_VERSION;
    store.updatedAt = new Date().toISOString();
    store.buckets = normalizeBuckets(store.buckets);
    let localSaved = false;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); localSaved = true; }
    catch {}
    const snapshot = JSON.parse(JSON.stringify(store));
    writeDurableStore(snapshot).catch(() => {
      if (!localSaved) api.showToast?.('快速复盘双重存档均失败，请立即导出备份后再刷新');
    });
    renderHub();
  }

  async function restoreDurableStore() {
    try {
      const durable = await readDurableStore();
      if (durable && typeof durable === 'object') store = window.mergeSpeedReviewSnapshots(store, durable);
      store.buckets = normalizeBuckets(store.buckets);
      store.version = STORE_VERSION;
      store.updatedAt ||= new Date().toISOString();
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch {}
      await writeDurableStore(store);
      renderHub();
    } catch {
      // localStorage remains usable when IndexedDB is unavailable.
    }
  }

  function allWords() {
    return Array.isArray(api.getWords?.()) ? api.getWords() : [];
  }


  function wordPartOfSpeech(word) {
    const text = String(word?.meaning || "").replace(/（[^）]*）/g, " ");
    const found = [];
    const push = (x) => { if (x && !found.includes(x)) found.push(x); };
    if (/(^|[；;\s])vt\./i.test(text)) push("vt.");
    if (/(^|[；;\s])vi\./i.test(text)) push("vi.");
    if (!found.some((x) => x === "vt." || x === "vi.") && /(^|[；;\s])v\./i.test(text)) push("v.（未分 vt./vi.）");
    if (/(^|[；;\s])n\./i.test(text)) push("n.");
    if (/(^|[；;\s])adj\./i.test(text)) push("adj.");
    if (/(^|[；;\s])adv\./i.test(text)) push("adv.");
    if (/(^|[；;\s])prep\./i.test(text)) push("prep.");
    if (/(^|[；;\s])conj\./i.test(text)) push("conj.");
    if (/(^|[；;\s])pron\./i.test(text)) push("pron.");
    if (/(^|[；;\s])num\./i.test(text)) push("num.");
    return found.length ? found.join(" / ") : "词性未标注";
  }

  function wordMeaning(word) {
    return String(word?.meaning || '未填中文释义').trim();
  }

  function wordSources(word) {
    return [...new Set([
      ...(api.wordSources?.(word) || []),
      ...(api.wordGroupNames?.(word) || []),
    ].map((item) => String(item || '').trim()).filter(Boolean))];
  }

  function sourceMatches(word, source) {
    if (!source || source === 'all') return true;
    return wordSources(word).some((item) => item === source || item.startsWith(source + ' '));
  }

  function cardProgress(word) {
    return word?.progress?.card || word || {};
  }

  function priorityScore(word, strategy, originalIndex) {
    const progress = cardProgress(word);
    const stage = Number.isInteger(progress.stage) ? progress.stage : -1;
    const last = Date.parse(progress.lastStudiedAt || word?.lastStudiedAt || '') || 0;
    const ageDays = last ? Math.max(0, (Date.now() - last) / 86400000) : 30;
    const weak = progress.status === 'learning' || stage < 4;
    if (strategy === 'original') return -originalIndex;
    if (strategy === 'recent') return (last || 0) - originalIndex / 100000;
    if (strategy === 'weak') return (weak ? 100000 : 0) + (word?.important ? 1000 : 0) + ageDays - originalIndex / 100000;
    return (weak ? 100000 : 0) + (word?.important ? 2500 : 0) + Math.min(ageDays, 60) * 10 - originalIndex / 100000;
  }

  function classifiedSet() {
    return new Set([
      ...store.buckets.known,
      ...store.buckets.meaning,
      ...store.buckets.unknown,
    ].map(String));
  }

  function bucketOf(id) {
    const target = String(id);
    for (const name of ['known', 'meaning', 'unknown']) {
      if (store.buckets[name].some((item) => String(item) === target)) return name;
    }
    return '';
  }

  function setBucket(id, bucket) {
    const target = canonicalId(id);
    if (!target || !bucketMeta[bucket] || !api.getWord?.(target)) return;
    ['known', 'meaning', 'unknown'].forEach((name) => {
      store.buckets[name] = store.buckets[name].filter((item) => String(item) !== target);
    });
    store.buckets[bucket].push(target);
    store.entryUpdatedAt ||= {};
    store.entryUpdatedAt[target] = new Date().toISOString();
    if (bucket === 'unknown') {
      // “不会”表示重新开始该词的主学习链；快速复盘本身仍独立保存。
      api.resetWordLearningProgress?.(target, { reason: 'speed-review-unknown' });
    }
    if (store.session?.kind === 'batch' && bucket !== 'known') {
      const revealed = new Set(store.session.revealedIds || []);
      revealed.add(target);
      store.session.revealedIds = [...revealed];
    }
    api.recordCheckIn?.({
      time: new Date().toISOString(),
      wordId: target,
      result: `speed-quick30-${bucket}`,
      source: 'speed:quick30',
    });
    saveStore();
  }

  function nextBatchIds() {
    const source = els.source?.value || store.settings.source || 'all';
    const strategy = els.strategy?.value || store.settings.strategy || 'smart';
    const done = classifiedSet();
    return allWords()
      .filter((word) => sourceMatches(word, source))
      .map((word, index) => ({ word, index, id: canonicalId(word.id) }))
      .filter((item, index, arr) => item.id && !done.has(item.id) && arr.findIndex((x) => x.id === item.id) === index)
      .sort((a, b) => priorityScore(b.word, strategy, b.index) - priorityScore(a.word, strategy, a.index))
      .map((item) => item.id)
      .slice(0, BATCH_SIZE);
  }

  function renderHub() {
    if (els.source) els.source.value = store.settings.source || 'all';
    if (els.strategy) els.strategy.value = store.settings.strategy || 'smart';
    if (els.knownCount) els.knownCount.textContent = String(store.buckets.known.length);
    if (els.meaningCount) els.meaningCount.textContent = String(store.buckets.meaning.length);
    if (els.unknownCount) els.unknownCount.textContent = String(store.buckets.unknown.length);
    if (els.resume) {
      const s = store.session;
      if (s?.kind === 'batch' && Array.isArray(s.ids) && s.ids.length) {
        const classified = s.ids.filter((id) => bucketOf(id)).length;
        els.resume.innerHTML = `<button type="button" data-speed-action="resume">继续本批30词 · ${classified}/${s.ids.length} 已分类</button>`;
      } else {
        els.resume.textContent = '暂无未完成的30词';
      }
    }
    if (els.coach) {
      const unknown = store.buckets.unknown.length;
      const meaning = store.buckets.meaning.length;
      els.coach.innerHTML = `<span class="quick30-coach-icon">◎</span><div><strong>${unknown ? `今天先回炉 ${unknown} 个“不会”词` : meaning ? `今天先巩固 ${meaning} 个“看中文才会”词` : '推荐流程：先回想，再看中文，最后按真实掌握度分类'}</strong><small>${unknown ? '每次只练30个；答错后先尝试拼写或造一个短句，再看答案。' : '每轮30词；分类结果会保留，下一轮自动跳过已经稳定掌握的词。'}</small></div>`;
    }
  }

  function openOverlay() {
    if (!els.overlay) return;
    els.overlay.hidden = false;
    document.documentElement.classList.add('speed-review-open');
  }

  function closeOverlay() {
    if (els.overlay) els.overlay.hidden = true;
    document.documentElement.classList.remove('speed-review-open');
    saveStore();
  }

  function startBatch() {
    store.settings.source = els.source?.value || 'all';
    const ids = nextBatchIds();
    if (!ids.length) {
      store.session = null;
      saveStore();
      openOverlay();
      if (els.title) els.title.textContent = '当前范围已全部分类';
      if (els.scope) els.scope.textContent = store.settings.source === 'all' ? '全部词库' : store.settings.source;
      if (els.progressText) els.progressText.textContent = '完成';
      if (els.progressBar) els.progressBar.style.width = '100%';
      if (els.content) els.content.innerHTML = `<section class="quick30-empty"><span>✓</span><h2>这一范围已经全部过完</h2><p>会的不会再出现；“看中文才会”和“不会”请从三个分类池里单独查看或重新分类。</p></section>`;
      if (els.footer) els.footer.innerHTML = '<button type="button" data-speed-action="close">返回快速复盘</button>';
      return;
    }
    store.session = {
      kind: 'batch',
      ids,
      source: store.settings.source,
      strategy: store.settings.strategy || 'smart',
      revealedIds: [],
      startedAt: new Date().toISOString(),
    };
    saveStore();
    openOverlay();
    renderBatch();
  }

  function batchStats() {
    const ids = store.session?.ids || [];
    const counts = { known: 0, meaning: 0, unknown: 0, unclassified: 0 };
    ids.forEach((id) => {
      const bucket = bucketOf(id);
      if (bucket && counts[bucket] !== undefined) counts[bucket] += 1;
      else counts.unclassified += 1;
    });
    return counts;
  }

  function toggleReveal(id) {
    const s = store.session;
    if (!s?.ids?.includes(id)) return;
    const set = new Set(s.revealedIds || []);
    if (set.has(id)) set.delete(id); else set.add(id);
    s.revealedIds = [...set];
    saveStore();
    renderBatch();
  }

  function renderBatch() {
    const s = store.session;
    if (!s || s.kind !== 'batch' || !els.content) return;
    const stats = batchStats();
    const classified = s.ids.length - stats.unclassified;
    const revealed = new Set(s.revealedIds || []);
    if (els.title) els.title.textContent = '新的30词';
    if (els.scope) els.scope.textContent = `${s.source === 'all' ? '全部词库' : s.source} · ${s.strategy === 'weak' ? '薄弱词优先' : s.strategy === 'recent' ? '最近学习优先' : s.strategy === 'original' ? '原始顺序' : '智能混合'} · 独立分类`;
    if (els.progressText) els.progressText.textContent = `${classified} / ${s.ids.length} 已分类`;
    if (els.progressBar) els.progressBar.style.width = `${s.ids.length ? Math.round(classified / s.ids.length * 100) : 0}%`;

    els.content.innerHTML = `<section class="quick30-batch">
      <div class="quick30-instruction"><strong>先看英文判断</strong><span>会就直接勾“会 / 认识”；卡住可显示中文，再选“看中文才会”或“不会”。</span></div>
      <div class="quick30-grid">${s.ids.map((id, index) => {
        const word = api.getWord?.(id);
        if (!word) return `<article class="quick30-word"><div class="quick30-word-head"><span>${index + 1}</span><strong>词条已移除</strong></div><div class="quick30-bucket-meaning">该分类记录已保留，但当前词库没有此词条</div></article>`;
        const status = bucketOf(id);
        const showMeaning = revealed.has(id) || status === 'meaning' || status === 'unknown';
        return `<article class="quick30-word ${status ? `is-${status}` : ''}" data-speed-word-id="${escapeHTML(id)}">
          <div class="quick30-word-head"><span>${index + 1}</span><strong>${escapeHTML(word.term)}</strong><em class="quick30-pos">${escapeHTML(wordPartOfSpeech(word))}</em></div>
          <button type="button" class="quick30-meaning" data-speed-reveal-id="${escapeHTML(id)}">${showMeaning ? escapeHTML(wordMeaning(word)) : '显示中文'}</button>
          <p>${escapeHTML(word.phonetic || window.PronunciationSupport?.local(word.term) || "") || `<span data-ipa-term="${escapeHTML(word.term)}">正在查音标…</span>`}</p><div><button type="button" data-speed-audio="uk" data-speed-id="${escapeHTML(id)}">英音</button><button type="button" data-speed-audio="us" data-speed-id="${escapeHTML(id)}">美音</button><button type="button" data-speed-audio="system" data-speed-id="${escapeHTML(id)}">系统朗读</button></div><div class="quick30-ratings">
            <button type="button" class="known ${status === 'known' ? 'selected' : ''}" data-speed-classify="known" data-speed-id="${escapeHTML(id)}"><i>✓</i>会 / 认识</button>
            <button type="button" class="meaning ${status === 'meaning' ? 'selected' : ''}" data-speed-classify="meaning" data-speed-id="${escapeHTML(id)}"><i>◐</i>看中文才会</button>
            <button type="button" class="unknown ${status === 'unknown' ? 'selected' : ''}" data-speed-classify="unknown" data-speed-id="${escapeHTML(id)}"><i>×</i>不会</button>
          </div>
        </article>`;
      }).join('')}</div>
    </section>`;

    const disabled = stats.unclassified > 0 ? ' disabled' : '';
    els.footer.innerHTML = `<div class="quick30-footer-stats"><span>✓ 会 ${stats.known}</span><span>◐ 看义 ${stats.meaning}</span><span>× 不会 ${stats.unknown}</span><b>未分类 ${stats.unclassified}</b></div><div class="quick30-footer-actions"><button type="button" data-speed-action="quick-finish-batch">一键记完本批</button><button type="button" class="primary" data-speed-action="next-batch"${disabled}>${stats.unclassified ? `还有 ${stats.unclassified} 个未分类` : '完成本批 · 下一批30词'}</button></div>`;
  }

  function quickFinishBatch() {
    const ids = store.session?.ids || [];
    if (!ids.length) return;
    if (!confirm('将本批词全部记为“会 / 认识”，只影响快速复盘分类，不改变主学习进度。继续吗？')) return;
    ids.forEach((id) => setBucket(id, 'known'));
    finishBatchAndNext();
  }

  function finishBatchAndNext() {
    const stats = batchStats();
    if (stats.unclassified) return;
    store.session = null;
    saveStore();
    startBatch();
  }

  function openBucket(bucket) {
    if (!bucketMeta[bucket]) return;
    store.session = null;
    saveStore();
    openOverlay();
    renderBucket(bucket, 0);
  }

  function renderBucket(bucket, page = 0) {
    const meta = bucketMeta[bucket];
    if (!meta || !els.content) return;
    const ids = sanitizeIds(store.buckets[bucket], { keepMissing: true });
    store.buckets[bucket] = ids;
    const totalPages = Math.max(1, Math.ceil(ids.length / BATCH_SIZE));
    const safePage = Math.min(Math.max(0, page), totalPages - 1);
    const pageIds = ids.slice(safePage * BATCH_SIZE, (safePage + 1) * BATCH_SIZE);
    if (els.title) els.title.textContent = meta.label;
    if (els.scope) els.scope.textContent = `独立分类池 · 共 ${ids.length} 词`;
    if (els.progressText) els.progressText.textContent = ids.length ? `第 ${safePage + 1} / ${totalPages} 页` : '0 词';
    if (els.progressBar) els.progressBar.style.width = ids.length ? `${Math.round((safePage + 1) / totalPages * 100)}%` : '0%';
    els.content.innerHTML = ids.length ? `<section class="quick30-bucket-view">
      <div class="quick30-instruction"><strong>${escapeHTML(meta.mark)} ${escapeHTML(meta.label)}</strong><span>这里每页最多30词，可随时重新分到另外两类。</span></div>
      <div class="quick30-grid">${pageIds.map((id, index) => {
        const word = api.getWord?.(id);
        if (!word) return `<article class=\"quick30-word is-${escapeHTML(bucket)}\"><div class=\"quick30-word-head\"><span>${safePage * BATCH_SIZE + index + 1}</span><strong>词条已移除</strong></div><div class=\"quick30-bucket-meaning\">该分类记录已保留，但当前词库没有此词条</div></article>`;
        return `<article class="quick30-word is-${escapeHTML(bucket)}">
          <div class="quick30-word-head"><span>${safePage * BATCH_SIZE + index + 1}</span><strong>${escapeHTML(word.term)}</strong><em class="quick30-pos">${escapeHTML(wordPartOfSpeech(word))}</em></div>
          <div class="quick30-bucket-meaning">${escapeHTML(wordMeaning(word))}</div>
          <p>${escapeHTML(word.phonetic || window.PronunciationSupport?.local(word.term) || '') || `<span data-ipa-term="${escapeHTML(word.term)}">正在查音标…</span>`}</p>
          <div><button type="button" data-speed-audio="uk" data-speed-id="${escapeHTML(id)}">英音</button><button type="button" data-speed-audio="us" data-speed-id="${escapeHTML(id)}">美音</button><button type="button" data-speed-audio="system" data-speed-id="${escapeHTML(id)}">系统朗读</button></div>
          <div class="quick30-ratings">
            <button type="button" class="known ${bucket === 'known' ? 'selected' : ''}" data-speed-bucket-classify="known" data-speed-id="${escapeHTML(id)}" data-speed-current-bucket="${escapeHTML(bucket)}" data-speed-page="${safePage}"><i>✓</i>会 / 认识</button>
            <button type="button" class="meaning ${bucket === 'meaning' ? 'selected' : ''}" data-speed-bucket-classify="meaning" data-speed-id="${escapeHTML(id)}" data-speed-current-bucket="${escapeHTML(bucket)}" data-speed-page="${safePage}"><i>◐</i>看中文才会</button>
            <button type="button" class="unknown ${bucket === 'unknown' ? 'selected' : ''}" data-speed-bucket-classify="unknown" data-speed-id="${escapeHTML(id)}" data-speed-current-bucket="${escapeHTML(bucket)}" data-speed-page="${safePage}"><i>×</i>不会</button>
          </div>
        </article>`;
      }).join('')}</div>
    </section>` : `<section class="quick30-empty"><span>${escapeHTML(meta.mark)}</span><h2>${escapeHTML(meta.label)}池还是空的</h2><p>完成新的30词后，对应词会自动归到这里。</p></section>`;
    els.footer.innerHTML = `<button type="button" data-speed-action="close">返回</button>${ids.length ? `<div class="quick30-page-actions"><button type="button" data-speed-bucket-page="${escapeHTML(bucket)}" data-speed-page="${Math.max(0, safePage - 1)}" ${safePage === 0 ? 'disabled' : ''}>上一页</button><button type="button" class="primary" data-speed-bucket-page="${escapeHTML(bucket)}" data-speed-page="${Math.min(totalPages - 1, safePage + 1)}" ${safePage >= totalPages - 1 ? 'disabled' : ''}>下一页30词</button></div>` : ''}`;
    saveStore();
  }

  function clearStore() {
    if (!confirm('只清空“30词快速复盘”的三类记录？不会影响主卡片、全词独立练习或Peppa进度。')) return;
    store = defaultStore();
    store.clearedAt = new Date().toISOString();
    saveStore();
    renderHub();
    closeOverlay();
  }

  document.addEventListener('click', (event) => {
    const audio = event.target.closest('[data-speed-audio]');
    if (audio) {
      const word = api.getWord?.(audio.dataset.speedId);
      if (word) window.speakTerm(word.term, {accent:audio.dataset.speedAudio === 'us' ? 'us' : 'uk', preferSystem:audio.dataset.speedAudio === 'system'});
      return;
    }
    const start = event.target.closest('[data-speed-start="batch"]');
    if (start) { startBatch(); return; }

    const bucketOpen = event.target.closest('[data-speed-bucket]');
    if (bucketOpen) { openBucket(bucketOpen.dataset.speedBucket); return; }

    const classify = event.target.closest('[data-speed-classify]');
    if (classify) {
      setBucket(classify.dataset.speedId, classify.dataset.speedClassify);
      renderBatch();
      return;
    }

    const bucketClassify = event.target.closest('[data-speed-bucket-classify]');
    if (bucketClassify) {
      const current = bucketClassify.dataset.speedCurrentBucket;
      const page = Number(bucketClassify.dataset.speedPage || 0);
      setBucket(bucketClassify.dataset.speedId, bucketClassify.dataset.speedBucketClassify);
      renderBucket(current, page);
      return;
    }

    const reveal = event.target.closest('[data-speed-reveal-id]');
    if (reveal) { toggleReveal(reveal.dataset.speedRevealId); return; }

    const page = event.target.closest('[data-speed-bucket-page]');
    if (page) {
      renderBucket(page.dataset.speedBucketPage, Number(page.dataset.speedPage || 0));
      return;
    }

    const action = event.target.closest('[data-speed-action]');
    if (!action) return;
    const value = action.dataset.speedAction;
    if (value === 'close') return closeOverlay();
    if (value === 'clear-store') return clearStore();
    if (value === 'quick-finish-batch') return quickFinishBatch();
    if (value === 'resume') { openOverlay(); renderBatch(); return; }
    if (value === 'next-batch') return finishBatchAndNext();
  });

  els.source?.addEventListener('change', () => {
    store.settings.source = els.source.value || 'all';
    saveStore();
  });
  els.strategy?.addEventListener('change', () => {
    store.settings.strategy = els.strategy.value || 'smart';
    saveStore();
  });
  window.addEventListener('keydown', (event) => {
    if (!els.overlay || els.overlay.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); closeOverlay(); }
  });

  window.SpeedReviewApp = {
    open: () => {
      if (store.session?.kind === 'batch') { openOverlay(); renderBatch(); }
    },
    getStore: () => JSON.parse(JSON.stringify(window.mergeSpeedReviewSnapshots(loadStore(),store))),
    exportState: () => JSON.parse(JSON.stringify(window.mergeSpeedReviewSnapshots(loadStore(),store))),
    importState: (snapshot) => {
      if (!snapshot || typeof snapshot !== 'object') return false;
      const base = defaultStore();
      store = window.mergeSpeedReviewSnapshots(loadStore(), {
        ...base,
        ...snapshot,
        version: STORE_VERSION,
        settings: { ...base.settings, ...(snapshot.settings || {}) },
        buckets: normalizeBuckets(snapshot.buckets || {}),
      });
      if (store.session?.kind === 'batch') {
        store.session.ids = sanitizeIds(store.session.ids, { keepMissing: true }).slice(0, BATCH_SIZE);
        store.session.revealedIds = sanitizeIds(store.session.revealedIds, { keepMissing: true });
      } else store.session = null;
      saveStore();
      return true;
    },
    start: startBatch,
    storageKey: STORAGE_KEY,
  };

  window.addEventListener('word-memory-backup-imported', (event) => {
    if (event.detail?.speedReview) window.SpeedReviewApp.importState(event.detail.speedReview);
  });
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    store = window.mergeSpeedReviewSnapshots(store, loadStore());
    renderHub();
  });

  saveStore();
  restoreDurableStore();
}());
