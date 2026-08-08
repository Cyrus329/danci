(function () {
  'use strict';

  const api = window.WordMemoryApp;
  if (!api) return;

  const STORAGE_KEY = 'wordMemoryBrowseQuizV1';
  const STORE_VERSION = 3;
  const EXERCISE_MODES = ['enToZh', 'zhToEn', 'spelling'];
  const MODE_LABELS = {
    enToZh: '看英文选中文',
    zhToEn: '看中文选英文',
    spelling: '看中文拼英文',
  };
  const byId = (id) => document.getElementById(id);
  const escapeHTML = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, ' ');
  const nextFrame = (callback) => (window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0)))(callback);

  const els = {
    overlay: byId('browseQuizOverlay'),
    card: byId('browseQuizCard'),
    stage: byId('browseQuizStage'),
    close: byId('browseQuizClose'),
    progress: byId('browseQuizProgress'),
    scope: byId('browseQuizScope'),
    saveNote: byId('browseQuizSaveNote'),
    instruction: byId('browseQuizInstruction'),
    term: byId('browseQuizTerm'),
    phonetic: byId('browseQuizPhonetic'),
    options: byId('browseQuizOptions'),
    spelling: byId('browseQuizSpelling'),
    spellingInput: byId('browseQuizSpellingInput'),
    spellingCheck: byId('browseQuizSpellingCheck'),
    feedback: byId('browseQuizFeedback'),
    unknown: byId('browseQuizUnknown'),
    favorite: byId('browseQuizFavorite'),
    familiar: byId('browseQuizFamiliar'),
    previous: byId('browseQuizPrevious'),
    next: byId('browseQuizNext'),
    restart: byId('browseQuizRestart'),
    wrongOnly: byId('browseQuizWrongOnly'),
    exportButton: byId('browseQuizExport'),
    importButton: byId('browseQuizImport'),
    importInput: byId('browseQuizImportInput'),
    reset: byId('browseQuizReset'),
    stats: byId('browseQuizStats'),
    launcherStats: byId('browseQuizLauncherStats'),
    modeButtons: Array.from(document.querySelectorAll('[data-browse-quiz-mode]')),
  };

  let requestedIds = [];
  let requestedLabel = '当前全词浏览范围';
  let answerState = null;
  let advanceTimer = null;
  const meaningOptionCache = new Map();
  const termOptionCache = new Map();

  function emptyModeRecord() {
    return { correct: 0, wrong: 0, unknown: 0, lastResult: '', lastAt: '' };
  }

  function emptySession() {
    return {
      ids: [],
      cursor: 0,
      label: '全词库',
      startedAt: '',
      completed: false,
      mode: 'all',
    };
  }

  function emptyStore() {
    return {
      version: STORE_VERSION,
      updatedAt: '',
      currentMode: 'enToZh',
      sessions: Object.fromEntries(EXERCISE_MODES.map((mode) => [mode, emptySession()])),
      records: {},
      favorites: [],
      familiar: [],
      unknownByMode: Object.fromEntries(EXERCISE_MODES.map((mode) => [mode, []])),
      legacyWrongClearedAt: '',
    };
  }

  function validWordIds() {
    return new Set((api.getWords?.() || []).map((word) => String(word.id)));
  }

  function uniqueValidIds(values) {
    const valid = validWordIds();
    return [...new Set((Array.isArray(values) ? values : []).map(String).filter((id) => valid.has(id)))];
  }

  function sanitizeSession(value) {
    const item = value && typeof value === 'object' ? value : {};
    const ids = uniqueValidIds(item.ids);
    return {
      ids,
      cursor: Math.min(Math.max(0, Number(item.cursor) || 0), Math.max(0, ids.length - 1)),
      label: String(item.label || '全词库'),
      startedAt: String(item.startedAt || ''),
      completed: Boolean(item.completed),
      mode: ['all', 'wrong'].includes(item.mode) ? item.mode : 'all',
    };
  }

  function sanitizeModeRecord(value) {
    const item = value && typeof value === 'object' ? value : {};
    return {
      correct: Math.max(0, Number(item.correct) || 0),
      wrong: Math.max(0, Number(item.wrong) || 0),
      unknown: Math.max(0, Number(item.unknown) || 0),
      lastResult: String(item.lastResult || ''),
      lastAt: String(item.lastAt || ''),
    };
  }

  function sanitizeRecord(value) {
    const item = value && typeof value === 'object' ? value : {};
    const modes = item.modes && typeof item.modes === 'object' ? item.modes : {};
    const cleanModes = Object.fromEntries(EXERCISE_MODES.map((mode) => [mode, sanitizeModeRecord(modes[mode])]));
    const totals = Object.values(cleanModes).reduce((acc, modeRecord) => {
      acc.correct += modeRecord.correct;
      acc.wrong += modeRecord.wrong;
      acc.unknown += modeRecord.unknown;
      return acc;
    }, { correct: 0, wrong: 0, unknown: 0 });
    return {
      ...totals,
      lastResult: String(item.lastResult || ''),
      lastAt: String(item.lastAt || ''),
      lastMode: EXERCISE_MODES.includes(item.lastMode) ? item.lastMode : 'enToZh',
      modes: cleanModes,
    };
  }

  function migrateLegacyStore(value) {
    const base = emptyStore();
    const legacySession = value?.session && typeof value.session === 'object' ? value.session : {};
    const legacyMode = EXERCISE_MODES.includes(legacySession.exerciseMode) ? legacySession.exerciseMode : 'enToZh';
    base.currentMode = legacyMode;
    // B034 三种模式共用一个 cursor。迁移后只把旧题序归给当时正在使用的模式，另外两种从 0 开始。
    base.sessions[legacyMode] = sanitizeSession({ ...legacySession, mode: 'all' });
    const records = value?.records && typeof value.records === 'object' ? value.records : {};
    for (const [id, rawRecord] of Object.entries(records)) {
      const old = sanitizeRecord(rawRecord);
      const modes = {};
      for (const mode of EXERCISE_MODES) {
        const oldMode = sanitizeModeRecord(old.modes[mode]);
        // 用户要求把 B034 里之前的错题/不认识记录直接移出新版本：只保留旧的正确次数。
        modes[mode] = {
          correct: oldMode.correct,
          wrong: 0,
          unknown: 0,
          lastResult: oldMode.correct > 0 ? 'correct' : '',
          lastAt: oldMode.correct > 0 ? oldMode.lastAt : '',
        };
      }
      const clean = sanitizeRecord({ modes, lastMode: old.lastMode });
      if (clean.correct > 0) base.records[String(id)] = clean;
    }
    base.favorites = uniqueValidIds(value?.favorites);
    base.familiar = uniqueValidIds(value?.familiar);
    base.unknownByMode = Object.fromEntries(EXERCISE_MODES.map((mode) => [mode, []]));
    base.legacyWrongClearedAt = new Date().toISOString();
    return base;
  }

  function sanitizeStore(raw) {
    const value = raw && typeof raw === 'object' ? raw : {};
    if (Number(value.version || 0) < STORE_VERSION || !value.sessions) return migrateLegacyStore(value);
    const base = emptyStore();
    base.version = STORE_VERSION;
    base.updatedAt = String(value.updatedAt || '');
    base.currentMode = EXERCISE_MODES.includes(value.currentMode) ? value.currentMode : 'enToZh';
    const sessions = value.sessions && typeof value.sessions === 'object' ? value.sessions : {};
    base.sessions = Object.fromEntries(EXERCISE_MODES.map((mode) => [mode, sanitizeSession(sessions[mode])]));
    const records = value.records && typeof value.records === 'object' ? value.records : {};
    base.records = Object.fromEntries(Object.entries(records).map(([id, record]) => [String(id), sanitizeRecord(record)]));
    base.favorites = uniqueValidIds(value.favorites);
    base.familiar = uniqueValidIds(value.familiar);
    const unknownByMode = value.unknownByMode && typeof value.unknownByMode === 'object' ? value.unknownByMode : {};
    base.unknownByMode = Object.fromEntries(EXERCISE_MODES.map((mode) => [mode, uniqueValidIds(unknownByMode[mode])]));
    base.legacyWrongClearedAt = String(value.legacyWrongClearedAt || '');
    return base;
  }

  function loadStore() {
    try {
      return sanitizeStore(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
    } catch (error) {
      return emptyStore();
    }
  }

  let store = loadStore();
  // 升级到 B035 时立即把清理后的 v3 独立存档落盘，避免旧错题在刷新后再次出现。
  try {
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (Number(persisted?.version || 0) < STORE_VERSION || !persisted?.sessions) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    }
  } catch (error) {
    // file:// 或隐私模式不允许写入时继续使用内存中的清理结果。
  }

  function saveStore() {
    store.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (error) {
      // 独立浏览练习存档写入失败时，不阻断主学习系统。
    }
    renderLauncherStats();
  }

  function wordById(id) {
    return api.getWord?.(id) || (api.getWords?.() || []).find((word) => String(word.id) === String(id)) || null;
  }

  function meaningOf(word) {
    if (!word) return '';
    const segments = api.meaningSegments?.(word.meaning) || [];
    return String(segments[0] || word.meaning || '未填写中文释义').trim();
  }

  function phoneticOf(word) {
    return String(word?.phonetic || word?.ipa || '').trim();
  }

  function posOf(word) {
    const text = normalize(meaningOf(word));
    const match = text.match(/^(n|v|vt|vi|adj|adv|prep|pron|conj|num|art|aux|modal|phr)\.?\b/);
    return match ? match[1] : '';
  }

  function sourcesOf(word) {
    return [...new Set([
      ...(api.wordSources?.(word) || []),
      ...(api.wordGroupNames?.(word) || []),
    ].map((item) => String(item || '').trim()).filter(Boolean))];
  }

  function hashText(text) {
    let hash = 2166136261;
    for (const char of String(text || '')) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function deterministicShuffle(items, seedText) {
    const result = items.slice();
    let seed = hashText(seedText) || 1;
    const random = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    };
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }

  function scoredCandidates(word, selector) {
    const pos = posOf(word);
    const sources = sourcesOf(word);
    const correct = normalize(selector(word));
    const candidates = [];
    const seen = new Set([correct]);
    for (const other of api.getWords?.() || []) {
      if (!other || String(other.id) === String(word.id)) continue;
      const value = String(selector(other) || '').trim();
      const key = normalize(value);
      if (!value || seen.has(key)) continue;
      seen.add(key);
      const otherSources = sourcesOf(other);
      let score = 0;
      if (pos && posOf(other) === pos) score += 80;
      if (sources.some((source) => otherSources.includes(source))) score += 45;
      const a = String(word.term || '');
      const b = String(other.term || '');
      if (a.charAt(0).toLowerCase() === b.charAt(0).toLowerCase()) score += 12;
      score += Math.max(0, 10 - Math.abs(a.length - b.length));
      score += hashText(`${word.id}|${other.id}`) % 17;
      candidates.push({ value, score });
    }
    candidates.sort((a, b) => b.score - a.score || a.value.localeCompare(b.value, 'zh-CN'));
    return candidates;
  }

  function meaningChoices(word) {
    const key = String(word?.id || '');
    if (meaningOptionCache.has(key)) return meaningOptionCache.get(key).slice();
    const correct = meaningOf(word);
    const distractors = deterministicShuffle(scoredCandidates(word, meaningOf).slice(0, 40), `${word.id}|meaning-distractors`).slice(0, 3).map((item) => item.value);
    const options = deterministicShuffle([correct, ...distractors], `${word.id}|meaning-options`).slice(0, 4);
    meaningOptionCache.set(key, options.slice());
    return options;
  }

  function termChoices(word) {
    const key = String(word?.id || '');
    if (termOptionCache.has(key)) return termOptionCache.get(key).slice();
    const correct = String(word?.term || '').trim();
    const distractors = deterministicShuffle(scoredCandidates(word, (item) => item?.term || '').slice(0, 40), `${word.id}|term-distractors`).slice(0, 3).map((item) => item.value);
    const options = deterministicShuffle([correct, ...distractors], `${word.id}|term-options`).slice(0, 4);
    termOptionCache.set(key, options.slice());
    return options;
  }

  function exerciseMode() {
    return EXERCISE_MODES.includes(store.currentMode) ? store.currentMode : 'enToZh';
  }

  function sessionFor(mode = exerciseMode()) {
    if (!store.sessions || !store.sessions[mode]) store.sessions[mode] = emptySession();
    return store.sessions[mode];
  }

  function currentIds() {
    return sessionFor().ids;
  }

  function currentWord() {
    const session = sessionFor();
    return wordById(session.ids[session.cursor]);
  }

  function hasId(list, id) {
    return list.includes(String(id));
  }

  function toggleId(list, id) {
    const key = String(id);
    return hasId(list, key) ? list.filter((item) => item !== key) : [...list, key];
  }

  function recordFor(id) {
    return sanitizeRecord(store.records[String(id)]);
  }

  function updateRecord(id, result, mode = exerciseMode()) {
    const key = String(id);
    const record = recordFor(key);
    const modeRecord = sanitizeModeRecord(record.modes[mode]);
    if (result === 'correct') modeRecord.correct += 1;
    if (result === 'wrong') modeRecord.wrong += 1;
    if (result === 'unknown') modeRecord.unknown += 1;
    modeRecord.lastResult = result;
    modeRecord.lastAt = new Date().toISOString();
    record.modes[mode] = modeRecord;
    const totals = Object.values(record.modes).reduce((acc, item) => {
      acc.correct += Number(item.correct) || 0;
      acc.wrong += Number(item.wrong) || 0;
      acc.unknown += Number(item.unknown) || 0;
      return acc;
    }, { correct: 0, wrong: 0, unknown: 0 });
    record.correct = totals.correct;
    record.wrong = totals.wrong;
    record.unknown = totals.unknown;
    record.lastResult = result;
    record.lastMode = mode;
    record.lastAt = modeRecord.lastAt;
    store.records[key] = record;
  }

  function resetMainProgress(word, reason) {
    if (!word) return false;
    const result = api.resetWordLearningProgress?.(word.id, { reason });
    return Boolean(result?.ok);
  }

  function clearAdvanceTimer() {
    if (advanceTimer) window.clearTimeout(advanceTimer);
    advanceTimer = null;
  }

  function newSession(ids, label, mode = 'all', exercise = exerciseMode()) {
    const cleaned = uniqueValidIds(ids);
    store.sessions[exercise] = {
      ids: cleaned,
      cursor: 0,
      label: String(label || '当前全词浏览范围'),
      startedAt: new Date().toISOString(),
      completed: false,
      mode,
    };
    answerState = null;
    saveStore();
  }

  function modeStats(mode) {
    const records = Object.values(store.records);
    const values = records.map((record) => sanitizeModeRecord(record?.modes?.[mode]));
    const correct = values.reduce((sum, record) => sum + record.correct, 0);
    const wrong = values.reduce((sum, record) => sum + record.wrong + record.unknown, 0);
    const answeredWords = values.filter((record) => record.correct + record.wrong + record.unknown > 0).length;
    return { correct, wrong, answeredWords };
  }

  function renderLauncherStats() {
    const parts = EXERCISE_MODES.map((mode) => {
      const summary = modeStats(mode);
      return `${mode === 'enToZh' ? '英中' : (mode === 'zhToEn' ? '中英' : '拼写')}${summary.answeredWords}`;
    });
    const total = parts.some((part) => !part.endsWith('0'));
    const text = total ? `独立：${parts.join(' · ')}` : '独立存档：尚未练习';
    if (els.launcherStats) els.launcherStats.textContent = text;
  }

  function statsSummary(mode = exerciseMode()) {
    return modeStats(mode);
  }

  function correctValueFor(word, mode = exerciseMode()) {
    return mode === 'enToZh' ? meaningOf(word) : String(word?.term || '').trim();
  }

  function renderEmpty(message) {
    if (els.term) els.term.textContent = '暂无可练习单词';
    if (els.phonetic) els.phonetic.textContent = '';
    if (els.options) els.options.innerHTML = '';
    if (els.spelling) els.spelling.hidden = true;
    if (els.feedback) els.feedback.textContent = message || '请返回全词浏览调整筛选后重新开始。';
    if (els.progress) els.progress.textContent = '0/0';
  }

  function renderModeButtons() {
    const mode = exerciseMode();
    els.modeButtons.forEach((button) => {
      const buttonMode = button.dataset.browseQuizMode;
      const active = buttonMode === mode;
      const session = sessionFor(buttonMode);
      const total = session.ids.length;
      const current = total ? Math.min(session.cursor + 1, total) : 0;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
      button.innerHTML = `<span>${MODE_LABELS[buttonMode]}</span><small>${current}/${total || requestedIds.length || 0}</small>`;
    });
  }

  function renderOptions(word, options) {
    if (!els.options) return;
    const correctValue = correctValueFor(word);
    els.options.innerHTML = options.map((value, index) => {
      let stateClass = '';
      if (answerState) {
        if (normalize(value) === normalize(correctValue)) stateClass = ' correct';
        else if (normalize(answerState.selected) === normalize(value)) stateClass = ' wrong';
      }
      return `<button type="button" class="browse-quiz-option${stateClass}" data-browse-quiz-choice="${index}" data-value="${escapeHTML(value)}" ${answerState ? 'disabled' : ''}><span>${String.fromCharCode(65 + index)}</span><strong>${escapeHTML(value)}</strong></button>`;
    }).join('');
  }

  function render() {
    if (!els.overlay || els.overlay.hidden) {
      renderLauncherStats();
      return;
    }
    clearAdvanceTimer();
    store = sanitizeStore(store);
    const ids = currentIds();
    const word = currentWord();
    const mode = exerciseMode();
    const summary = statsSummary();
    renderModeButtons();
    if (els.overlay) els.overlay.dataset.exerciseMode = mode;
    if (els.card) els.card.dataset.exerciseMode = mode;
    const session = sessionFor(mode);
    if (els.scope) els.scope.textContent = `${session.mode === 'wrong' ? '浏览错词重做' : session.label} · ${MODE_LABELS[mode]}`;
    if (els.saveNote) els.saveNote.textContent = '三种练习各有自己的题序、当前位置和对错进度；答对不动主学习数据，答错或“不认识”会清空该词主学习进度，让它重新作为新词记。';
    if (els.stats) els.stats.textContent = `已练${summary.answeredWords}词 · 对${summary.correct}次 · 错${summary.wrong}次 · 收藏${store.favorites.length}词`;
    if (!word || !ids.length) {
      renderEmpty();
      return;
    }

    if (els.progress) els.progress.textContent = `${session.cursor + 1}/${ids.length}`;
    if (els.feedback) els.feedback.textContent = answerState?.message || '';

    if (mode === 'enToZh') {
      if (els.instruction) els.instruction.textContent = '请选择正确的中文释义';
      if (els.term) els.term.textContent = word.term || '';
      if (els.phonetic) els.phonetic.textContent = phoneticOf(word);
      if (els.options) els.options.hidden = false;
      if (els.spelling) els.spelling.hidden = true;
      renderOptions(word, meaningChoices(word));
    } else if (mode === 'zhToEn') {
      if (els.instruction) els.instruction.textContent = '请选择正确的英文';
      if (els.term) els.term.textContent = meaningOf(word);
      if (els.phonetic) els.phonetic.textContent = answerState ? phoneticOf(word) : '';
      if (els.options) els.options.hidden = false;
      if (els.spelling) els.spelling.hidden = true;
      renderOptions(word, termChoices(word));
    } else {
      if (els.instruction) els.instruction.textContent = '看中文，拼写正确的英文';
      if (els.term) els.term.textContent = meaningOf(word);
      if (els.phonetic) els.phonetic.textContent = answerState ? phoneticOf(word) : '';
      if (els.options) { els.options.hidden = true; els.options.innerHTML = ''; }
      if (els.spelling) els.spelling.hidden = false;
      if (els.spellingInput) {
        els.spellingInput.disabled = Boolean(answerState);
        if (!answerState && els.spellingInput.dataset.wordId !== String(word.id)) {
          els.spellingInput.value = '';
        }
        els.spellingInput.dataset.wordId = String(word.id);
      }
      if (els.spellingCheck) els.spellingCheck.disabled = Boolean(answerState);
      if (!answerState) nextFrame(() => els.spellingInput?.focus?.());
    }

    if (els.favorite) {
      const active = hasId(store.favorites, word.id);
      els.favorite.classList.toggle('active', active);
      els.favorite.setAttribute('aria-pressed', String(active));
      els.favorite.innerHTML = `<span>☆</span><strong>${active ? '已收藏' : '收藏'}</strong>`;
    }
    if (els.familiar) {
      const active = hasId(store.familiar, word.id);
      els.familiar.classList.toggle('active', active);
      els.familiar.setAttribute('aria-pressed', String(active));
      els.familiar.innerHTML = `<span>熟</span><strong>${active ? '已标熟' : '熟词'}</strong>`;
    }
    if (els.previous) els.previous.disabled = session.cursor <= 0;
    if (els.next) els.next.disabled = session.cursor >= ids.length - 1;
    renderLauncherStats();
  }

  function resetStageScroll() {
    if (!els.stage) return;
    nextFrame(() => { els.stage.scrollTop = 0; });
  }

  function move(delta) {
    clearAdvanceTimer();
    const session = sessionFor();
    const max = Math.max(0, session.ids.length - 1);
    session.cursor = Math.min(max, Math.max(0, session.cursor + delta));
    session.completed = session.cursor >= max && max > 0;
    answerState = null;
    if (els.spellingInput) { els.spellingInput.value = ''; els.spellingInput.dataset.wordId = ''; }
    saveStore();
    render();
    resetStageScroll();
  }

  function scheduleNext(delay) {
    clearAdvanceTimer();
    if (sessionFor().cursor >= currentIds().length - 1) return;
    advanceTimer = window.setTimeout(() => move(1), delay);
  }

  function wrongMainResetMessage(resetOk) {
    return resetOk ? '主学习进度已清空，之后会重新作为新词学习。' : '浏览错词已记录；当前主数据未能重置。';
  }

  function answerChoice(selectedValue) {
    if (answerState) return;
    const word = currentWord();
    if (!word) return;
    const mode = exerciseMode();
    const correctValue = correctValueFor(word, mode);
    const correct = normalize(selectedValue) === normalize(correctValue);
    updateRecord(word.id, correct ? 'correct' : 'wrong', mode);
    let resetOk = false;
    if (!correct) {
      const unknownList = store.unknownByMode[mode] || (store.unknownByMode[mode] = []);
      if (!hasId(unknownList, word.id)) unknownList.push(String(word.id));
      store.familiar = store.familiar.filter((id) => String(id) !== String(word.id));
      resetOk = resetMainProgress(word, `browse-${mode}-wrong`);
    }
    answerState = {
      selected: selectedValue,
      correct,
      message: correct
        ? '回答正确。主学习进度不变。'
        : `回答错误。正确答案：${correctValue}。${wrongMainResetMessage(resetOk)}`,
    };
    saveStore();
    render();
    scheduleNext(correct ? 650 : 1450);
  }

  function checkSpelling() {
    if (answerState || exerciseMode() !== 'spelling') return;
    const word = currentWord();
    if (!word) return;
    const typed = String(els.spellingInput?.value || '').trim();
    if (!typed) {
      if (els.feedback) els.feedback.textContent = '先输入英文，再按 Enter 或“检查”。';
      els.spellingInput?.focus?.();
      return;
    }
    const correctValue = String(word.term || '').trim();
    const correct = normalize(typed) === normalize(correctValue);
    updateRecord(word.id, correct ? 'correct' : 'wrong', 'spelling');
    let resetOk = false;
    if (!correct) {
      const unknownList = store.unknownByMode.spelling || (store.unknownByMode.spelling = []);
      if (!hasId(unknownList, word.id)) unknownList.push(String(word.id));
      store.familiar = store.familiar.filter((id) => String(id) !== String(word.id));
      resetOk = resetMainProgress(word, 'browse-spelling-wrong');
    }
    answerState = {
      selected: typed,
      correct,
      message: correct
        ? `拼写正确：${correctValue}。主学习进度不变。`
        : `拼写错误。正确拼写：${correctValue}。${wrongMainResetMessage(resetOk)}`,
    };
    saveStore();
    render();
    scheduleNext(correct ? 700 : 1600);
  }

  function markUnknown() {
    if (answerState) return;
    const word = currentWord();
    if (!word) return;
    const mode = exerciseMode();
    updateRecord(word.id, 'unknown', mode);
    const unknownList = store.unknownByMode[mode] || (store.unknownByMode[mode] = []);
      if (!hasId(unknownList, word.id)) unknownList.push(String(word.id));
    store.familiar = store.familiar.filter((id) => String(id) !== String(word.id));
    const resetOk = resetMainProgress(word, `browse-${mode}-unknown`);
    const correctValue = correctValueFor(word, mode);
    answerState = {
      selected: '',
      correct: false,
      message: `已记为不认识。正确答案：${correctValue}。${wrongMainResetMessage(resetOk)}`,
    };
    saveStore();
    render();
    scheduleNext(1550);
  }

  function setExerciseMode(mode) {
    if (!EXERCISE_MODES.includes(mode) || mode === exerciseMode()) return;
    clearAdvanceTimer();
    store.currentMode = mode;
    if (!sessionFor(mode).ids.length) {
      const seedIds = requestedIds.length ? requestedIds : uniqueValidIds((api.getWords?.() || []).map((word) => word.id));
      newSession(seedIds, requestedLabel, 'all', mode);
    }
    answerState = null;
    if (els.spellingInput) { els.spellingInput.value = ''; els.spellingInput.dataset.wordId = ''; }
    saveStore();
    render();
    resetStageScroll();
  }

  function open(ids, meta = {}) {
    requestedIds = uniqueValidIds(ids);
    requestedLabel = String(meta.label || '当前全词浏览范围');
    const mode = exerciseMode();
    const session = sessionFor(mode);
    const existingIds = uniqueValidIds(session.ids);
    if (!existingIds.length || meta.forceNew) newSession(requestedIds, requestedLabel, 'all', mode);
    else session.ids = existingIds;
    if (!sessionFor(mode).ids.length && requestedIds.length) newSession(requestedIds, requestedLabel, 'all', mode);
    if (els.overlay) {
      els.overlay.hidden = false;
      document.body.classList.add('browse-quiz-open');
    }
    answerState = null;
    render();
    resetStageScroll();
  }

  function close() {
    clearAdvanceTimer();
    if (els.overlay) els.overlay.hidden = true;
    document.body.classList.remove('browse-quiz-open');
    answerState = null;
  }

  function restartCurrent() {
    if (!requestedIds.length) requestedIds = uniqueValidIds(api.getWords?.().map((word) => word.id));
    if (!requestedIds.length) return;
    if (!window.confirm(`只重置“${MODE_LABELS[exerciseMode()]}”自己的题序和位置，另外两种模式进度不变。确定重新开始吗？`)) return;
    newSession(requestedIds, requestedLabel, 'all', exerciseMode());
    render();
  }

  function startWrongOnly() {
    const mode = exerciseMode();
    const wrongIds = uniqueValidIds(Object.entries(store.records)
      .filter(([, record]) => {
        const item = sanitizeModeRecord(record?.modes?.[mode]);
        return item.wrong + item.unknown > 0;
      })
      .map(([id]) => id));
    const merged = uniqueValidIds([...(store.unknownByMode[mode] || []), ...wrongIds]);
    if (!merged.length) {
      window.alert(`“${MODE_LABELS[mode]}”里暂时没有新错词。B034 以前的旧错词已按要求清除。`);
      return;
    }
    newSession(merged, `${MODE_LABELS[mode]}错词重做`, 'wrong', mode);
    render();
  }

  function exportStore() {
    const payload = {
      type: 'word-memory-browse-practice-backup',
      version: STORE_VERSION,
      exportedAt: new Date().toISOString(),
      browseQuiz: sanitizeStore(store),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `全词浏览独立练习存档-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importStore(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = parsed?.browseQuiz || parsed;
      store = sanitizeStore(incoming);
      saveStore();
      answerState = null;
      render();
      window.alert('全词浏览独立练习存档已导入。');
    } catch (error) {
      window.alert('导入失败：请选择由“全词浏览独立练习”导出的JSON存档。');
    } finally {
      if (els.importInput) els.importInput.value = '';
    }
  }

  function resetStore() {
    if (!window.confirm('确定清空“全词浏览独立练习”的三套独立题序、对错、收藏和熟词标记吗？这一步不会批量修改主学习进度。')) return;
    store = emptyStore();
    saveStore();
    answerState = null;
    render();
  }

  els.close?.addEventListener('click', close);
  els.previous?.addEventListener('click', () => move(-1));
  els.next?.addEventListener('click', () => move(1));
  els.unknown?.addEventListener('click', markUnknown);
  els.restart?.addEventListener('click', restartCurrent);
  els.wrongOnly?.addEventListener('click', startWrongOnly);
  els.exportButton?.addEventListener('click', exportStore);
  els.importButton?.addEventListener('click', () => els.importInput?.click());
  els.importInput?.addEventListener('change', () => importStore(els.importInput.files?.[0]));
  els.reset?.addEventListener('click', resetStore);
  els.modeButtons.forEach((button) => button.addEventListener('click', () => setExerciseMode(button.dataset.browseQuizMode)));
  els.favorite?.addEventListener('click', () => {
    const word = currentWord();
    if (!word) return;
    store.favorites = toggleId(store.favorites, word.id);
    saveStore();
    render();
  });
  els.familiar?.addEventListener('click', () => {
    const word = currentWord();
    if (!word) return;
    store.familiar = toggleId(store.familiar, word.id);
    saveStore();
    render();
  });
  els.options?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-browse-quiz-choice]');
    if (!button) return;
    answerChoice(button.dataset.value || '');
  });
  els.spellingCheck?.addEventListener('click', checkSpelling);
  els.spellingInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      checkSpelling();
    }
  });
  els.term?.addEventListener('click', () => {
    const word = currentWord();
    if (!word) return;
    if (exerciseMode() === 'enToZh' || answerState) api.speakWord?.(word.id);
  });
  els.phonetic?.addEventListener('click', () => {
    const word = currentWord();
    if (word && (exerciseMode() === 'enToZh' || answerState)) api.speakWord?.(word.id);
  });

  document.addEventListener('keydown', (event) => {
    if (!els.overlay || els.overlay.hidden) return;
    if (event.key === 'Escape') { close(); return; }
    const tag = String(event.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); return; }
    if (event.key === 'ArrowRight') { event.preventDefault(); move(1); return; }
    if (exerciseMode() !== 'spelling' && !answerState) {
      const index = /^[1-4]$/.test(event.key)
        ? Number(event.key) - 1
        : (/^[a-dA-D]$/.test(event.key) ? event.key.toUpperCase().charCodeAt(0) - 65 : -1);
      if (index >= 0) {
        const button = els.options?.querySelectorAll('[data-browse-quiz-choice]')?.[index];
        if (button) { event.preventDefault(); answerChoice(button.dataset.value || ''); }
      }
    }
  });

  window.BrowseQuizApp = {
    open,
    close,
    setMode: setExerciseMode,
    newSession: (ids, label) => open(ids, { label, forceNew: true }),
    getStore: () => sanitizeStore(store),
    storageKey: STORAGE_KEY,
  };

  renderLauncherStats();
}());
