// v70 B128 2026-08-30：固定30词三分类新增词性标注；动词优先显示 vt./vi.；独立存档，不修改主学习阶段。
(function () {
  'use strict';

  const api = window.WordMemoryApp;
  if (!api) return;

  const STORAGE_KEY = 'wordMemorySpeedReviewV1';
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

  function defaultStore() {
    return {
      version: STORE_VERSION,
      updatedAt: '',
      settings: { source: 'all' },
      buckets: { known: [], meaning: [], unknown: [] },
      session: null,
    };
  }

  function sanitizeIds(ids) {
    const out = [];
    const seen = new Set();
    (Array.isArray(ids) ? ids : []).forEach((raw) => {
      const id = canonicalId(raw);
      if (!id || seen.has(id) || !api.getWord?.(id)) return;
      seen.add(id);
      out.push(id);
    });
    return out;
  }

  function normalizeBuckets(input = {}) {
    const result = { known: [], meaning: [], unknown: [] };
    const globallySeen = new Set();
    ['known', 'meaning', 'unknown'].forEach((name) => {
      sanitizeIds(input[name]).forEach((id) => {
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
      return result;
    } catch {
      return base;
    }
  }

  function saveStore() {
    store.version = STORE_VERSION;
    store.updatedAt = new Date().toISOString();
    store.buckets = normalizeBuckets(store.buckets);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch {}
    renderHub();
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
    const done = classifiedSet();
    return allWords()
      .filter((word) => sourceMatches(word, source))
      .map((word) => canonicalId(word.id))
      .filter((id, index, arr) => id && !done.has(id) && arr.indexOf(id) === index)
      .slice(0, BATCH_SIZE);
  }

  function renderHub() {
    if (els.source) els.source.value = store.settings.source || 'all';
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
    if (els.scope) els.scope.textContent = `${s.source === 'all' ? '全部词库' : s.source} · 独立分类，不改主学习阶段`;
    if (els.progressText) els.progressText.textContent = `${classified} / ${s.ids.length} 已分类`;
    if (els.progressBar) els.progressBar.style.width = `${s.ids.length ? Math.round(classified / s.ids.length * 100) : 0}%`;

    els.content.innerHTML = `<section class="quick30-batch">
      <div class="quick30-instruction"><strong>先看英文判断</strong><span>会就直接勾“会 / 认识”；卡住可显示中文，再选“看中文才会”或“不会”。</span></div>
      <div class="quick30-grid">${s.ids.map((id, index) => {
        const word = api.getWord?.(id);
        if (!word) return '';
        const status = bucketOf(id);
        const showMeaning = revealed.has(id) || status === 'meaning' || status === 'unknown';
        return `<article class="quick30-word ${status ? `is-${status}` : ''}" data-speed-word-id="${escapeHTML(id)}">
          <div class="quick30-word-head"><span>${index + 1}</span><strong>${escapeHTML(word.term)}</strong><em class="quick30-pos">${escapeHTML(wordPartOfSpeech(word))}</em></div>
          <button type="button" class="quick30-meaning" data-speed-reveal-id="${escapeHTML(id)}">${showMeaning ? escapeHTML(wordMeaning(word)) : '显示中文'}</button>
          <div class="quick30-ratings">
            <button type="button" class="known ${status === 'known' ? 'selected' : ''}" data-speed-classify="known" data-speed-id="${escapeHTML(id)}"><i>✓</i>会 / 认识</button>
            <button type="button" class="meaning ${status === 'meaning' ? 'selected' : ''}" data-speed-classify="meaning" data-speed-id="${escapeHTML(id)}"><i>◐</i>看中文才会</button>
            <button type="button" class="unknown ${status === 'unknown' ? 'selected' : ''}" data-speed-classify="unknown" data-speed-id="${escapeHTML(id)}"><i>×</i>不会</button>
          </div>
        </article>`;
      }).join('')}</div>
    </section>`;

    const disabled = stats.unclassified > 0 ? ' disabled' : '';
    els.footer.innerHTML = `<div class="quick30-footer-stats"><span>✓ 会 ${stats.known}</span><span>◐ 看义 ${stats.meaning}</span><span>× 不会 ${stats.unknown}</span><b>未分类 ${stats.unclassified}</b></div><button type="button" class="primary" data-speed-action="next-batch"${disabled}>${stats.unclassified ? `还有 ${stats.unclassified} 个未分类` : '完成本批 · 下一批30词'}</button>`;
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
    const ids = sanitizeIds(store.buckets[bucket]);
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
        if (!word) return '';
        return `<article class="quick30-word is-${escapeHTML(bucket)}">
          <div class="quick30-word-head"><span>${safePage * BATCH_SIZE + index + 1}</span><strong>${escapeHTML(word.term)}</strong><em class="quick30-pos">${escapeHTML(wordPartOfSpeech(word))}</em></div>
          <div class="quick30-bucket-meaning">${escapeHTML(wordMeaning(word))}</div>
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
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    store = defaultStore();
    renderHub();
    closeOverlay();
  }

  document.addEventListener('click', (event) => {
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
    if (value === 'resume') { openOverlay(); renderBatch(); return; }
    if (value === 'next-batch') return finishBatchAndNext();
  });

  els.source?.addEventListener('change', () => {
    store.settings.source = els.source.value || 'all';
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
    getStore: () => JSON.parse(JSON.stringify(store)),
    start: startBatch,
    storageKey: STORAGE_KEY,
  };

  saveStore();
}());
