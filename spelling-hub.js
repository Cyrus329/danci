// v70 B180：同一英文答案跨词库/专项共享拼写记录，旧ID记录自动合并；沿用1→2→4→7→14→30天拼写回炉。
(function () {
  'use strict';

  const STORE_KEY = 'wordMemorySpellingLabV2';
  const PENDING_KEY = 'wordMemorySpellingLabPendingV2';
  const VERSION = 6;
  const TERM_KEY_PREFIX = 'term:';
  const ERROR_RETRY_MS = 5 * 60 * 1000;
  const SCHEDULE = [
    { key: '1d', label: '1天后', ms: 24 * 60 * 60 * 1000 },
    { key: '2d', label: '2天后', ms: 2 * 24 * 60 * 60 * 1000 },
    { key: '4d', label: '4天后', ms: 4 * 24 * 60 * 60 * 1000 },
    { key: '7d', label: '7天后', ms: 7 * 24 * 60 * 60 * 1000 },
    { key: '14d', label: '14天后', ms: 14 * 24 * 60 * 60 * 1000 },
    { key: '30d', label: '30天后', ms: 30 * 24 * 60 * 60 * 1000 },
  ];
  const ERROR_LABELS = {
    omission: '漏字母', extra: '多字母', transpose: '字母顺序', ending: '词尾变化',
    double: '双写', punctuation: '符号/连字符', substitution: '字母写错', order: '字母顺序',
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    kind: $('spellingHubKind'), source: $('spellingHubSource'), group: $('spellingHubGroup'),
    status: $('spellingHubStatus'), limit: $('spellingHubLimit'), start: $('spellingHubStart'), weak: $('spellingHubWeakStart'),
    today: $('spellingHubTodayStart'), mistake: $('spellingHubMistakeStart'), family: $('spellingHubFamilyStart'), listening: $('spellingHubListeningStart'), collocation: $('spellingHubCollocationStart'),
    masteredToday: $('spellingHubMasteredToday'), due: $('spellingHubDue'), accuracy: $('spellingHubAccuracy'), graduated: $('spellingHubGraduated'),
    todayCount: $('spellingHubTodayCount'), mistakeCount: $('spellingHubMistakeCount'), collocationCount: $('spellingHubCollocationCount'), historyOpen: $('spellingHubHistoryOpen'), historyCount: $('spellingHubHistoryCount'), errors: $('spellingHubErrorSummary'), note: $('spellingHubNote'),
    history: $('spellingHistoryPanel'), historyList: $('spellingHistoryList'), historyMeta: $('spellingHistoryMeta'), historySearch: $('spellingHistorySearch'), historySource: $('spellingHistorySource'), historyTabs: $('spellingHistoryTabs'), historyTotal: $('spellingHistoryTotal'), historyReview: $('spellingHistoryReview'), historyGraduated: $('spellingHistoryGraduated'),
    session: $('spellingLabSession'), card: document.querySelector('.spelling-session-card'), kicker: $('spellingSessionKicker'), title: $('spellingSessionTitle'),
    bar: $('spellingSessionProgressBar'), index: $('spellingSessionIndex'), schedule: $('spellingSessionSchedule'), prompt: $('spellingSessionPrompt'),
    listen: $('spellingListenButton'), hint: $('spellingHintBox'), answer: $('spellingAnswerBox'), inputWrap: $('spellingInputWrap'), input: $('spellingLabInput'),
    feedback: $('spellingSessionFeedback'), dontKnow: $('spellingDontKnowButton'), mastered: $('spellingMasteredButton'), check: $('spellingCheckButton'), footer: $('spellingSessionFooter'),
  };
  if (!els.start || !els.session) return;

  const api = () => window.WordMemoryApp || null;
  const fixedWords = () => Array.isArray(window.ALL_FIXED_COLLOCATIONS) ? window.ALL_FIXED_COLLOCATIONS : [];
  const fixedMap = () => new Map(fixedWords().map((w) => [String(w.id), w]));
  function allPracticeWords() {
    const main = api()?.getWords?.() || [];
    return [...main, ...fixedWords()].filter(Boolean);
  }
  function practiceWord(id) {
    const key = String(id);
    if (key.startsWith(TERM_KEY_PREFIX)) {
      const wanted = key.slice(TERM_KEY_PREFIX.length);
      return allPracticeWords().find((w) => normalizeAnswer(w?.term) === wanted) || null;
    }
    return fixedMap().get(key) || api()?.getWord?.(id) || null;
  }
  function recordKeyFor(wordOrId) {
    const word = wordOrId && typeof wordOrId === 'object' ? wordOrId : practiceWord(wordOrId);
    const normalized = normalizeAnswer(word?.term);
    return normalized ? `${TERM_KEY_PREFIX}${normalized}` : String(wordOrId?.id ?? wordOrId);
  }
  const nowIso = () => new Date().toISOString();
  const localDate = (value = Date.now()) => {
    const d = new Date(value);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const text = (value) => String(value ?? '').trim();
  const uniq = (arr) => [...new Set(arr)];
  function uniqWordsByTerm(words) {
    const seen = new Set();
    return (words || []).filter((word) => {
      const key = normalizeAnswer(word?.term);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function freshStore() {
    return { version: VERSION, updatedAt: '', records: {}, daily: {}, settings: {}, migratedBrowseV1: false };
  }
  function freshRecord() {
    return {
      attempts: 0, correct: 0, wrong: 0, firstTryCorrect: 0, cleanStreak: 0,
      stage: -1, nextDueAt: '', graduated: false, manualMastered: false, manualMasteredAt: '', lastAt: '', lastCleanAt: '', masteredAt: '',
      errorTypes: {}, lastErrorType: '', lastMode: '', lastWrongText: '', wrongSamples: [],
    };
  }
  function sanitizeRecord(raw) {
    const r = { ...freshRecord(), ...(raw && typeof raw === 'object' ? raw : {}) };
    ['attempts','correct','wrong','firstTryCorrect','cleanStreak','stage'].forEach((k) => r[k] = Math.max(k === 'stage' ? -1 : 0, Number(r[k]) || 0));
    r.graduated = Boolean(r.graduated);
    r.manualMastered = Boolean(r.manualMastered);
    r.errorTypes = r.errorTypes && typeof r.errorTypes === 'object' ? r.errorTypes : {};
    Object.keys(r.errorTypes).forEach((k) => r.errorTypes[k] = Math.max(0, Number(r.errorTypes[k]) || 0));
    ['nextDueAt','lastAt','lastCleanAt','masteredAt','manualMasteredAt','lastErrorType','lastMode','lastWrongText'].forEach((k) => r[k] = text(r[k]));
    r.wrongSamples = Array.isArray(r.wrongSamples) ? r.wrongSamples.map(text).filter(Boolean).slice(-5) : [];
    return r;
  }
  function sanitizeStore(raw) {
    const base = freshStore();
    if (!raw || typeof raw !== 'object') return base;
    const sourceVersion = Number(raw.version || 0);
    base.updatedAt = text(raw.updatedAt);
    base.settings = raw.settings && typeof raw.settings === 'object' ? { ...raw.settings } : {};
    base.migratedBrowseV1 = Boolean(raw.migratedBrowseV1);
    Object.entries(raw.records || {}).forEach(([id, rec]) => {
      if (!id) return;
      const clean = sanitizeRecord(rec);
      // B174: migrate B166-B173 schedule (5m/later/1d/3d/7d/14d/30d) to 1d/2d/4d/7d/14d/30d.
      if (sourceVersion > 0 && sourceVersion < 5 && !clean.graduated && !clean.manualMastered) {
        const oldStage = Number(clean.stage);
        if (oldStage === 0 || oldStage === 1) clean.stage = -1;
        else if (oldStage === 2) clean.stage = 0;
        else if (oldStage === 3) clean.stage = 1;
        else if (oldStage === 4) clean.stage = 3;
        else if (oldStage === 5) clean.stage = 4;
        else if (oldStage === 6) clean.stage = 5;
        else if (oldStage >= 7) { clean.graduated = true; clean.nextDueAt = ''; }
      }
      base.records[id] = clean;
    });
    Object.entries(raw.daily || {}).forEach(([date, day]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day || typeof day !== 'object') return;
      base.daily[date] = {
        testedIds: uniq(Array.isArray(day.testedIds) ? day.testedIds.map(String) : []),
        masteredIds: uniq(Array.isArray(day.masteredIds) ? day.masteredIds.map(String) : []),
        firstTryCorrect: Math.max(0, Number(day.firstTryCorrect) || 0),
        firstTryTrials: Math.max(0, Number(day.firstTryTrials) || 0),
        wrongAttempts: Math.max(0, Number(day.wrongAttempts) || 0),
        completed: Math.max(0, Number(day.completed) || 0),
      };
    });
    return base;
  }
  function mergeRecord(a, b) {
    a = sanitizeRecord(a); b = sanitizeRecord(b);
    const newer = (b.lastAt || '') > (a.lastAt || '') ? b : a;
    const older = newer === b ? a : b;
    const out = sanitizeRecord(newer);
    ['attempts','correct','wrong','firstTryCorrect'].forEach((k) => out[k] = Math.max(Number(a[k]) || 0, Number(b[k]) || 0));
    out.cleanStreak = Math.max(Number(a.cleanStreak) || 0, Number(b.cleanStreak) || 0);
    const stageA = Number(a.stage), stageB = Number(b.stage);
    out.stage = Math.max(Number.isFinite(stageA) ? stageA : -1, Number.isFinite(stageB) ? stageB : -1);
    out.graduated = Boolean(a.graduated || b.graduated);
    out.manualMastered = Boolean(a.manualMastered || b.manualMastered);
    out.manualMasteredAt = [a.manualMasteredAt, b.manualMasteredAt].filter(Boolean).sort().at(-1) || '';
    if (!out.nextDueAt && !out.graduated && !out.manualMastered) out.nextDueAt = newer.nextDueAt || older.nextDueAt || '';
    if (out.manualMastered) out.nextDueAt = '';
    out.masteredAt = [a.masteredAt, b.masteredAt].filter(Boolean).sort().at(-1) || '';
    out.errorTypes = { ...a.errorTypes };
    Object.entries(b.errorTypes || {}).forEach(([k,v]) => out.errorTypes[k] = Math.max(Number(out.errorTypes[k]) || 0, Number(v) || 0));
    out.lastWrongText = newer.lastWrongText || older.lastWrongText || '';
    out.wrongSamples = uniq([...(a.wrongSamples || []), ...(b.wrongSamples || [])]).slice(-5);
    return uniqWordsByTerm(out);
  }
  function mergeStore(left, right) {
    left = sanitizeStore(left); right = sanitizeStore(right);
    const out = freshStore();
    out.updatedAt = [left.updatedAt, right.updatedAt].filter(Boolean).sort().at(-1) || '';
    out.settings = { ...left.settings, ...right.settings };
    out.migratedBrowseV1 = left.migratedBrowseV1 || right.migratedBrowseV1;
    uniq([...Object.keys(left.records), ...Object.keys(right.records)]).forEach((id) => out.records[id] = mergeRecord(left.records[id], right.records[id]));
    uniq([...Object.keys(left.daily), ...Object.keys(right.daily)]).forEach((date) => {
      const a = left.daily[date] || {}; const b = right.daily[date] || {};
      out.daily[date] = {
        testedIds: uniq([...(a.testedIds || []), ...(b.testedIds || [])]),
        masteredIds: uniq([...(a.masteredIds || []), ...(b.masteredIds || [])]),
        firstTryCorrect: Math.max(Number(a.firstTryCorrect) || 0, Number(b.firstTryCorrect) || 0),
        firstTryTrials: Math.max(Number(a.firstTryTrials) || 0, Number(b.firstTryTrials) || 0),
        wrongAttempts: Math.max(Number(a.wrongAttempts) || 0, Number(b.wrongAttempts) || 0),
        completed: Math.max(Number(a.completed) || 0, Number(b.completed) || 0),
      };
    });
    return sanitizeStore(out);
  }
  function loadStore() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch {}
    let value = sanitizeStore(raw);
    try {
      const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
      if (pending) { value = mergeStore(value, pending); localStorage.removeItem(PENDING_KEY); }
    } catch {}
    return value;
  }
  let store = loadStore();
  function saveStore() {
    store.updatedAt = nowIso();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch {}
    try { window.dispatchEvent(new CustomEvent('word-memory-spelling-lab-updated')); } catch {}
  }
  function recordFor(id) {
    const key = recordKeyFor(id);
    if (!store.records[key]) store.records[key] = freshRecord();
    return store.records[key];
  }
  function mergeLegacyIdRecords() {
    if (store.settings?.termKeyMigrationV6) return;
    const buckets = new Map();
    Object.entries(store.records).forEach(([oldKey, raw]) => {
      const targetKey = oldKey.startsWith(TERM_KEY_PREFIX) ? oldKey : recordKeyFor(oldKey);
      if (!targetKey || targetKey === 'undefined' || targetKey === 'null') return;
      if (!buckets.has(targetKey)) buckets.set(targetKey, []);
      buckets.get(targetKey).push({ rec: sanitizeRecord(raw) });
    });
    const migrated = {};
    buckets.forEach((items, targetKey) => {
      let combined = freshRecord();
      items.forEach(({ rec }) => { combined = mergeRecord(combined, rec); });
      const cleanTimes = items.map(({rec}) => Date.parse(rec.lastCleanAt)).filter(Number.isFinite).sort((a,b)=>a-b)
        .filter((time, index, arr) => index === 0 || time - arr[index - 1] >= 4 * 60 * 1000);
      const earnedStage = Math.min(SCHEDULE.length - 1, cleanTimes.length - 1);
      if (!combined.graduated && !combined.manualMastered && earnedStage > combined.stage) {
        combined.stage = earnedStage;
        const last = new Date(cleanTimes.at(-1));
        combined.nextDueAt = dueAtForStage(earnedStage, Number.isFinite(last.getTime()) ? last : new Date());
      }
      migrated[targetKey] = combined;
    });
    store.records = migrated;
    store.settings = { ...(store.settings || {}), termKeyMigrationV6: nowIso() };
    saveStore();
  }
  function dayFor(date = localDate()) {
    if (!store.daily[date]) store.daily[date] = { testedIds: [], masteredIds: [], firstTryCorrect: 0, firstTryTrials: 0, wrongAttempts: 0, completed: 0 };
    return store.daily[date];
  }

  function migrateBrowseSpelling() {
    if (store.migratedBrowseV1) return;
    const keys = ['wordMemoryBrowseQuizWordsV1','wordMemoryBrowseQuizPhrasesV1','wordMemoryBrowseQuizV1'];
    keys.forEach((key) => {
      try {
        const old = JSON.parse(localStorage.getItem(key) || 'null');
        Object.entries(old?.records || {}).forEach(([id, item]) => {
          const mode = item?.modes?.spelling || {};
          const correct = Number(mode.correct) || 0, wrong = (Number(mode.wrong) || 0) + (Number(mode.unknown) || 0);
          if (!correct && !wrong) return;
          const rec = recordFor(id);
          rec.correct = Math.max(rec.correct, correct);
          rec.wrong = Math.max(rec.wrong, wrong);
          rec.attempts = Math.max(rec.attempts, correct + wrong);
          rec.lastAt = [rec.lastAt, text(mode.lastAt)].filter(Boolean).sort().at(-1) || rec.lastAt;
          if (wrong && !rec.nextDueAt && !rec.graduated) rec.nextDueAt = nowIso();
        });
      } catch {}
    });
    store.migratedBrowseV1 = true;
    saveStore();
  }

  function isPhrase(word) {
    const a = api();
    if (a?.isPhraseWord) return Boolean(a.isPhraseWord(word));
    return /\s/.test(text(word?.term));
  }
  function groups(word) {
    const a = api();
    return uniq([...(a?.wordGroupNames?.(word) || []), ...(a?.wordSources?.(word) || [])].map(text).filter(Boolean));
  }
  function broadMatches(name, selected) {
    if (!selected || selected === 'all') return true;
    if (selected === '四级') return name === '四级' || /^四级\s*\d+/.test(name);
    return name === selected || name.startsWith(selected + ' ') || name.startsWith(selected + '·') || name.startsWith(selected + '：');
  }
  function sourceMatches(word, selected) { return !selected || selected === 'all' || groups(word).some((g) => broadMatches(g, selected)); }
  function groupMatches(word, selected) { return !selected || selected === 'all' || groups(word).some((g) => g === selected); }
  function statusMatches(word, selected) {
    if (word?.virtualFixedCollocation) {
      const rec = store.records[recordKeyFor(word)];
      if (selected === 'all') return true;
      if (selected === 'new') return !rec || !(rec.attempts || 0);
      if (selected === 'weak') return Boolean(rec && (rec.wrong || 0) > 0 && !rec.manualMastered && !rec.graduated);
      return Boolean(rec && ((rec.attempts || 0) > 0 || rec.manualMastered || rec.graduated));
    }
    const a = api(); const status = text(a?.statusOf?.(word)); const score = Number(a?.weakScore?.(word) || 0);
    if (selected === 'all') return true;
    if (selected === 'new') return status === 'new';
    if (selected === 'weak') return status === 'weak' || score > 0;
    return status !== 'new';
  }
  function filteredWords(options = {}) {
    const a = api(); if (!a) return [];
    const kind = options.kind || (els.kind?.value === 'phrase' ? 'phrase' : 'word');
    const source = options.source ?? text(els.source?.value || 'all');
    const group = options.group ?? text(els.group?.value || 'all');
    const status = options.status ?? (source === '固定搭配专项' ? 'all' : text(els.status?.value || 'learned'));
    const pool = source === '固定搭配专项' ? fixedWords() : (a.getWords?.() || []);
    let out = pool.filter(Boolean)
      .filter((w) => kind === 'phrase' ? isPhrase(w) : !isPhrase(w))
      .filter((w) => sourceMatches(w, source)).filter((w) => groupMatches(w, group)).filter((w) => statusMatches(w, status));
    if (status === 'weak') out.sort((x,y) => Number(a?.weakScore?.(y)||0) - Number(a?.weakScore?.(x)||0));
    return out;
  }
  function rebuildGroups() {
    if (!els.group) return;
    const current = els.group.value;
    const source = text(els.source?.value || 'all');
    const kind = els.kind?.value === 'phrase' ? 'phrase' : 'word';
    const names = new Set();
    const groupPool = source === '固定搭配专项' ? fixedWords() : (api()?.getWords?.() || []);
    groupPool.forEach((w) => {
      if ((kind === 'phrase') !== isPhrase(w)) return;
      groups(w).forEach((g) => { if (source === 'all' || broadMatches(g, source)) names.add(g); });
    });
    const sorted = [...names].sort((a,b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
    els.group.innerHTML = '<option value="all">全部分组</option>' + sorted.map((g) => `<option value="${escapeAttr(g)}">${escapeHtml(g)}</option>`).join('');
    if (sorted.includes(current)) els.group.value = current;
  }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function escapeAttr(value) { return escapeHtml(value); }

  function normalizeAnswer(value) {
    return text(value).toLowerCase().replace(/[’‘`]/g,"'").replace(/[–—]/g,'-').replace(/\s+/g,' ');
  }
  function acceptedAnswers(term) {
    const raw = text(term);
    const list = [raw];
    if (/\s\/\s/.test(raw)) list.push(...raw.split(/\s+\/\s+/));
    return uniq(list.map(normalizeAnswer).filter(Boolean));
  }
  function isCorrect(typed, term) { const t = normalizeAnswer(typed); return acceptedAnswers(term).includes(t); }
  function lettersOnly(s) { return normalizeAnswer(s).replace(/[^a-z]/g,''); }
  function firstMismatch(target, typed) {
    const a = normalizeAnswer(target), b = normalizeAnswer(typed); let i = 0;
    while (i < Math.min(a.length,b.length) && a[i] === b[i]) i++;
    const ratio = a.length ? i / a.length : 0;
    return ratio < .3 ? '开头附近' : ratio > .72 ? '结尾附近' : '中间附近';
  }
  function adjacentTranspose(target, typed) {
    const a = lettersOnly(target), b = lettersOnly(typed); if (a.length !== b.length) return false;
    const diffs = []; for (let i=0;i<a.length;i++) if (a[i] !== b[i]) diffs.push(i);
    return diffs.length === 2 && diffs[1] === diffs[0] + 1 && a[diffs[0]] === b[diffs[1]] && a[diffs[1]] === b[diffs[0]];
  }
  function classifyError(target, typed) {
    const a = lettersOnly(target), b = lettersOnly(typed); const where = firstMismatch(target, typed);
    if (!a || !b) return { type:'substitution', where };
    if (a === b && normalizeAnswer(target) !== normalizeAnswer(typed)) return { type:'punctuation', where };
    if (adjacentTranspose(target, typed)) return { type:'transpose', where };
    if (a.length === b.length && [...a].sort().join('') === [...b].sort().join('')) return { type:'order', where };
    const doubles = [...a.matchAll(/([a-z])\1/g)].map((m) => m[0]);
    if (doubles.length && doubles.some((pair) => !b.includes(pair))) return { type:'double', where };
    const prefix = (() => { let i=0; while(i<Math.min(a.length,b.length)&&a[i]===b[i]) i++; return i; })();
    if (prefix >= Math.floor(a.length * .55) && a.slice(-Math.min(4,a.length)) !== b.slice(-Math.min(4,b.length))) return { type:'ending', where:'结尾附近' };
    if (b.length < a.length) return { type:'omission', where };
    if (b.length > a.length) return { type:'extra', where };
    return { type:'substitution', where };
  }
  function errorMessage(info) { return `${ERROR_LABELS[info.type] || '拼写错误'}，问题大约在${info.where}。先自己再想一次，我还不显示答案。`; }
  function secondHint(word) {
    const term = text(word.term); const letters = lettersOnly(term).length;
    const words = normalizeAnswer(term).split(' ').filter(Boolean).length;
    return `第二级提示：首字母 <b>${escapeHtml(term.charAt(0))}</b> · ${words > 1 ? `${words}个词 · ` : ''}共 ${letters} 个英文字母。`;
  }

  function dueAtForStage(stage, from = new Date()) {
    const item = SCHEDULE[stage];
    return new Date(from.getTime() + (item?.ms || 24*60*60*1000)).toISOString();
  }
  function errorRetryAt(from = new Date()) {
    return new Date(from.getTime() + ERROR_RETRY_MS).toISOString();
  }
  function scheduleLabel(rec) {
    if (rec.manualMastered) return '已掌握 · 已退出自动拼写';
    if (rec.graduated) return '30天复测通过 · 已毕业';
    if (rec.stage < 0 && rec.nextDueAt) {
      const due = new Date(rec.nextDueAt);
      return due.getTime() <= Date.now() ? '到期 · 5分钟纠错' : `纠错回炉 · ${formatWhen(due)}`;
    }
    if ((rec.attempts || 0) > 0 && !rec.nextDueAt) return `历史已练 ${rec.attempts} 次`;
    if (rec.stage < 0 || !rec.nextDueAt) return '尚未建立回炉';
    const due = new Date(rec.nextDueAt); const now = Date.now();
    const history = `历史拼对 ${Number(rec.correct)||0} 次 · 第 ${Math.min(rec.stage + 1, SCHEDULE.length)} 阶段`;
    if (due.getTime() <= now) return `${history} · 已到期`;
    return `${history} · 下次 ${formatWhen(due)}`;
  }
  function formatWhen(d) {
    const diff = d.getTime() - Date.now();
    if (diff < 60*60*1000) return `${Math.max(1,Math.ceil(diff/60000))}分钟后`;
    if (localDate(d) === localDate()) return `今天 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
    if (localDate(d) === localDate(tomorrow)) return '明天';
    return `${d.getMonth()+1}/${d.getDate()}`;
  }
  function advanceSchedule(rec, hadError, mode) {
    const now = new Date(); const due = rec.nextDueAt ? new Date(rec.nextDueAt).getTime() : 0; const isDue = !due || due <= now.getTime() + 15000;
    rec.lastMode = mode;
    if (hadError) {
      rec.cleanStreak = 0; rec.stage = -1; rec.nextDueAt = errorRetryAt(now); rec.graduated = false; return;
    }
    const separated = !rec.lastCleanAt || (now.getTime() - new Date(rec.lastCleanAt).getTime()) >= 4 * 60 * 1000;
    if (separated) rec.cleanStreak += 1;
    rec.lastCleanAt = now.toISOString();
    if (rec.cleanStreak >= 2 && !rec.masteredAt) rec.masteredAt = now.toISOString();
    if (!isDue && rec.nextDueAt) return;
    const nextStage = rec.stage < 0 ? 0 : rec.stage + 1;
    if (nextStage >= SCHEDULE.length) {
      rec.stage = SCHEDULE.length; rec.nextDueAt = ''; rec.graduated = true; return;
    }
    rec.stage = nextStage; rec.nextDueAt = dueAtForStage(nextStage, now); rec.graduated = false;
  }

  function wordsByIds(ids) { return (ids || []).map((id) => practiceWord(id)).filter(Boolean); }
  function dueWords(kind = 'word') {
    const now = Date.now();
    return filteredWords({ kind, source:'all', group:'all', status:'all' }).filter((w) => {
      const rec = store.records[recordKeyFor(w)]; return rec && !rec.graduated && !rec.manualMastered && rec.nextDueAt && new Date(rec.nextDueAt).getTime() <= now;
    }).sort((a,b) => String(store.records[recordKeyFor(a)]?.nextDueAt||'').localeCompare(String(store.records[recordKeyFor(b)]?.nextDueAt||'')));
  }
  function todayQueue() {
    const kind = els.kind?.value === 'phrase' ? 'phrase' : 'word';
    const due = dueWords(kind); const dueIds = new Set(due.map((w) => String(w.id)));
    const fresh = filteredWords({ kind, source:'all', group:'all', status:'learned' }).filter((w) => {
      const rec = store.records[recordKeyFor(w)];
      // B174: a word with a future spelling review must never be pulled forward merely to fill today's 30.
      // Only truly unstarted words can be used as fresh fillers.
      return !dueIds.has(String(w.id)) && !rec?.graduated && !rec?.manualMastered && (!rec || (!(rec.attempts||0) && !rec.nextDueAt));
    })
      .sort((a,b) => {
        const ra=store.records[recordKeyFor(a)], rb=store.records[recordKeyFor(b)];
        if (!ra && rb) return -1; if (ra && !rb) return 1;
        return Number(api()?.weakScore?.(b)||0)-Number(api()?.weakScore?.(a)||0);
      });
    return [...due, ...fresh].slice(0,30);
  }
  function mistakeQueue() {
    const kind = els.kind?.value === 'phrase' ? 'phrase' : 'word'; const now=Date.now();
    return filteredWords({ kind, source:'all', group:'all', status:'all' }).filter((w) => { const r=store.records[recordKeyFor(w)]; return r && !r.graduated && !r.manualMastered && (r.wrong || 0) > 0; })
      .sort((a,b) => {
        const ra=store.records[recordKeyFor(a)]||{}, rb=store.records[recordKeyFor(b)]||{};
        const ad=ra.nextDueAt && new Date(ra.nextDueAt).getTime()<=now ? 1:0, bd=rb.nextDueAt && new Date(rb.nextDueAt).getTime()<=now ? 1:0;
        return bd-ad || Number(rb.wrong||0)-Number(ra.wrong||0) || String(ra.nextDueAt||'').localeCompare(String(rb.nextDueAt||''));
      }).slice(0,50);
  }
  function freeQueue(forceWeak=false) {
    let list = filteredWords({ status: forceWeak ? 'weak' : undefined }).filter((w) => !store.records[recordKeyFor(w)]?.manualMastered);
    const limit = text(els.limit?.value || '30'); if (limit !== 'all') list = list.slice(0, Math.max(1, Number(limit)||30));
    return list;
  }
  function collocationAllWords() {
    return fixedWords().filter((w) => { const r=store.records[recordKeyFor(w)]; return !r?.manualMastered && !r?.graduated; });
  }
  function collocationQueue() {
    const now=Date.now();
    const all=collocationAllWords();
    const due=all.filter((w)=>{ const r=store.records[recordKeyFor(w)]; return r?.nextDueAt && new Date(r.nextDueAt).getTime()<=now; })
      .sort((a,b)=>String(store.records[recordKeyFor(a)]?.nextDueAt||'').localeCompare(String(store.records[recordKeyFor(b)]?.nextDueAt||'')));
    const dueIds=new Set(due.map(w=>String(w.id)));
    const fresh=all.filter((w)=>{ const r=store.records[recordKeyFor(w)]; return !dueIds.has(String(w.id)) && (!r || (!(r.attempts||0) && !r.nextDueAt)); });
    const limit=text(els.limit?.value||'30'); let list=[...due,...fresh];
    if(limit!=='all') list=list.slice(0,Math.max(1,Number(limit)||30));
    return list;
  }
  function familyStem(word) {
    const provided = text(api()?.wordFamilyStem?.(word)); if (provided && provided.length >= 3) return provided.toLowerCase();
    const t = lettersOnly(word?.term || ''); return t.replace(/(ation|tion|sion|ment|ness|ity|ive|al|er|or|ing|ed|ly|ous|able|ible|ize|ise|ist|ism|ful|less)$/,'');
  }
  function familyQueue() {
    const base = filteredWords({ status:'learned' }).filter((w) => !store.records[recordKeyFor(w)]?.manualMastered); const map = new Map();
    base.forEach((w) => { const stem=familyStem(w); if (stem.length<3) return; if(!map.has(stem)) map.set(stem,[]); map.get(stem).push(w); });
    const families=[...map.entries()].filter(([,ws])=>ws.length>=2).sort((a,b)=>b[1].length-a[1].length);
    const out=[]; for (const [,ws] of families) { ws.forEach((w)=>out.push(w)); if(out.length>=30) break; }
    return out.slice(0,30);
  }

  let session = null;
  function startSession(words, options = {}) {
    if (!words?.length) { setNote('当前范围没有可练内容。可以换来源、分组或掌握状态。'); return; }
    session = {
      ids: words.map((w)=>String(w.id)), index:0, mode:options.mode||'meaning', label:options.label||'拼写训练',
      cardTries:0, hadError:false, phase:'recall', lastError:null, firstAttemptLogged:false,
      summary:{tested:0,clean:0,wrong:0,mastered:0,manualMastered:0}, families: words.map((w)=>familyStem(w)),
    };
    els.session.hidden=false; els.session.setAttribute('aria-hidden','false'); document.body.classList.add('spelling-lab-open');
    renderSession();
  }
  function currentWord() { return session ? practiceWord(session.ids[session.index]) : null; }
  function resetCardState() { if(!session)return; session.cardTries=0; session.hadError=false; session.phase='recall'; session.lastError=null; session.firstAttemptLogged=false; }
  function closeSession() { session=null; els.session.hidden=true; els.session.setAttribute('aria-hidden','true'); if (!els.history || els.history.hidden) document.body.classList.remove('spelling-lab-open'); refresh(); }
  function meaningPiece(value) {
    if (typeof value === 'string' || typeof value === 'number') return text(value);
    if (!value || typeof value !== 'object') return '';
    return text(value.meaning ?? value.text ?? value.label ?? value.value ?? value.zh ?? value.chinese ?? '');
  }
  function promptMeaning(word) {
    if (!word || typeof word !== 'object') return '请根据中文释义拼写英文';
    const selectedGroup = text(els.group?.value || 'all');
    const selectedSource = text(els.source?.value || 'all');
    const groupMeaning = selectedGroup !== 'all' && word.perGroupMeaning && typeof word.perGroupMeaning === 'object'
      ? meaningPiece(word.perGroupMeaning[selectedGroup]) : '';
    if (groupMeaning) return groupMeaning;
    if (selectedSource === '四级核心' && meaningPiece(word.coreMeaning)) return meaningPiece(word.coreMeaning);
    const seg = api()?.meaningSegments?.(word.meaning);
    if (Array.isArray(seg) && seg.length) {
      const clean = seg.map(meaningPiece).filter(Boolean).slice(0,4);
      if (clean.length) return clean.join('；');
    }
    return meaningPiece(word.meaning) || meaningPiece(word.phrase) || '请根据中文释义拼写英文';
  }
  function renderSession() {
    const word=currentWord(); if(!session || !word) return renderComplete();
    const rec=recordFor(word.id); const total=session.ids.length, pos=session.index+1;
    els.kicker.textContent = session.mode==='listening' ? 'LISTEN → SPELL' : session.mode==='family' ? 'WORD FAMILY' : 'ACTIVE RECALL';
    els.title.textContent = session.mode==='listening' ? '听音 → 英文拼写' : session.mode==='family' ? '词族强化拼写' : '中文 → 英文拼写';
    els.bar.style.width=`${Math.round((session.index/Math.max(1,total))*100)}%`; els.index.textContent=`${pos}/${total}`; els.schedule.textContent=scheduleLabel(rec);
    els.hint.hidden=true; els.hint.innerHTML=''; els.answer.hidden=true; els.answer.innerHTML=''; els.feedback.textContent=''; els.feedback.className='spelling-session-feedback';
    els.input.value=''; els.input.readOnly=false; els.inputWrap.hidden=false; els.dontKnow.hidden=false; if (els.mastered) els.mastered.hidden=false; els.check.hidden=false; els.check.textContent='检查 Enter';
    els.card?.classList.remove('is-solved','is-retype');
    if (session.mode==='listening') {
      els.prompt.innerHTML='<span>只听发音，不看中文</span><span class="sub">点击下面的发音按钮，再把你听到的英文完整写出来</span>';
      els.listen.hidden=false;
    } else {
      els.listen.hidden=true;
      els.prompt.innerHTML=`<span>${escapeHtml(promptMeaning(word))}</span><span class="sub">中文释义已显示 · 英文和音标在提交前隐藏 · 不自动发音</span>`;
    }
    if (session.mode==='family') els.footer.textContent='词族词会相邻出现，但当前答案在提交前仍不会显示。';
    else els.footer.textContent='本轮首拼错误只定位位置；第二次给首字母和长度；第三次才显示答案。确认已经会拼可直接点“已掌握”。';
    setTimeout(()=>els.input?.focus(),30);
  }
  function logFirstAttempt(word, correct) {
    if(session.firstAttemptLogged) return; session.firstAttemptLogged=true;
    const day=dayFor(); if(!day.testedIds.includes(String(word.id))) day.testedIds.push(String(word.id));
    day.firstTryTrials=(Number(day.firstTryTrials)||0)+1; if(correct) day.firstTryCorrect+=1;
  }
  function logWrong(word, info, typed='') {
    const rec=recordFor(word.id); rec.attempts+=1; rec.wrong+=1; rec.lastAt=nowIso(); rec.lastErrorType=info.type; rec.errorTypes[info.type]=(Number(rec.errorTypes[info.type])||0)+1; rec.lastMode=session.mode;
    const wrongText=text(typed); if(wrongText){ rec.lastWrongText=wrongText; rec.wrongSamples=uniq([...(rec.wrongSamples||[]), wrongText]).slice(-5); }
    const day=dayFor(); day.wrongAttempts+=1; day.masteredIds=(day.masteredIds||[]).filter((id)=>String(id)!==String(word.id)); session.summary.wrong+=1;
    try { api()?.recordCheckIn?.({wordId:String(word.id),result:`spelling-wrong:${info.type}`,source:'spelling-lab',time:rec.lastAt}); } catch {}
  }
  function logSuccess(word, hadError) {
    const rec=recordFor(word.id); const beforeMastered=Boolean(rec.masteredAt); rec.attempts+=1; rec.correct+=1; rec.lastAt=nowIso(); rec.lastMode=session.mode;
    if(!hadError) rec.firstTryCorrect+=1;
    advanceSchedule(rec, hadError, session.mode);
    const day=dayFor(); day.completed+=1; if(rec.cleanStreak>=2 && !day.masteredIds.includes(String(word.id))) day.masteredIds.push(String(word.id));
    session.summary.tested+=1; if(!hadError) session.summary.clean+=1; if(!beforeMastered && rec.masteredAt) session.summary.mastered+=1;
    try { api()?.recordCheckIn?.({wordId:String(word.id),result:hadError?'spelling-retype-correct':'spelling-clean-correct',source:'spelling-lab',time:rec.lastAt}); } catch {}
    saveStore();
  }
  function revealAnswer(word, message) {
    session.phase='reveal'; session.hadError=true; if (els.mastered) els.mastered.hidden=true; els.hint.hidden=true; els.answer.hidden=false;
    els.answer.innerHTML=`<strong>${escapeHtml(word.term)}</strong><small>${escapeHtml(promptMeaning(word))}</small>`;
    els.feedback.textContent=message || '先认真看一遍正确拼写。看完不能直接下一词，必须闭卷重新完整拼对。';
    els.inputWrap.hidden=true; els.dontKnow.hidden=true; els.check.textContent='我看好了，闭卷重拼'; els.card?.classList.add('is-retype');
  }
  function beginRetype() {
    if(!session)return; session.phase='retype'; if (els.mastered) els.mastered.hidden=true; els.answer.hidden=true; els.inputWrap.hidden=false; els.input.value=''; els.input.readOnly=false; els.dontKnow.hidden=true; els.check.textContent='闭卷检查 Enter'; els.feedback.textContent='现在答案已隐藏。请不看答案，重新完整拼一次。'; els.card?.classList.add('is-retype'); setTimeout(()=>els.input.focus(),20);
  }
  function checkCurrent() {
    const word=currentWord(); if(!session||!word)return;
    if(session.phase==='reveal') return beginRetype();
    if(session.phase==='solved') return nextWord();
    const typed=text(els.input.value); if(!typed){ els.feedback.textContent='先把你想到的英文写出来。'; return; }
    const correct=isCorrect(typed,word.term); session.cardTries+=1;
    if(session.phase==='recall') logFirstAttempt(word,correct);
    if(correct) {
      const hadError=session.hadError || session.phase==='retype' || session.cardTries>1;
      logSuccess(word,hadError); session.phase='solved'; if (els.mastered) els.mastered.hidden=true;
      els.answer.hidden=false; els.answer.innerHTML=`<strong>${escapeHtml(word.term)}</strong><small>${escapeHtml(promptMeaning(word))}</small>`;
      els.feedback.textContent=hadError ? `✓ 闭卷重拼正确。${scheduleLabel(recordFor(word.id))}` : `✓ 本轮首拼正确。${scheduleLabel(recordFor(word.id))}`;
      els.feedback.className='spelling-session-feedback correct'; els.input.readOnly=true; els.dontKnow.hidden=true; els.check.textContent='下一词 Enter'; els.card?.classList.add('is-solved');
      els.footer.textContent=hadError ? '这次不算“看答案就会”，已经安排5分钟后再独立回忆。' : (recordFor(word.id).cleanStreak>=2 ? '已达到连续两次独立拼对，今日掌握。' : '还需要下一次独立拼对，才算真正稳定。');
      refresh(); return;
    }
    const info=classifyError(word.term,typed); session.hadError=true; session.lastError=info; if (els.mastered) els.mastered.hidden=true; logWrong(word,info,typed); saveStore();
    if(session.phase==='retype') { revealAnswer(word,'这次闭卷重拼还没有完全正确。再看一遍答案，然后继续闭卷重拼，直到能独立写出。'); return; }
    if(session.cardTries===1) { els.hint.hidden=false; els.hint.textContent=errorMessage(info); els.feedback.textContent='把输入框清空，再自己尝试一次。'; els.input.value=''; els.input.focus(); return; }
    if(session.cardTries===2) { els.hint.hidden=false; els.hint.innerHTML=secondHint(word); els.feedback.textContent='这是最后一次不看完整答案的机会。'; els.input.value=''; els.input.focus(); return; }
    revealAnswer(word,'已经连续三次没拼对，现在才显示完整答案。看完后必须闭卷重新拼。');
  }
  function dontKnow() {
    const word=currentWord(); if(!session||!word||session.phase!=='recall')return;
    if (els.mastered) els.mastered.hidden=true;
    if(!session.firstAttemptLogged) logFirstAttempt(word,false);
    const info={type:'substitution',where:'整体'}; logWrong(word,info); saveStore(); revealAnswer(word,'你选择了“完全不会”。现在看答案，随后必须闭卷重新拼对。');
  }
  function markCurrentMastered() {
    const word=currentWord(); if(!session||!word||session.phase!=='recall') return;
    // 已经出现错误/看过提示后不允许“已掌握”，避免把刚暴露的薄弱词直接跳过。
    if (session.cardTries > 0 || session.hadError || session.firstAttemptLogged) {
      els.feedback.textContent='这一词本轮已经出现过错误或提交记录，不能直接标“已掌握”。请完成本轮拼写。';
      return;
    }
    const rec=recordFor(word.id); const at=nowIso();
    rec.manualMastered=true; rec.manualMasteredAt=at; rec.nextDueAt=''; rec.lastAt=at; rec.lastMode='manual-mastered';
    const day=dayFor();
    if(!day.testedIds.includes(String(word.id))) day.testedIds.push(String(word.id));
    if(!day.masteredIds.includes(String(word.id))) day.masteredIds.push(String(word.id));
    day.completed=(Number(day.completed)||0)+1;
    session.summary.mastered+=1; session.summary.manualMastered+=1;
    try { api()?.recordCheckIn?.({wordId:String(word.id),result:'spelling-manual-mastered',source:'spelling-lab',time:at}); } catch {}
    saveStore();
    nextWord();
  }

  function nextWord() {
    if(!session)return; session.index+=1; if(session.index>=session.ids.length) return renderComplete(); resetCardState(); renderSession();
  }
  function renderComplete() {
    if(!session)return; const s=session.summary; const rate=s.tested?Math.round(s.clean/s.tested*100):0;
    els.bar.style.width='100%'; els.index.textContent=`${session.ids.length}/${session.ids.length}`; els.schedule.textContent='本轮完成'; els.listen.hidden=true; els.hint.hidden=true; els.answer.hidden=true; els.inputWrap.hidden=true; els.dontKnow.hidden=true; if (els.mastered) els.mastered.hidden=true; els.check.hidden=false; els.check.textContent='完成并返回';
    els.prompt.innerHTML=`<div class="spelling-session-complete"><h3>本轮拼写完成</h3><p>真正需要关注的是“本轮第一次能不能从脑子里写出来”，而不是看答案后能不能照着写。</p><div class="spelling-session-complete-grid"><div><strong>${s.tested}</strong><small>实际完成拼写</small></div><div><strong>${rate}%</strong><small>本轮首拼正确</small></div><div><strong>${s.mastered}</strong><small>新增掌握${s.manualMastered?`（手动${s.manualMastered}）`:''}</small></div></div></div>`;
    els.feedback.textContent='错词已经按回炉时间进入下一轮，不会重置你的31天主学习阶段。'; els.footer.textContent='返回拼写训练中心后，可以继续清“到期回炉”或“拼写错词”。'; els.card?.classList.add('is-solved'); session.phase='complete'; refresh();
  }

  let historyFilter = 'all';
  function historyMeaning(word) {
    if (!word || typeof word !== 'object') return '';
    return meaningPiece(word.coreMeaning) || meaningPiece(word.meaning) || meaningPiece(word.phrase) || '';
  }
  function historyStatus(rec) {
    if (rec.manualMastered) return { key:'mastered', label:'已掌握', cls:'mastered' };
    if (rec.graduated) return { key:'graduated', label:'拼写毕业', cls:'graduated' };
    if (rec.nextDueAt) {
      const due = new Date(rec.nextDueAt).getTime();
      if (Number.isFinite(due) && due <= Date.now()) return { key:'review', label:'到期回炉', cls:'due' };
      return { key:'review', label:'回炉中', cls:'review' };
    }
    if (rec.masteredAt) return { key:'mastered', label:'已掌握', cls:'mastered' };
    if ((rec.correct || 0) > 0) return { key:'learning', label:'练习中', cls:'learning' };
    return { key:'practiced', label:'已练习', cls:'learning' };
  }
  function formatHistoryTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso); if (!Number.isFinite(d.getTime())) return '—';
    const pad=(n)=>String(n).padStart(2,'0');
    if (localDate(d) === localDate()) return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function practicedEntries() {
    return Object.entries(store.records).map(([id, raw]) => {
      const rec=sanitizeRecord(raw); const word=practiceWord(id);
      return word && ((rec.attempts||0)>0 || rec.lastAt || rec.correct || rec.wrong || rec.manualMastered) ? { id:String(id), word, rec } : null;
    }).filter(Boolean).sort((a,b)=>String(b.rec.lastAt||'').localeCompare(String(a.rec.lastAt||'')));
  }
  function historyFilteredEntries() {
    const query=text(els.historySearch?.value).toLowerCase(); const source=text(els.historySource?.value||'all');
    return practicedEntries().filter(({word,rec})=>{
      if (!sourceMatches(word,source)) return false;
      if (historyFilter==='today' && (!rec.lastAt || localDate(rec.lastAt)!==localDate())) return false;
      if (historyFilter==='correct' && !(Number(rec.correct)||0)) return false;
      if (historyFilter==='wrong' && !(Number(rec.wrong)||0)) return false;
      if (historyFilter==='review' && (rec.graduated || rec.manualMastered || !rec.nextDueAt)) return false;
      if (historyFilter==='mastered' && !rec.manualMastered) return false;
      if (historyFilter==='graduated' && !rec.graduated) return false;
      if (query) {
        const hay=`${text(word.term)} ${historyMeaning(word)} ${groups(word).join(' ')}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }
  function renderHistory() {
    if (!els.historyList) return;
    const all=practicedEntries();
    const reviewing=all.filter(({rec})=>!rec.graduated && !rec.manualMastered && Boolean(rec.nextDueAt)).length;
    const graduated=all.filter(({rec})=>rec.graduated).length;
    const manualMastered=all.filter(({rec})=>rec.manualMastered).length;
    if(els.historyTotal) els.historyTotal.textContent=String(all.length);
    if(els.historyReview) els.historyReview.textContent=String(reviewing);
    if(els.historyGraduated) els.historyGraduated.textContent=String(graduated);
    const manualEl=document.getElementById('spellingHistoryManualMastered'); if(manualEl) manualEl.textContent=String(manualMastered);
    if(els.historyCount) els.historyCount.textContent=String(all.length);
    const filtered=historyFilteredEntries(); const shown=filtered.slice(0,300);
    if(els.historyMeta) els.historyMeta.textContent=`${filtered.length} 条记录${filtered.length>300?' · 当前显示前300条':''}`;
    if(!shown.length){ els.historyList.innerHTML='<div class="spelling-history-empty"><strong>这里还没有符合条件的记录</strong><span>完成一次拼写后就会自动出现在这里。</span></div>'; return; }
    els.historyList.innerHTML=shown.map(({id,word,rec})=>{
      const st=historyStatus(rec); const err=rec.lastErrorType ? (ERROR_LABELS[rec.lastErrorType]||rec.lastErrorType) : '';
      const wrongSample=rec.lastWrongText ? `<span class="history-wrong-sample">最近错写：<del>${escapeHtml(rec.lastWrongText)}</del></span>` : '';
      const next=rec.manualMastered ? `手动标记已掌握${rec.manualMasteredAt?` · ${formatHistoryTime(rec.manualMasteredAt)}`:''}` : (rec.graduated ? '30天复测通过' : (rec.nextDueAt ? scheduleLabel(rec) : '等待下一次独立拼写'));
      return `<article class="spelling-history-item">
        <div class="spelling-history-word"><strong>${escapeHtml(word.term)}</strong><span>${escapeHtml(historyMeaning(word))}</span></div>
        <div class="spelling-history-badges"><b class="${st.cls}">${st.label}</b><small>${escapeHtml(formatHistoryTime(rec.lastAt))}</small></div>
        <div class="spelling-history-data"><span>正确 <strong>${Number(rec.correct)||0}</strong> 次</span><span>错误 <strong>${Number(rec.wrong)||0}</strong> 次</span><span>首拼正确 <strong>${Number(rec.firstTryCorrect)||0}</strong> 次</span></div>
        <div class="spelling-history-detail"><span>${escapeHtml(next)}</span>${err?`<span>最近错误：${escapeHtml(err)}</span>`:''}${wrongSample}</div>
        <div class="spelling-history-actions">${rec.manualMastered?`<button type="button" class="spelling-history-practice" data-history-unmaster="${escapeAttr(id)}">恢复训练</button>`:''}<button type="button" class="spelling-history-practice" data-history-practice="${escapeAttr(id)}">再练这个词</button></div>
      </article>`;
    }).join('');
  }
  function openHistory() {
    if(!els.history) return; historyFilter='all';
    els.historyTabs?.querySelectorAll('[data-history-filter]').forEach((btn)=>btn.classList.toggle('active',btn.dataset.historyFilter==='all'));
    if(els.historySearch) els.historySearch.value=''; if(els.historySource) els.historySource.value='all';
    renderHistory(); els.history.hidden=false; els.history.setAttribute('aria-hidden','false'); document.body.classList.add('spelling-lab-open');
    setTimeout(()=>els.historySearch?.focus(),30);
  }
  function closeHistory() { if(!els.history)return; els.history.hidden=true; els.history.setAttribute('aria-hidden','true'); if(!els.session || els.session.hidden) document.body.classList.remove('spelling-lab-open'); }

  function topErrors() {
    const counts={}; Object.values(store.records).forEach((r)=>Object.entries(r.errorTypes||{}).forEach(([k,v])=>counts[k]=(counts[k]||0)+(Number(v)||0)));
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,4);
  }
  function refresh() {
    const today=dayFor(); const due=dueWords(els.kind?.value==='phrase'?'phrase':'word'); const allRecords=Object.values(store.records);
    const graduated=allRecords.filter((r)=>r.graduated).length; const trials=Number(today.firstTryTrials)||0; const accuracy=trials?Math.round(today.firstTryCorrect/trials*100):null;
    if(els.masteredToday) els.masteredToday.textContent=String(today.masteredIds.length);
    if(els.due) els.due.textContent=String(due.length); if(els.accuracy) els.accuracy.textContent=accuracy===null?'—':`${accuracy}%`; if(els.graduated) els.graduated.textContent=String(graduated);
    if(els.todayCount) els.todayCount.textContent=String(todayQueue().length); if(els.mistakeCount) els.mistakeCount.textContent=String(mistakeQueue().length); if(els.collocationCount) els.collocationCount.textContent=String(fixedWords().length);
    const practicedCount=practicedEntries().length; if(els.historyCount) els.historyCount.textContent=String(practicedCount); if(els.history && !els.history.hidden) renderHistory();
    const tops=topErrors(); if(els.errors) els.errors.innerHTML=tops.length?`<strong>常错模式</strong><span>${tops.map(([k,v])=>`${ERROR_LABELS[k]||k} ${v}次`).join(' · ')}</span>`:'<strong>常错模式</strong><span>开始练习后，这里会统计你的漏字母、顺序、词尾、双写等错误。</span>';
  }
  function setNote(message){ if(els.note) els.note.textContent=message; }

  function startToday(){ startSession(todayQueue(),{mode:'meaning',label:'今日拼写'}); }
  function startMistakes(){ startSession(mistakeQueue(),{mode:'meaning',label:'拼写错词'}); }
  function startFamily(){ startSession(familyQueue(),{mode:'family',label:'词族强化'}); }
  function startListening(){ let list=freeQueue(false); if(!list.length) list=todayQueue(); startSession(list,{mode:'listening',label:'听音拼写'}); }
  function startCollocation(){ if(els.kind) els.kind.value='phrase'; if(els.source) els.source.value='固定搭配专项'; rebuildGroups(); const list=collocationQueue(); if(!list.length){ setNote('全词库固定搭配当前没有到期或未开始的内容；已进入回炉计划的搭配不会提前重复。'); refresh(); return; } startSession(list,{mode:'meaning',label:'全词库固定搭配专项'}); }
  function startFree(forceWeak=false){ startSession(freeQueue(forceWeak),{mode:'meaning',label:'自由专项'}); }

  function exportState(){ return clone(store); }
  function importState(snapshot, options={}) {
    store = options.merge===false ? sanitizeStore(snapshot) : mergeStore(store,snapshot);
    store.settings = { ...(store.settings || {}) };
    delete store.settings.termKeyMigrationV6;
    mergeLegacyIdRecords();
    saveStore(); refresh(); return exportState();
  }
  window.SpellingHubApp = { exportState, importState, storageKey:STORE_KEY, refresh, startToday, startMistakes, openHistory };

  mergeLegacyIdRecords(); migrateBrowseSpelling(); rebuildGroups(); refresh();
  [els.kind,els.source].forEach((el)=>el?.addEventListener('change',()=>{rebuildGroups();refresh();}));
  [els.group,els.status,els.limit].forEach((el)=>el?.addEventListener('change',refresh));
  els.start?.addEventListener('click',()=>startFree(false)); els.weak?.addEventListener('click',()=>startFree(true)); els.today?.addEventListener('click',startToday); els.mistake?.addEventListener('click',startMistakes); els.family?.addEventListener('click',startFamily); els.listening?.addEventListener('click',startListening); els.collocation?.addEventListener('click',startCollocation); els.historyOpen?.addEventListener('click',openHistory);
  els.historyTabs?.addEventListener('click',(event)=>{ const btn=event.target.closest('[data-history-filter]'); if(!btn)return; historyFilter=btn.dataset.historyFilter||'all'; els.historyTabs.querySelectorAll('[data-history-filter]').forEach((x)=>x.classList.toggle('active',x===btn)); renderHistory(); });
  els.historySearch?.addEventListener('input',renderHistory); els.historySource?.addEventListener('change',renderHistory);
  els.history?.addEventListener('click',(event)=>{
    if(event.target.closest('[data-spelling-history-action="close"]')) return closeHistory();
    const unmaster=event.target.closest('[data-history-unmaster]');
    if(unmaster){
      const rec=recordFor(unmaster.dataset.historyUnmaster); rec.manualMastered=false; rec.manualMasteredAt=''; rec.graduated=false; rec.nextDueAt=nowIso(); saveStore(); renderHistory(); refresh(); return;
    }
    const btn=event.target.closest('[data-history-practice]'); if(!btn)return; const word=practiceWord(btn.dataset.historyPractice); if(!word)return; closeHistory(); startSession([word],{mode:'meaning',label:'记录重练'});
  });
  els.check?.addEventListener('click',()=>{ if(session?.phase==='complete') closeSession(); else checkCurrent(); }); els.dontKnow?.addEventListener('click',dontKnow); els.mastered?.addEventListener('click',markCurrentMastered);
  els.listen?.addEventListener('click',()=>{ const w=currentWord(); if(w){ if(w.virtualFixedCollocation && 'speechSynthesis' in window){ try{ speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text(w.term)); u.lang='en-GB'; speechSynthesis.speak(u); }catch{} } else api()?.speakWord?.(w.id,{accent:'uk'}); } setTimeout(()=>els.input?.focus(),50); });
  els.input?.addEventListener('keydown',(event)=>{ if(event.key==='Enter'){event.preventDefault();checkCurrent();} });
  els.session?.addEventListener('click',(event)=>{ if(event.target.closest('[data-spelling-action="close"]')) closeSession(); });
  document.addEventListener('keydown',(event)=>{ if(event.key!=='Escape')return; if(els.history && !els.history.hidden) closeHistory(); else if(!els.session.hidden) closeSession(); });
  window.addEventListener('word-memory-spelling-lab-updated',refresh); document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  setTimeout(()=>{rebuildGroups();refresh();},500);
}());
