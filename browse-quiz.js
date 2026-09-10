(function () {
  'use strict';

  const api = window.WordMemoryApp;
  if (!api) return;

  const LEGACY_STORAGE_KEY = 'wordMemoryBrowseQuizV1';
  // B081：以下两个 key 只作为旧版本迁移来源，不再作为当前练习的主存档。
  const STORAGE_KEYS = {
    word: 'wordMemoryBrowseQuizWordsV1',
    phrase: 'wordMemoryBrowseQuizPhrasesV1',
  };
  const BROWSE_BRIDGE_URL = 'https://cyrus329.github.io/word-memory/review-ledger-bridge.html';
  const BROWSE_BRIDGE_MESSAGE = 'word-memory-browse-practice:v1';
  // B083: 取消永久50/20锁定。仅保留正常主存档累计。
  const AUTO_UK_KEY = 'wordMemoryBrowseQuizAutoBritishV1';
  const ACTIVE_KIND_KEY = 'wordMemoryBrowseQuizActiveKindV1';
  const STORE_VERSION = 4;
  const EXERCISE_MODES = ['enToZh', 'zhToEn', 'spelling'];
  const KIND_LABELS = { word: '单词区', phrase: '短语区' };
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
  const canonicalId = (id) => { const key = String(id ?? '').trim(); const aliases = window.WORD_MEMORY_ID_ALIASES && typeof window.WORD_MEMORY_ID_ALIASES === 'object' ? window.WORD_MEMORY_ID_ALIASES : {}; return String(aliases[key] || key); };
  const nextFrame = (callback) => (window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0)))(callback);

  const els = {
    overlay: byId('browseQuizOverlay'),
    card: byId('browseQuizCard'),
    stage: byId('browseQuizStage'),
    close: byId('browseQuizClose'),
    progress: byId('browseQuizProgress'),
    milestone: byId('browseQuizMilestone'),
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
    chunks: byId('browseQuizChunks'),
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
    autoUk: byId('browseQuizAutoUk'),
    kindButtons: Array.from(document.querySelectorAll('[data-browse-quiz-kind]')),
    modeButtons: Array.from(document.querySelectorAll('[data-browse-quiz-mode]')),
  };

  let activeKind = (() => {
    try { return localStorage.getItem(ACTIVE_KIND_KEY) === 'phrase' ? 'phrase' : 'word'; } catch { return 'word'; }
  })();
  let autoBritish = (() => {
    try { return localStorage.getItem(AUTO_UK_KEY) !== '0'; } catch { return true; }
  })();
  let requestedIds = [];
  let requestedLabel = '当前全词浏览范围';
  let requestedIdsByKind = { word: [], phrase: [] };
  let requestedLabelsByKind = { word: '单词区 · 当前全词浏览范围', phrase: '短语区 · 当前全词浏览范围' };
  let lastAutoSpokenKey = '';
  let answerState = null;
  let advanceTimer = null;
  let optionsRevealed = false;
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

  function emptyGateRecord() {
    return { pending: false, zhToEn: false, spelling: false, lastWrongAt: '', completedAt: '' };
  }

  function emptyGateSession() {
    return { ids: [], cursor: 0, stage: 'zhToEn', active: false, completed: false, startedAt: '' };
  }

  function emptyStore() {
    return {
      version: STORE_VERSION,
      updatedAt: '',
      resetAt: '',
      currentMode: 'enToZh',
      sessions: Object.fromEntries(EXERCISE_MODES.map((mode) => [mode, emptySession()])),
      records: {},
      favorites: [],
      familiar: [],
      unknownByMode: Object.fromEntries(EXERCISE_MODES.map((mode) => [mode, []])),
      gateByWord: {},
      recoveryQueue: [],
      gateSession: emptyGateSession(),
      legacyWrongClearedAt: '',
    };
  }

  function isPhrase(word) {
    if (typeof api.isPhraseWord === 'function') return Boolean(api.isPhraseWord(word));
    const term = String(word?.term || '').trim();
    const note = String(word?.note || '');
    const tag = String(word?.tag || '');
    return /\s/.test(term) || /短语/.test(note) || /短语/.test(tag);
  }

  function kindOfWord(word) {
    return isPhrase(word) ? 'phrase' : 'word';
  }

  function validWordIds(kind = activeKind) {
    return new Set((api.getWords?.() || [])
      .filter((word) => kind === 'all' || kindOfWord(word) === kind)
      .map((word) => String(word.id)));
  }

  function uniqueValidIds(values, kind = activeKind) {
    const valid = validWordIds(kind);
    return [...new Set((Array.isArray(values) ? values : []).map(canonicalId).filter((id) => valid.has(id)))];
  }

  function sanitizeSession(value, kind = activeKind) {
    const item = value && typeof value === 'object' ? value : {};
    const ids = uniqueValidIds(item.ids, kind);
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

  function sanitizeGateRecord(value) {
    const item = value && typeof value === 'object' ? value : {};
    return {
      pending: Boolean(item.pending),
      zhToEn: Boolean(item.zhToEn),
      spelling: Boolean(item.spelling),
      lastWrongAt: String(item.lastWrongAt || ''),
      completedAt: String(item.completedAt || ''),
    };
  }

  function sanitizeGateSession(value, kind = activeKind) {
    const item = value && typeof value === 'object' ? value : {};
    const ids = uniqueValidIds(item.ids, kind);
    return {
      ids,
      cursor: Math.min(Math.max(0, Number(item.cursor) || 0), Math.max(0, ids.length - 1)),
      stage: item.stage === 'spelling' ? 'spelling' : 'zhToEn',
      active: Boolean(item.active),
      completed: Boolean(item.completed),
      startedAt: String(item.startedAt || ''),
    };
  }

  function migrateLegacyStore(value, kind = activeKind) {
    const base = emptyStore();
    // 保留旧存档自身时间戳，第一次迁移时才能正确判断哪份记录更新。
    base.updatedAt = String(value?.updatedAt || '');
    base.resetAt = String(value?.resetAt || '');
    const valid = validWordIds(kind);
    // 旧版三模式进度按“单词 / 短语”拆分时保留原记录，不修改旧 wordMemoryBrowseQuizV1。
    if (value?.sessions && typeof value.sessions === 'object') {
      base.currentMode = EXERCISE_MODES.includes(value.currentMode) ? value.currentMode : 'enToZh';
      base.sessions = Object.fromEntries(EXERCISE_MODES.map((mode) => [mode, sanitizeSession(value.sessions[mode], kind)]));
      const records = value?.records && typeof value.records === 'object' ? value.records : {};
      base.records = {};
      Object.entries(records).forEach(([id, record]) => {
        const canonical = canonicalId(id);
        if (!valid.has(canonical)) return;
        base.records[canonical] = mergeRecord(base.records[canonical], sanitizeRecord(record));
      });
      base.favorites = uniqueValidIds(value?.favorites, kind);
      base.familiar = uniqueValidIds(value?.familiar, kind);
      const unknownByMode = value?.unknownByMode && typeof value.unknownByMode === 'object' ? value.unknownByMode : {};
      base.unknownByMode = Object.fromEntries(EXERCISE_MODES.map((mode) => [mode, uniqueValidIds(unknownByMode[mode], kind)]));
      base.legacyWrongClearedAt = String(value?.legacyWrongClearedAt || '');
      return base;
    }

    const legacySession = value?.session && typeof value.session === 'object' ? value.session : {};
    const legacyMode = EXERCISE_MODES.includes(legacySession.exerciseMode) ? legacySession.exerciseMode : 'enToZh';
    base.currentMode = legacyMode;
    base.sessions[legacyMode] = sanitizeSession({ ...legacySession, mode: 'all' }, kind);
    const records = value?.records && typeof value.records === 'object' ? value.records : {};
    for (const [id, rawRecord] of Object.entries(records)) {
      const canonical = canonicalId(id);
      if (!valid.has(canonical)) continue;
      const old = sanitizeRecord(rawRecord);
      const modes = {};
      for (const mode of EXERCISE_MODES) {
        const oldMode = sanitizeModeRecord(old.modes[mode]);
        modes[mode] = {
          correct: oldMode.correct,
          wrong: 0,
          unknown: 0,
          lastResult: oldMode.correct > 0 ? 'correct' : '',
          lastAt: oldMode.correct > 0 ? oldMode.lastAt : '',
        };
      }
      const clean = sanitizeRecord({ modes, lastMode: old.lastMode });
      if (clean.correct > 0) base.records[canonical] = mergeRecord(base.records[canonical], clean);
    }
    base.favorites = uniqueValidIds(value?.favorites, kind);
    base.familiar = uniqueValidIds(value?.familiar, kind);
    base.legacyWrongClearedAt = new Date().toISOString();
    return base;
  }

  function sanitizeStore(raw, kind = activeKind) {
    const value = raw && typeof raw === 'object' ? raw : {};
    if (Number(value.version || 0) < STORE_VERSION || !value.sessions) return migrateLegacyStore(value, kind);
    const base = emptyStore();
    const valid = validWordIds(kind);
    base.version = STORE_VERSION;
    base.updatedAt = String(value.updatedAt || '');
    base.resetAt = String(value.resetAt || '');
    base.currentMode = EXERCISE_MODES.includes(value.currentMode) ? value.currentMode : 'enToZh';
    const sessions = value.sessions && typeof value.sessions === 'object' ? value.sessions : {};
    base.sessions = Object.fromEntries(EXERCISE_MODES.map((mode) => [mode, sanitizeSession(sessions[mode], kind)]));
    const records = value.records && typeof value.records === 'object' ? value.records : {};
    base.records = {};
    Object.entries(records).forEach(([id, record]) => {
      const canonical = canonicalId(id);
      if (!valid.has(canonical)) return;
      base.records[canonical] = mergeRecord(base.records[canonical], sanitizeRecord(record));
    });
    base.favorites = uniqueValidIds(value.favorites, kind);
    base.familiar = uniqueValidIds(value.familiar, kind);
    const unknownByMode = value.unknownByMode && typeof value.unknownByMode === 'object' ? value.unknownByMode : {};
    base.unknownByMode = Object.fromEntries(EXERCISE_MODES.map((mode) => [mode, uniqueValidIds(unknownByMode[mode], kind)]));
    const gateByWord = value.gateByWord && typeof value.gateByWord === 'object' ? value.gateByWord : {};
    base.gateByWord = {};
    Object.entries(gateByWord).forEach(([id, gate]) => {
      const canonical = canonicalId(id);
      if (!valid.has(canonical)) return;
      base.gateByWord[canonical] = mergeGateRecord(base.gateByWord[canonical], sanitizeGateRecord(gate));
    });
    base.recoveryQueue = uniqueValidIds(value.recoveryQueue, kind).filter((id) => base.gateByWord[id]?.pending);
    base.gateSession = sanitizeGateSession(value.gateSession, kind);
    if (base.gateSession.completed && !base.gateSession.active) base.gateSession = emptyGateSession();
    base.legacyWrongClearedAt = String(value.legacyWrongClearedAt || '');
    return base;
  }

  function latestText(...values) {
    return values.map((value) => String(value || '')).filter(Boolean).sort().pop() || '';
  }

  function mergeModeRecord(leftValue, rightValue) {
    const left = sanitizeModeRecord(leftValue);
    const right = sanitizeModeRecord(rightValue);
    const newer = String(right.lastAt || '') > String(left.lastAt || '') ? right : left;
    return {
      correct: Math.max(left.correct, right.correct),
      wrong: Math.max(left.wrong, right.wrong),
      unknown: Math.max(left.unknown, right.unknown),
      lastResult: String(newer.lastResult || left.lastResult || right.lastResult || ''),
      lastAt: latestText(left.lastAt, right.lastAt),
    };
  }

  function mergeRecord(leftValue, rightValue) {
    const left = sanitizeRecord(leftValue);
    const right = sanitizeRecord(rightValue);
    const modes = Object.fromEntries(EXERCISE_MODES.map((mode) => [mode, mergeModeRecord(left.modes?.[mode], right.modes?.[mode])]));
    const totals = Object.values(modes).reduce((acc, item) => {
      acc.correct += item.correct; acc.wrong += item.wrong; acc.unknown += item.unknown; return acc;
    }, { correct: 0, wrong: 0, unknown: 0 });
    const newer = String(right.lastAt || '') > String(left.lastAt || '') ? right : left;
    return {
      ...totals,
      lastResult: String(newer.lastResult || left.lastResult || right.lastResult || ''),
      lastAt: latestText(left.lastAt, right.lastAt),
      lastMode: EXERCISE_MODES.includes(newer.lastMode) ? newer.lastMode : 'enToZh',
      modes,
    };
  }

  function mergeSession(leftValue, rightValue, kind, preferRight = false) {
    const left = sanitizeSession(leftValue, kind);
    const right = sanitizeSession(rightValue, kind);
    const ids = uniqueValidIds([...(left.ids || []), ...(right.ids || [])], kind);
    // B088：会话位置属于“当前真实位置”，不能再用 max(cursor) 合并。
    // 旧快照里残留的 100/50 等 cursor 会把用户当前短语/单词位置直接顶高。
    // 这里只采用 updatedAt 更新的一侧；记录、收藏、错词仍可做并集合并。
    const chosen = preferRight ? right : left;
    return {
      ids,
      cursor: Math.min(Math.max(0, Number(chosen.cursor) || 0), Math.max(0, ids.length - 1)),
      label: String(chosen.label || left.label || right.label || '全词库'),
      startedAt: String(chosen.startedAt || left.startedAt || right.startedAt || ''),
      completed: Boolean(chosen.completed),
      mode: chosen.mode === 'wrong' ? 'wrong' : 'all',
    };
  }

  function mergeGateRecord(leftValue, rightValue) {
    const left = sanitizeGateRecord(leftValue);
    const right = sanitizeGateRecord(rightValue);
    const leftAt = latestText(left.lastWrongAt, left.completedAt);
    const rightAt = latestText(right.lastWrongAt, right.completedAt);
    const newer = rightAt > leftAt ? right : left;
    return {
      pending: Boolean(newer.pending),
      zhToEn: Boolean(left.zhToEn || right.zhToEn),
      spelling: Boolean(left.spelling || right.spelling),
      lastWrongAt: latestText(left.lastWrongAt, right.lastWrongAt),
      completedAt: latestText(left.completedAt, right.completedAt),
    };
  }

  function mergeStores(leftValue, rightValue, kind) {
    const left = sanitizeStore(leftValue, kind);
    const right = sanitizeStore(rightValue, kind);
    const leftReset = String(left.resetAt || '');
    const rightReset = String(right.resetAt || '');
    if (leftReset && leftReset >= String(right.updatedAt || '') && leftReset >= rightReset) return left;
    if (rightReset && rightReset >= String(left.updatedAt || '') && rightReset >= leftReset) return right;
    const records = {};
    new Set([...Object.keys(left.records || {}), ...Object.keys(right.records || {})]).forEach((id) => {
      records[id] = mergeRecord(left.records?.[id], right.records?.[id]);
    });
    const preferRightSession = String(right.updatedAt || '') > String(left.updatedAt || '');
    const sessions = Object.fromEntries(EXERCISE_MODES.map((mode) => [mode, mergeSession(left.sessions?.[mode], right.sessions?.[mode], kind, preferRightSession)]));
    const unknownByMode = Object.fromEntries(EXERCISE_MODES.map((mode) => [mode, uniqueValidIds([...(left.unknownByMode?.[mode] || []), ...(right.unknownByMode?.[mode] || [])], kind)]));
    const gateByWord = {};
    new Set([...Object.keys(left.gateByWord || {}), ...Object.keys(right.gateByWord || {})]).forEach((id) => {
      if (!validWordIds(kind).has(String(id))) return;
      gateByWord[String(id)] = mergeGateRecord(left.gateByWord?.[id], right.gateByWord?.[id]);
    });
    const newer = String(right.updatedAt || '') > String(left.updatedAt || '') ? right : left;
    return sanitizeStore({
      version: STORE_VERSION,
      updatedAt: latestText(left.updatedAt, right.updatedAt),
      resetAt: latestText(left.resetAt, right.resetAt),
      currentMode: EXERCISE_MODES.includes(newer.currentMode) ? newer.currentMode : 'enToZh',
      sessions,
      records,
      favorites: uniqueValidIds([...(left.favorites || []), ...(right.favorites || [])], kind),
      familiar: uniqueValidIds([...(left.familiar || []), ...(right.familiar || [])], kind),
      unknownByMode,
      gateByWord,
      recoveryQueue: uniqueValidIds([...(left.recoveryQueue || []), ...(right.recoveryQueue || [])], kind).filter((id) => gateByWord[id]?.pending),
      gateSession: newer.gateSession || emptyGateSession(),
      legacyWrongClearedAt: latestText(left.legacyWrongClearedAt, right.legacyWrongClearedAt),
    }, kind);
  }

  function bundleFromStores() {
    return {
      version: 1,
      updatedAt: latestText(stores.word?.updatedAt, stores.phrase?.updatedAt) || new Date().toISOString(),
      activeKind,
      autoBritish,
      word: sanitizeStore(stores.word, 'word'),
      phrase: sanitizeStore(stores.phrase, 'phrase'),
    };
  }

  // B083: 不再执行精确校准。历史B082校准逻辑会导致后续正常学习进度被误限制。

  function readStoreRaw(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  }

  function mainPracticeSnapshot() {
    const value = api.getBrowsePractice?.();
    return value && typeof value === 'object' ? value : {};
  }

  function hasMeaningfulStore(value) {
    if (!value || typeof value !== 'object') return false;
    if (Object.keys(value.records || {}).length) return true;
    if (Array.isArray(value.favorites) && value.favorites.length) return true;
    if (Array.isArray(value.familiar) && value.familiar.length) return true;
    if (Object.keys(value.gateByWord || {}).length) return true;
    return EXERCISE_MODES.some((mode) => Array.isArray(value.sessions?.[mode]?.ids) && value.sessions[mode].ids.length > 0);
  }

  function modeRecordHasActivity(record, mode) {
    const item = record?.modes?.[mode] || {};
    return Boolean((Number(item.correct) || 0) + (Number(item.wrong) || 0) + (Number(item.unknown) || 0));
  }

  function repairImpossibleSessionCursor(storeValue, kind) {
    const fixed = sanitizeStore(storeValue, kind);
    let changed = false;
    EXERCISE_MODES.forEach((mode) => {
      const session = fixed.sessions?.[mode];
      if (!session || session.mode !== 'all' || !Array.isArray(session.ids) || !session.ids.length) return;
      let practicedPrefix = 0;
      while (practicedPrefix < session.ids.length && modeRecordHasActivity(fixed.records?.[session.ids[practicedPrefix]], mode)) {
        practicedPrefix += 1;
      }
      // 正常情况下：做完 N 个后 cursor=N，页面显示下一题 N+1。
      // 只有 cursor 跑到了“完全没有任何作答记录”的空白区才判定为旧快照污染。
      if ((Number(session.cursor) || 0) > practicedPrefix) {
        const emptyGap = session.ids.slice(practicedPrefix, (Number(session.cursor) || 0) + 1)
          .every((id) => !modeRecordHasActivity(fixed.records?.[id], mode));
        const siblingModes = EXERCISE_MODES.filter((item) => item !== mode);
        const siblingsAgree = siblingModes.every((item) => {
          const sibling = fixed.sessions?.[item];
          return sibling?.mode === 'all' && (Number(sibling.cursor) || 0) === practicedPrefix;
        });
        // B088 只修“一个模式被旧快照单独顶高，而另外两模式与真实记录边界一致”的明确污染。
        // 不做通用进度校准，避免再次碰用户自行维护的真实位置。
        if (emptyGap && siblingsAgree) {
          session.cursor = Math.min(practicedPrefix, Math.max(0, session.ids.length - 1));
          session.completed = false;
          changed = true;
        }
      }
    });
    if (changed) fixed.updatedAt = new Date().toISOString();
    return { store: fixed, changed };
  }

  function loadStore(kind) {
    const main = mainPracticeSnapshot();
    const mainStore = main?.[kind];
    let merged;
    // B088：主存档一旦存在，就绝不再把旧 localStorage/B077 快照自动灌回来。
    // 旧 key 仅在“主存档完全为空”的第一次迁移时读取。
    if (hasMeaningfulStore(mainStore)) {
      merged = sanitizeStore(mainStore, kind);
    } else {
      merged = sanitizeStore({}, kind);
      const ownRaw = readStoreRaw(STORAGE_KEYS[kind]);
      if (ownRaw) merged = mergeStores(merged, ownRaw, kind);
      const legacyRaw = readStoreRaw(LEGACY_STORAGE_KEY);
      if (legacyRaw) merged = mergeStores(merged, legacyRaw, kind);
      if (kind === 'word') {
        const b077 = window.WORD_MEMORY_BROWSE_USER_SAVE_B077;
        if (b077?.kind === 'word' && b077?.browseQuiz) merged = mergeStores(merged, b077.browseQuiz, 'word');
      }
    }
    return repairImpossibleSessionCursor(merged, kind).store;
  }

  const mainInitial = mainPracticeSnapshot();
  const stores = {
    word: loadStore('word'),
    phrase: loadStore('phrase'),
  };
  if (mainInitial.activeKind === 'phrase') activeKind = 'phrase';
  if (typeof mainInitial.autoBritish === 'boolean') autoBritish = mainInitial.autoBritish;
  let store = stores[activeKind];

  function persistPracticeToMain(options = {}) {
    const snapshot = bundleFromStores();
    try {
      api.setBrowsePractice?.(snapshot, { merge: false, save: options.save !== false, notify: false });
    } catch {
      // 主存档暂时不可写时，当前内存练习仍可继续；离开页面前主系统还会再次保存。
    }
    scheduleBrowseBridgeSave();
    return snapshot;
  }

  function saveStore() {
    store.updatedAt = new Date().toISOString();
    stores[activeKind] = store;
    try { localStorage.setItem(ACTIVE_KIND_KEY, activeKind); } catch {}
    persistPracticeToMain({ save: true });
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

  function renderChunks(word) {
    if (!els.chunks) return;
    const chunks = (Array.isArray(word?.memoryChunks) ? word.memoryChunks : [])
      .map((item) => ({
        text: String(item?.text || item || '').trim(),
        meaning: String(item?.meaning || '').trim(),
      }))
      .filter((item) => item.text)
      .slice(0, 2);
    const solved = Boolean(answerState?.solved);
    els.chunks.hidden = !solved;
    if (!solved) {
      els.chunks.innerHTML = '';
      return;
    }
    const imageApi = window.WordMemoryImageMemory;
    const scene = imageApi?.build?.(word);
    // B070：全词独立练习同样只显示已经制作并接入的正式场景图。
    const imageMemory = scene?.customScene && scene?.asset
      ? (imageApi.render?.(word, { compact: true }) || '')
      : '';
    const optionalChunks = chunks.length
      ? `<details class="browse-quiz-chunk-details-v53"><summary>高频词组 · 记忆语块（可选）</summary>${chunks.map((item, index) => `<div><b>${index + 1}</b><span>${escapeHTML(item.text)}</span>${item.meaning ? `<em>${escapeHTML(item.meaning)}</em>` : ''}</div>`).join('')}</details>`
      : '';
    els.chunks.innerHTML = `${imageMemory}${optionalChunks}`;
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

  function gateActive() {
    return Boolean(store.gateSession?.active);
  }

  function runtimeMode() {
    return gateActive() ? (store.gateSession.stage === 'spelling' ? 'spelling' : 'zhToEn') : exerciseMode();
  }

  function sessionFor(mode = exerciseMode()) {
    if (!store.sessions || !store.sessions[mode]) store.sessions[mode] = emptySession();
    return store.sessions[mode];
  }

  function currentSession() {
    return gateActive() ? store.gateSession : sessionFor();
  }

  function currentIds() {
    return currentSession().ids || [];
  }

  function currentWord() {
    const session = currentSession();
    if (gateActive() && session.completed) return null;
    return wordById(session.ids?.[session.cursor]);
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

  function updateRecord(id, result, mode = runtimeMode()) {
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
    api.recordCheckIn?.({
      time: modeRecord.lastAt,
      wordId: key,
      result: `browse-${mode}-${result}`,
      source: `browse:${mode}`,
    });
  }

  function gateRecordFor(id) {
    const key = String(id);
    if (!store.gateByWord || typeof store.gateByWord !== 'object') store.gateByWord = {};
    return sanitizeGateRecord(store.gateByWord[key]);
  }

  function pendingGateIds() {
    const fromQueue = uniqueValidIds(store.recoveryQueue || []);
    const fromRecords = uniqueValidIds(Object.entries(store.gateByWord || {})
      .filter(([, gate]) => sanitizeGateRecord(gate).pending)
      .map(([id]) => id));
    return uniqueValidIds([...fromQueue, ...fromRecords]).filter((id) => gateRecordFor(id).pending);
  }

  function markRecoveryNeeded(id, options = {}) {
    const key = String(id);
    const gate = gateRecordFor(key);
    gate.pending = true;
    if (options.resetPasses !== false) {
      gate.zhToEn = false;
      gate.spelling = false;
    }
    gate.lastWrongAt = new Date().toISOString();
    gate.completedAt = '';
    store.gateByWord[key] = gate;
    if (!Array.isArray(store.recoveryQueue)) store.recoveryQueue = [];
    if (!store.recoveryQueue.includes(key)) store.recoveryQueue.push(key);
  }

  function markGatePass(id, mode) {
    const key = String(id);
    const gate = gateRecordFor(key);
    gate.pending = true;
    if (mode === 'zhToEn') gate.zhToEn = true;
    if (mode === 'spelling') gate.spelling = true;
    if (gate.zhToEn && gate.spelling) {
      gate.pending = false;
      gate.completedAt = new Date().toISOString();
      store.recoveryQueue = (store.recoveryQueue || []).filter((item) => String(item) !== key);
    }
    store.gateByWord[key] = gate;
    return gate;
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
    optionsRevealed = false;
    lastAutoSpokenKey = '';
    saveStore();
  }

  function modeStats(mode, sourceStore = store) {
    const records = Object.values(sourceStore?.records || {});
    const values = records.map((record) => sanitizeModeRecord(record?.modes?.[mode]));
    const correct = values.reduce((sum, record) => sum + record.correct, 0);
    const wrong = values.reduce((sum, record) => sum + record.wrong + record.unknown, 0);
    const answeredWords = values.filter((record) => record.correct + record.wrong + record.unknown > 0).length;
    return { correct, wrong, answeredWords };
  }

  function wordListNumber(name) {
    const match = String(name || '').match(/^Word List\s*(\d+)$/i);
    return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
  }

  function wordListGroupsFor(word) {
    return (api.wordGroupNames?.(word) || []).map((name) => String(name || '').trim()).filter((name) => /^Word List\s*\d+$/i.test(name));
  }

  function groupMilestones() {
    const groups = new Map();
    for (const word of api.getWords?.() || []) {
      for (const name of wordListGroupsFor(word)) {
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(word);
      }
    }
    return [...groups.entries()].sort((a, b) => wordListNumber(a[0]) - wordListNumber(b[0])).map(([name, words]) => {
      const uniqueWords = [...new Map(words.map((word) => [String(word.id), word])).values()];
      const recognized = uniqueWords.filter((word) => {
        const sourceStore = stores[kindOfWord(word)];
        const record = sourceStore?.records?.[String(word.id)];
        return sanitizeModeRecord(record?.modes?.enToZh).correct > 0 || sanitizeModeRecord(record?.modes?.zhToEn).correct > 0;
      }).length;
      const spelled = uniqueWords.filter((word) => sanitizeModeRecord(stores[kindOfWord(word)]?.records?.[String(word.id)]?.modes?.spelling).correct > 0).length;
      return { name, words: uniqueWords, total: uniqueWords.length, recognized, spelled };
    });
  }

  function pendingSpellingMilestone() {
    return groupMilestones().find((item) => item.total > 0 && item.recognized === item.total && item.spelled < item.total) || null;
  }

  function renderMilestone() {
    if (!els.milestone) return;
    const item = pendingSpellingMilestone();
    els.milestone.hidden = !item;
    if (!item) { els.milestone.innerHTML = ''; return; }
    els.milestone.innerHTML = `<div><section><strong>🎯 ${escapeHTML(item.name)} 的单词＋短语识义已完成</strong><p>识义 ${item.recognized}/${item.total}。请退出全词独立练习，回到“主要记单词”的拼写模式继续。</p></section><button type="button" data-browse-milestone-spelling="${escapeHTML(item.name)}">去主要记单词拼写 →</button></div>`;
  }

  function startMilestoneSpelling(groupName) {
    close();
    if (api.openMainSpelling?.(groupName)) return;
    try { history.replaceState(null, '', '#study'); } catch { location.hash = 'study'; }
    document.querySelector('[data-module-target="study"]')?.click?.();
    document.querySelector('[data-practice-mode="spell"]')?.click?.();
  }

  function pendingCountForStore(sourceStore) {
    return Object.values(sourceStore?.gateByWord || {}).filter((gate) => sanitizeGateRecord(gate).pending).length;
  }

  function practicedCountForStore(sourceStore) {
    return Object.values(sourceStore?.records || {}).filter((record) => EXERCISE_MODES.some((mode) => {
      const item = sanitizeModeRecord(record?.modes?.[mode]);
      return item.correct + item.wrong + item.unknown > 0;
    })).length;
  }

  function renderLauncherStats() {
    const wordPracticed = practicedCountForStore(stores.word);
    const phrasePracticed = practicedCountForStore(stores.phrase);
    const pending = pendingCountForStore(stores.word) + pendingCountForStore(stores.phrase);
    const hasAny = wordPracticed + phrasePracticed + pending > 0;
    const pendingText = pending ? ` · 待双关${pending}` : '';
    const text = hasAny
      ? `跟随主存档：单词${wordPracticed} · 短语${phrasePracticed}${pendingText}`
      : '跟随主存档：单词 / 短语均尚未练习';
    if (els.launcherStats) els.launcherStats.textContent = text;
  }

  function statsSummary(mode = runtimeMode()) {
    return modeStats(mode);
  }

  function correctValueFor(word, mode = runtimeMode()) {
    return mode === 'enToZh' ? meaningOf(word) : String(word?.term || '').trim();
  }

  function renderEmpty(message) {
    if (els.term) els.term.textContent = activeKind === 'phrase' ? '暂无可练习短语' : '暂无可练习单词';
    if (els.phonetic) els.phonetic.textContent = '';
    if (els.options) els.options.innerHTML = '';
    if (els.spelling) els.spelling.hidden = true;
    if (els.feedback) els.feedback.textContent = message || '请返回全词浏览调整筛选后重新开始。';
    if (els.progress) els.progress.textContent = '0/0';
  }

  function renderKindButtons() {
    if (els.reset) els.reset.textContent = `清空${KIND_LABELS[activeKind]}进度`;
    els.kindButtons.forEach((button) => {
      const kind = button.dataset.browseQuizKind === 'phrase' ? 'phrase' : 'word';
      const active = kind === activeKind;
      const total = validWordIds(kind).size;
      const practiced = practicedCountForStore(stores[kind]);
      const pending = pendingCountForStore(stores[kind]);
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
      button.disabled = false;
      button.innerHTML = `<strong>${KIND_LABELS[kind]}</strong><small>${total}${kind === 'phrase' ? '条' : '词'} · 已练${practiced}${pending ? ` · 待双关${pending}` : ''}</small>`;
    });
  }

  function renderAutoUkButton(mode = runtimeMode()) {
    if (!els.autoUk) return;
    const spellingPaused = mode === 'spelling';
    els.autoUk.classList.toggle('is-on', autoBritish);
    els.autoUk.classList.toggle('is-paused', spellingPaused);
    els.autoUk.setAttribute('aria-pressed', String(autoBritish));
    els.autoUk.textContent = spellingPaused
      ? `英音自动：${autoBritish ? '开' : '关'}（拼写暂停）`
      : `英音自动：${autoBritish ? '开' : '关'}`;
    els.autoUk.title = spellingPaused
      ? '拼写模式不会自动发音，避免直接泄露答案；切到其他模式后按此开关生效'
      : '开启后，每进入一道新题自动播放英音';
  }

  function renderModeButtons() {
    const mode = runtimeMode();
    const linked = gateActive();
    renderKindButtons();
    renderAutoUkButton(mode);
    els.modeButtons.forEach((button) => {
      const buttonMode = button.dataset.browseQuizMode;
      const active = buttonMode === mode;
      const session = sessionFor(buttonMode);
      const total = session.ids.length;
      const current = total ? Math.min(session.cursor + 1, total) : 0;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
      button.disabled = linked;
      const suffix = linked && active ? ' · 双关' : '';
      button.innerHTML = `<span>${MODE_LABELS[buttonMode]}${suffix}</span><small>${current}/${total || requestedIds.length || 0}</small>`;
    });
  }


  function renderOptions(word, options) {
    if (!els.options) return;
    const correctValue = correctValueFor(word);
    const wrongSelections = Array.isArray(answerState?.wrongSelections) ? answerState.wrongSelections : [];
    const solved = Boolean(answerState?.solved);
    els.options.innerHTML = options.map((value, index) => {
      const isCorrect = normalize(value) === normalize(correctValue);
      const wasWrong = wrongSelections.some((item) => normalize(item) === normalize(value));
      let stateClass = '';
      if (solved && isCorrect) stateClass = ' correct';
      else if (wasWrong) stateClass = ' wrong';
      const disabled = solved || wasWrong;
      return `<button type="button" class="browse-quiz-option${stateClass}" data-browse-quiz-choice="${index}" data-value="${escapeHTML(value)}" ${disabled ? 'disabled' : ''}><span>${String.fromCharCode(65 + index)}</span><strong>${escapeHTML(value)}</strong></button>`;
    }).join('');
  }

  function renderRecallFirst(word, mode) {
    if (!els.options) return;
    const prompt = mode === 'enToZh' ? '先自己回想中文意思' : '先自己回想对应英文';
    els.options.hidden = false;
    els.options.innerHTML = `<button type="button" class="browse-quiz-reveal" data-browse-quiz-reveal="1"><strong>先回想 · 显示四个选项</strong><small>${prompt}</small></button>`;
  }

  function maybeAutoPronounce(word, mode, session) {
    if (!word || !autoBritish || mode === 'spelling') return;
    const key = `${activeKind}|${mode}|${word.id}|${Number(session?.cursor) || 0}|${gateActive() ? String(store.gateSession?.stage || '') : 'normal'}`;
    api.warmWordPronunciation?.(word.id, 'uk');
    const nextId = session?.ids?.[(Number(session?.cursor) || 0) + 1];
    if (nextId) api.warmWordPronunciation?.(nextId, 'uk');
    if (key === lastAutoSpokenKey) return;
    lastAutoSpokenKey = key;
    api.speakWord?.(word.id, { accent: 'uk', silent: true });
  }

  function render() {
    if (!els.overlay || els.overlay.hidden) {
      renderLauncherStats();
      return;
    }
    clearAdvanceTimer();
    store = sanitizeStore(store, activeKind);
    stores[activeKind] = store;
    const ids = currentIds();
    const word = currentWord();
    const mode = runtimeMode();
    const linked = gateActive();
    const summary = modeStats(mode);
    // 三种练习仍分别存档；顶部“已练”按词条 ID 去重，同一词最多只计 1 次。
    const distinctPracticed = practicedCountForStore(store);
    const session = currentSession();
    renderModeButtons();
    renderMilestone();
    if (els.overlay) els.overlay.dataset.exerciseMode = mode;
    if (els.card) els.card.dataset.exerciseMode = mode;

    if (els.scope) {
      if (linked) {
        const gate = word ? gateRecordFor(word.id) : emptyGateRecord();
        const gateState = word ? ` · 中英${gate.zhToEn ? '✓' : '○'} · 拼写${gate.spelling ? '✓' : '○'}` : '';
        els.scope.textContent = `错词回卡 · 双关通关${gateState}`;
      } else {
        els.scope.textContent = `${KIND_LABELS[activeKind]} · ${session.mode === 'wrong' ? '浏览错词重做' : session.label} · ${MODE_LABELS[mode]}`;
      }
    }
    if (els.saveNote) {
      els.saveNote.textContent = linked
        ? '双关通关：错词回到卡片后，必须“看中文选英文”和“看中文拼英文”两关都通过才算真正过关。拼写错误不会重置主复习阶段。'
        : `${KIND_LABELS[activeKind]}和短语/单词另一分区都跟随主存档、JSON备份、手机大容量存档和云同步；三种练习各有题序和进度，同一词跨三种模式只计一次“已练”。除拼写外可开启自动英音；任何模式答错都会进入当前区域的“待双关”回卡池。`;
    }
    const pendingCount = pendingGateIds().length;
    if (els.stats) els.stats.textContent = `已练${distinctPracticed}词（跨三模式去重） · 本模式对${summary.correct}次 · 错${summary.wrong}次 · 待双关${pendingCount}词 · 收藏${store.favorites.length}词`;
    if (els.wrongOnly) els.wrongOnly.textContent = `错词双关通关${pendingCount ? `（${pendingCount}）` : ''}`;

    if (!word || !ids.length) {
      if (linked && session.completed) {
        renderEmpty('本轮待回卡已经全部完成：每个词都通过了“看中文选英文 + 拼写”两关。');
        if (els.progress) els.progress.textContent = `${ids.length}/${ids.length}`;
      } else {
        renderEmpty();
      }
      return;
    }

    if (els.progress) els.progress.textContent = `${session.cursor + 1}/${ids.length}`;
    if (els.feedback) els.feedback.textContent = answerState?.message || '';
    renderChunks(word);

    if (mode === 'enToZh') {
      if (els.instruction) els.instruction.textContent = optionsRevealed ? '请选择正确的中文释义 · 必须选对才能过' : '先回想中文意思，再显示四个选项';
      if (els.term) els.term.textContent = word.term || '';
      if (els.phonetic) els.phonetic.textContent = phoneticOf(word);
      if (els.spelling) els.spelling.hidden = true;
      if (optionsRevealed) renderOptions(word, meaningChoices(word));
      else renderRecallFirst(word, mode);
    } else if (mode === 'zhToEn') {
      const gateHint = linked ? ' · 双关第1关' : '';
      if (els.instruction) els.instruction.textContent = optionsRevealed ? `请选择正确的英文 · 必须选对才能过${gateHint}` : `先回想英文，再显示四个选项${gateHint}`;
      if (els.term) els.term.textContent = meaningOf(word);
      if (els.phonetic) els.phonetic.textContent = answerState?.solved ? phoneticOf(word) : '';
      if (els.spelling) els.spelling.hidden = true;
      if (optionsRevealed) renderOptions(word, termChoices(word));
      else renderRecallFirst(word, mode);
    } else {
      if (els.instruction) els.instruction.textContent = linked ? '双关第2关：看中文，必须拼写正确才能真正过关' : '看中文，拼写正确的英文';
      if (els.term) els.term.textContent = meaningOf(word);
      if (els.phonetic) els.phonetic.textContent = '';
      if (els.options) { els.options.hidden = true; els.options.innerHTML = ''; }
      if (els.spelling) els.spelling.hidden = false;
      if (els.spellingInput) {
        els.spellingInput.disabled = Boolean(answerState?.solved);
        if (!answerState && els.spellingInput.dataset.wordId !== String(word.id)) {
          els.spellingInput.value = '';
        }
        els.spellingInput.dataset.wordId = String(word.id);
      }
      if (els.spellingCheck) els.spellingCheck.disabled = Boolean(answerState?.solved);
      if (!answerState?.solved) nextFrame(() => els.spellingInput?.focus?.());
    }

    maybeAutoPronounce(word, mode, session);

    if (els.unknown) {
      const detail = linked
        ? `仍留在双关卡片；必须最终${mode === 'spelling' ? '拼对' : '选对'}，且两关都过才算完成`
        : (mode === 'spelling'
          ? '会进入待双关；拼错本身不会重置主复习阶段'
          : '会进入待双关并按原规则重置该词主学习进度');
      els.unknown.innerHTML = `不认识？<small>${detail}</small>`;
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
    if (els.previous) els.previous.disabled = linked || session.cursor <= 0;
    if (els.next) els.next.disabled = linked || session.cursor >= ids.length - 1 || !answerState?.solved;
    renderLauncherStats();
  }

  function resetStageScroll() {
    if (!els.stage) return;
    nextFrame(() => { els.stage.scrollTop = 0; });
  }

  function move(delta) {
    clearAdvanceTimer();
    if (gateActive()) return;
    const session = sessionFor();
    const max = Math.max(0, session.ids.length - 1);
    session.cursor = Math.min(max, Math.max(0, session.cursor + delta));
    session.completed = session.cursor >= max && max > 0;
    answerState = null;
    optionsRevealed = false;
    if (els.spellingInput) { els.spellingInput.value = ''; els.spellingInput.dataset.wordId = ''; }
    saveStore();
    render();
    resetStageScroll();
  }

  function scheduleNext(delay) {
    clearAdvanceTimer();
    if (gateActive()) return;
    if (sessionFor().cursor >= currentIds().length - 1) {
      if (pendingGateIds().length) {
        advanceTimer = window.setTimeout(() => startWrongOnly(), Math.max(700, delay));
      } else {
        advanceTimer = window.setTimeout(() => {
          const session = sessionFor();
          session.completed = true;
          answerState = {
            ...(answerState || {}),
            solved: true,
            message: runtimeMode() === 'spelling'
              ? '本轮拼写完成。顶部进度条已更新；若同组还有另一分区未拼，会继续提醒。'
              : '本轮识义完成。完成同一 Word List 的单词区和短语区后，会提醒你回到主要记单词页面刷拼写。',
          };
          saveStore();
          render();
        }, Math.max(500, delay));
      }
      return;
    }
    advanceTimer = window.setTimeout(() => move(1), delay);
  }

  function switchGateToSpelling(delay = 520) {
    clearAdvanceTimer();
    advanceTimer = window.setTimeout(() => {
      if (!gateActive()) return;
      store.gateSession.stage = 'spelling';
      answerState = null;
      optionsRevealed = false;
      if (els.spellingInput) { els.spellingInput.value = ''; els.spellingInput.dataset.wordId = ''; }
      saveStore();
      render();
      resetStageScroll();
    }, delay);
  }

  function advanceGateWord(delay = 620) {
    clearAdvanceTimer();
    advanceTimer = window.setTimeout(() => {
      if (!gateActive()) return;
      const session = store.gateSession;
      if (session.cursor >= session.ids.length - 1) {
        session.completed = true;
        answerState = null;
        optionsRevealed = false;
        saveStore();
        render();
        resetStageScroll();
        return;
      }
      session.cursor += 1;
      session.stage = 'zhToEn';
      answerState = null;
      optionsRevealed = false;
      if (els.spellingInput) { els.spellingInput.value = ''; els.spellingInput.dataset.wordId = ''; }
      saveStore();
      render();
      resetStageScroll();
    }, delay);
  }

  function wrongMainResetMessage(resetOk) {
    return resetOk ? '主学习进度已清空，之后会重新作为新词学习。' : '浏览错词已记录；当前主数据未能重置。';
  }

  function answerChoice(selectedValue) {
    if (!optionsRevealed || answerState?.solved) return;
    const word = currentWord();
    if (!word) return;
    const mode = runtimeMode();
    const linked = gateActive();
    const correctValue = correctValueFor(word, mode);
    const correct = normalize(selectedValue) === normalize(correctValue);
    const previousWrong = Array.isArray(answerState?.wrongSelections) ? answerState.wrongSelections.slice() : [];
    if (correct) {
      updateRecord(word.id, 'correct', mode);
      if (linked && mode === 'zhToEn') {
        const gate = markGatePass(word.id, 'zhToEn');
        answerState = {
          selected: selectedValue,
          correct: true,
          solved: true,
          wrongSelections: previousWrong,
          message: `第1关通过：看中文选英文 ✓。${gate.spelling ? '两关已完成。' : '接着进入拼写关。'}`,
        };
        saveStore();
        render();
        switchGateToSpelling();
        return;
      }
      answerState = {
        selected: selectedValue,
        correct: true,
        solved: true,
        wrongSelections: previousWrong,
        message: previousWrong.length ? '最终选对了。当前模式通过；如果此前答错，该词仍在待双关池。' : '回答正确。主学习进度不变。',
      };
      saveStore();
      render();
      scheduleNext(650);
      return;
    }

    const alreadyWrong = previousWrong.some((item) => normalize(item) === normalize(selectedValue));
    if (!alreadyWrong) {
      updateRecord(word.id, 'wrong', mode);
      previousWrong.push(selectedValue);
      const unknownList = store.unknownByMode[mode] || (store.unknownByMode[mode] = []);
      if (!hasId(unknownList, word.id)) unknownList.push(String(word.id));
      store.familiar = store.familiar.filter((id) => String(id) !== String(word.id));
      if (linked) {
        markRecoveryNeeded(word.id, { resetPasses: false });
      } else {
        markRecoveryNeeded(word.id, { resetPasses: true });
        // 普通选择练习第一次答错仍按原规则重置一次主学习进度。
        if (!answerState?.wrongSelections?.length) resetMainProgress(word, `browse-${mode}-wrong`);
      }
    }
    answerState = {
      selected: selectedValue,
      correct: false,
      solved: false,
      wrongSelections: previousWrong,
      message: linked
        ? '选错了，仍停留在这张回卡。必须先选对，再完成拼写关。'
        : '选错了，已进入待双关回卡池。当前词仍不会跳过，必须选对才能继续。',
    };
    saveStore();
    render();
  }

  function checkSpelling() {
    if (answerState?.solved || runtimeMode() !== 'spelling') return;
    const word = currentWord();
    if (!word) return;
    const linked = gateActive();
    const typed = String(els.spellingInput?.value || '').trim();
    if (!typed) {
      if (els.feedback) els.feedback.textContent = '先输入英文，再按 Enter 或“检查”。';
      els.spellingInput?.focus?.();
      return;
    }
    const correctValue = String(word.term || '').trim();
    const correct = normalize(typed) === normalize(correctValue);
    if (correct) {
      updateRecord(word.id, 'correct', 'spelling');
      if (linked) {
        const gate = markGatePass(word.id, 'spelling');
        answerState = {
          selected: typed,
          correct: true,
          solved: true,
          wrongSelections: Array.isArray(answerState?.wrongSelections) ? answerState.wrongSelections : [],
          message: gate.zhToEn && gate.spelling
            ? '第2关拼写 ✓。两关全部通过，这个词正式过关并移出待回卡池。'
            : '拼写正确，但还缺少看中文选英文关。',
        };
        saveStore();
        render();
        if (gate.zhToEn && gate.spelling) advanceGateWord();
        return;
      }
      answerState = {
        selected: typed,
        correct: true,
        solved: true,
        wrongSelections: Array.isArray(answerState?.wrongSelections) ? answerState.wrongSelections : [],
        message: `拼写正确：${correctValue}。主学习进度不变。`,
      };
      saveStore();
      render();
      scheduleNext(700);
      return;
    }

    updateRecord(word.id, 'wrong', 'spelling');
    const unknownList = store.unknownByMode.spelling || (store.unknownByMode.spelling = []);
    if (!hasId(unknownList, word.id)) unknownList.push(String(word.id));
    store.familiar = store.familiar.filter((id) => String(id) !== String(word.id));
    if (linked) markRecoveryNeeded(word.id, { resetPasses: false });
    else markRecoveryNeeded(word.id, { resetPasses: true });
    // 关键规则：普通拼写错误和双关回卡里的拼写错误都不重置主复习阶段。
    const wrongSelections = Array.isArray(answerState?.wrongSelections) ? answerState.wrongSelections.slice() : [];
    wrongSelections.push(typed);
    answerState = {
      selected: typed,
      correct: false,
      solved: false,
      wrongSelections,
      message: linked
        ? '拼写不对，但不会重置主复习阶段。继续修改，必须拼对才能完成双关。'
        : '拼写不对，不会重置主复习阶段；该词已进入待双关回卡池。请继续修改，必须拼对才能进入下一个。',
    };
    saveStore();
    render();
    if (els.spellingInput) {
      els.spellingInput.disabled = false;
      els.spellingInput.focus?.();
      els.spellingInput.select?.();
    }
  }

  function markUnknown() {
    if (answerState?.solved) return;
    const word = currentWord();
    if (!word) return;
    const mode = runtimeMode();
    const linked = gateActive();
    updateRecord(word.id, 'unknown', mode);
    const unknownList = store.unknownByMode[mode] || (store.unknownByMode[mode] = []);
    if (!hasId(unknownList, word.id)) unknownList.push(String(word.id));
    store.familiar = store.familiar.filter((id) => String(id) !== String(word.id));
    markRecoveryNeeded(word.id, { resetPasses: !linked });
    const resetOk = resetMainProgress(word, `browse-${mode}-unknown`);
    const previousWrong = Array.isArray(answerState?.wrongSelections) ? answerState.wrongSelections.slice() : [];
    answerState = {
      selected: '',
      correct: false,
      solved: false,
      wrongSelections: previousWrong,
      message: linked
        ? `已记为不认识。${wrongMainResetMessage(resetOk)} 仍停留在双关卡片，必须最终${mode === 'spelling' ? '拼对' : '选对'}。`
        : `已记为不认识并进入待双关。${wrongMainResetMessage(resetOk)} 当前词仍需最终${mode === 'spelling' ? '拼对' : '选对'}。`,
    };
    if (mode !== 'spelling') optionsRevealed = true;
    saveStore();
    render();
  }

  function setActiveKind(kind) {
    const nextKind = kind === 'phrase' ? 'phrase' : 'word';
    if (nextKind === activeKind) return;
    clearAdvanceTimer();
    activeKind = nextKind;
    store = stores[activeKind];
    requestedIds = uniqueValidIds(requestedIdsByKind[activeKind], activeKind);
    if (!requestedIds.length) requestedIds = uniqueValidIds((api.getWords?.() || []).map((word) => word.id), activeKind);
    requestedLabel = String(requestedLabelsByKind[activeKind] || `${KIND_LABELS[activeKind]} · 当前全词浏览范围`);
    const mode = exerciseMode();
    if (!sessionFor(mode).ids.length && requestedIds.length) {
      newSession(requestedIds, requestedLabel, 'all', mode);
    } else {
      try { localStorage.setItem(ACTIVE_KIND_KEY, activeKind); } catch {}
    }
    answerState = null;
    optionsRevealed = false;
    lastAutoSpokenKey = '';
    if (els.spellingInput) { els.spellingInput.value = ''; els.spellingInput.dataset.wordId = ''; }
    render();
    resetStageScroll();
  }

  function setExerciseMode(mode) {
    if (gateActive()) return;
    if (!EXERCISE_MODES.includes(mode) || mode === exerciseMode()) return;
    clearAdvanceTimer();
    store.currentMode = mode;
    if (!sessionFor(mode).ids.length) {
      const seedIds = requestedIds.length ? requestedIds : uniqueValidIds((api.getWords?.() || []).map((word) => word.id));
      newSession(seedIds, requestedLabel, 'all', mode);
    }
    answerState = null;
    optionsRevealed = false;
    if (els.spellingInput) { els.spellingInput.value = ''; els.spellingInput.dataset.wordId = ''; }
    saveStore();
    render();
    resetStageScroll();
  }

  function open(ids, meta = {}) {
    const suppliedKind = meta.kind === 'phrase' ? 'phrase' : (meta.kind === 'word' ? 'word' : activeKind);
    const split = meta.idsByKind && typeof meta.idsByKind === 'object'
      ? {
        word: uniqueValidIds(meta.idsByKind.word, 'word'),
        phrase: uniqueValidIds(meta.idsByKind.phrase, 'phrase'),
      }
      : {
        word: uniqueValidIds(ids, 'word'),
        phrase: uniqueValidIds(ids, 'phrase'),
      };
    requestedIdsByKind = split;
    requestedLabelsByKind = {
      word: String(meta.labelsByKind?.word || (suppliedKind === 'word' ? meta.label : '') || '单词区 · 当前全词浏览范围'),
      phrase: String(meta.labelsByKind?.phrase || (suppliedKind === 'phrase' ? meta.label : '') || '短语区 · 当前全词浏览范围'),
    };
    activeKind = suppliedKind;
    store = stores[activeKind];
    requestedIds = uniqueValidIds(requestedIdsByKind[activeKind], activeKind);
    requestedLabel = requestedLabelsByKind[activeKind];
    try { localStorage.setItem(ACTIVE_KIND_KEY, activeKind); } catch {}
    if (!gateActive()) {
      const mode = exerciseMode();
      const session = sessionFor(mode);
      const existingIds = uniqueValidIds(session.ids, activeKind);
      if (!existingIds.length || meta.forceNew) newSession(requestedIds, requestedLabel, 'all', mode);
      else session.ids = existingIds;
      if (!sessionFor(mode).ids.length && requestedIds.length) newSession(requestedIds, requestedLabel, 'all', mode);
    }
    if (els.overlay) {
      els.overlay.hidden = false;
      document.body.classList.add('browse-quiz-open');
    }
    answerState = null;
    optionsRevealed = false;
    lastAutoSpokenKey = '';
    render();
    resetStageScroll();
  }

  function close() {
    clearAdvanceTimer();
    if (els.overlay) els.overlay.hidden = true;
    document.body.classList.remove('browse-quiz-open');
    answerState = null;
    optionsRevealed = false;
    if (store.gateSession?.completed) {
      store.gateSession = emptyGateSession();
      saveStore();
    }
  }

  function restartCurrent() {
    if (gateActive()) {
      const ids = pendingGateIds();
      if (!ids.length) return;
      if (!window.confirm('重新开始当前“错词双关通关”吗？每个待回卡仍需重新完成中英选择和拼写两关。')) return;
      store.gateSession = { ids, cursor: 0, stage: 'zhToEn', active: true, completed: false, startedAt: new Date().toISOString() };
      answerState = null;
      optionsRevealed = false;
      saveStore();
      render();
      return;
    }
    if (!requestedIds.length) requestedIds = uniqueValidIds(api.getWords?.().map((word) => word.id), activeKind);
    if (!requestedIds.length) return;
    if (!window.confirm(`只重置“${MODE_LABELS[exerciseMode()]}”自己的题序和位置，另外两种模式进度不变。确定重新开始吗？`)) return;
    newSession(requestedIds, requestedLabel, 'all', exerciseMode());
    render();
  }

  function startWrongOnly() {
    clearAdvanceTimer();
    const ids = pendingGateIds();
    if (!ids.length) {
      window.alert('目前没有待双关的错词。只有在全词独立练习里答错或点“不认识”的词，才会进入回卡池。');
      return;
    }
    store.gateSession = {
      ids,
      cursor: 0,
      stage: 'zhToEn',
      active: true,
      completed: false,
      startedAt: new Date().toISOString(),
    };
    answerState = null;
    optionsRevealed = false;
    if (els.spellingInput) { els.spellingInput.value = ''; els.spellingInput.dataset.wordId = ''; }
    saveStore();
    render();
    resetStageScroll();
  }

  function exportStore() {
    const payload = {
      type: 'word-memory-browse-practice-backup',
      version: STORE_VERSION,
      exportedAt: new Date().toISOString(),
      kind: 'all',
      browsePractice: bundleFromStores(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `全词练习主存档兼容备份-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importStore(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.browsePractice) {
        stores.word = mergeStores(stores.word, parsed.browsePractice.word, 'word');
        stores.phrase = mergeStores(stores.phrase, parsed.browsePractice.phrase, 'phrase');
      } else {
        const incoming = parsed?.browseQuiz || parsed;
        stores[activeKind] = mergeStores(stores[activeKind], incoming, activeKind);
      }
      store = stores[activeKind];
      persistPracticeToMain({ save: true });
      answerState = null;
      lastAutoSpokenKey = '';
      render();
      window.alert('全词练习记录已合并进主存档。');
    } catch (error) {
      window.alert('导入失败：请选择有效的全词练习或主备份JSON。');
    } finally {
      if (els.importInput) els.importInput.value = '';
    }
  }

  function resetStore() {
    if (!window.confirm(`确定只清空“${KIND_LABELS[activeKind]}”的三套题序、对错、双关池、收藏和熟词标记吗？另一分区进度不会受影响，但两区都属于同一份主存档。`)) return;
    store = emptyStore();
    store.resetAt = new Date().toISOString();
    store.updatedAt = store.resetAt;
    stores[activeKind] = store;
    saveStore();
    answerState = null;
    lastAutoSpokenKey = '';
    render();
  }


  let browseBridgeFrame = null;
  let browseBridgeReady = false;
  let browseBridgeSaveTimer = null;

  function postBrowseToBridge() {
    if (!browseBridgeReady || !browseBridgeFrame?.contentWindow) return false;
    try {
      browseBridgeFrame.contentWindow.postMessage({ type: BROWSE_BRIDGE_MESSAGE, action: 'set', payload: bundleFromStores() }, '*');
      return true;
    } catch { return false; }
  }

  function scheduleBrowseBridgeSave() {
    if ((window.location?.protocol || '') !== 'file:') return;
    if (browseBridgeSaveTimer) window.clearTimeout(browseBridgeSaveTimer);
    browseBridgeSaveTimer = window.setTimeout(() => {
      browseBridgeSaveTimer = null;
      postBrowseToBridge();
    }, 220);
  }

  function mergeExternalSnapshot(snapshot, options = {}) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    const beforeWord = practicedCountForStore(stores.word);
    const beforePhrase = practicedCountForStore(stores.phrase);
    stores.word = repairImpossibleSessionCursor(mergeStores(stores.word, snapshot.word, 'word'), 'word').store;
    stores.phrase = repairImpossibleSessionCursor(mergeStores(stores.phrase, snapshot.phrase, 'phrase'), 'phrase').store;
    store = stores[activeKind];
    persistPracticeToMain({ save: options.save !== false });
    const changed = practicedCountForStore(stores.word) !== beforeWord || practicedCountForStore(stores.phrase) !== beforePhrase;
    if (changed || options.forceRender) render();
    return changed;
  }

  function initializeBrowseStableBridge() {
    if ((window.location?.protocol || '') !== 'file:' || browseBridgeFrame) return;
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    frame.src = `${BROWSE_BRIDGE_URL}?v=88`;
    browseBridgeFrame = frame;
    window.addEventListener('message', (event) => {
      if (event.source !== frame.contentWindow) return;
      const data = event.data || {};
      if (data.type !== BROWSE_BRIDGE_MESSAGE) return;
      if (data.action === 'ready') {
        browseBridgeReady = true;
        try { frame.contentWindow.postMessage({ type: BROWSE_BRIDGE_MESSAGE, action: 'get' }, '*'); } catch {}
        return;
      }
      if (data.action === 'value') {
        mergeExternalSnapshot(data.payload || {}, { save: true, forceRender: true });
        postBrowseToBridge();
      }
    });
    frame.addEventListener('load', () => {
      window.setTimeout(() => { try { frame.contentWindow?.postMessage({ type: BROWSE_BRIDGE_MESSAGE, action: 'ping' }, '*'); } catch {} }, 120);
    });
    document.body.appendChild(frame);
  }

  window.addEventListener?.('word-memory-browse-practice-restored', (event) => {
    const incoming = event.detail;
    if (!incoming || typeof incoming !== 'object') return;
    stores.word = repairImpossibleSessionCursor(mergeStores(stores.word, incoming.word, 'word'), 'word').store;
    stores.phrase = repairImpossibleSessionCursor(mergeStores(stores.phrase, incoming.phrase, 'phrase'), 'phrase').store;
    store = stores[activeKind];
    renderLauncherStats();
  });

  // 初次迁移完成后立刻写进主存档；以后每次作答都跟随主存档保存。
  persistPracticeToMain({ save: true });
  initializeBrowseStableBridge();

  els.close?.addEventListener('click', close);
  els.previous?.addEventListener('click', () => move(-1));
  els.next?.addEventListener('click', () => { if (gateActive()) return; if (answerState?.solved) move(1); else if (els.feedback) els.feedback.textContent = `当前词必须${runtimeMode() === 'spelling' ? '拼对' : '选对'}才能进入下一个。`; });
  els.unknown?.addEventListener('click', markUnknown);
  els.restart?.addEventListener('click', restartCurrent);
  els.wrongOnly?.addEventListener('click', startWrongOnly);
  els.milestone?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-browse-milestone-spelling]');
    if (button) startMilestoneSpelling(button.dataset.browseMilestoneSpelling || '');
  });
  els.exportButton?.addEventListener('click', exportStore);
  els.importButton?.addEventListener('click', () => els.importInput?.click());
  els.importInput?.addEventListener('change', () => importStore(els.importInput.files?.[0]));
  els.reset?.addEventListener('click', resetStore);
  els.kindButtons.forEach((button) => button.addEventListener('click', () => setActiveKind(button.dataset.browseQuizKind)));
  els.autoUk?.addEventListener('click', () => {
    autoBritish = !autoBritish;
    lastAutoSpokenKey = '';
    try { localStorage.setItem(AUTO_UK_KEY, autoBritish ? '1' : '0'); } catch {}
    render();
  });
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
    const reveal = event.target.closest('[data-browse-quiz-reveal]');
    if (reveal) {
      optionsRevealed = true;
      answerState = null;
      render();
      return;
    }
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
    if (runtimeMode() === 'enToZh' || answerState?.solved) api.speakWord?.(word.id);
  });
  els.phonetic?.addEventListener('click', () => {
    const word = currentWord();
    if (word && (runtimeMode() === 'enToZh' || answerState?.solved)) api.speakWord?.(word.id);
  });

  document.addEventListener('keydown', (event) => {
    if (!els.overlay || els.overlay.hidden) return;
    if (event.key === 'Escape') { close(); return; }
    const tag = String(event.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); if (!gateActive()) move(-1); return; }
    if (event.key === 'ArrowRight') { event.preventDefault(); if (gateActive()) return; if (answerState?.solved) move(1); else if (els.feedback) els.feedback.textContent = `当前词必须${runtimeMode() === 'spelling' ? '拼对' : '选对'}才能进入下一个。`; return; }
    if (runtimeMode() !== 'spelling' && optionsRevealed && !answerState?.solved) {
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
    setKind: setActiveKind,
    newSession: (ids, label, kind = activeKind) => open(ids, { label, kind, forceNew: true }),
    getStore: (kind = activeKind) => sanitizeStore(stores[kind === 'phrase' ? 'phrase' : 'word'], kind === 'phrase' ? 'phrase' : 'word'),
    getStores: () => ({ word: sanitizeStore(stores.word, 'word'), phrase: sanitizeStore(stores.phrase, 'phrase') }),
    getMainSnapshot: bundleFromStores,
    mergeExternal: (snapshot) => mergeExternalSnapshot(snapshot, { save: true, forceRender: true }),
    storageKeys: { main: 'word-memory-trainer:v1', legacyWord: STORAGE_KEYS.word, legacyPhrase: STORAGE_KEYS.phrase },
    legacyStorageKey: LEGACY_STORAGE_KEY,
  };

  renderLauncherStats();
}());
