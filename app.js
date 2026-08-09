const STORAGE_KEY = "word-memory-trainer:v1";
const MOBILE_DB_NAME = "word-memory-trainer-mobile:v1";
const MOBILE_DB_VERSION = 1;
const MOBILE_DB_STORE = "snapshots";
const MOBILE_DB_PRIMARY_KEY = "words-primary";
const MOBILE_DB_PREVIOUS_KEY = "words-previous";
let mobileDbPromise = null;
let mobileDbWriteChain = Promise.resolve();
let mobileDbHydrated = false;
const SETTINGS_KEY = "word-memory-trainer:settings:v1";
const STUDY_TIME_KEY = "word-memory-trainer:study-time:v1";
const DAILY_COMPLETED_KEY = "word-memory-trainer:daily-completed:v1";
const CONTEXT_STUDY_KEY = "word-memory-trainer:context-study:v1";
const MEMORY_LAB_KEY = "word-memory-trainer:memory-lab:v1";
let dailyCompletedStore = loadDailyCompletedStore();
let contextStudyStore = loadContextStudyStore();
let memoryLabStore = loadMemoryLabStore();

function normalizeAbilityStat(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    correct: Math.max(0, Number(source.correct) || 0),
    wrong: Math.max(0, Number(source.wrong) || 0),
    slow: Math.max(0, Number(source.slow) || 0),
    totalMs: Math.max(0, Number(source.totalMs) || 0),
    lastMs: Math.max(0, Number(source.lastMs) || 0),
    score: Math.max(0, Math.min(100, Number(source.score) || 0)),
    updatedAt: normalizeText(source.updatedAt || ""),
  };
}

function normalizeMemoryLabStore(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const metrics = {};
  Object.entries(source.metrics && typeof source.metrics === "object" ? source.metrics : {}).forEach(([id, item]) => {
    if (!id || !item || typeof item !== "object") return;
    const confusedWith = {};
    Object.entries(item.confusedWith && typeof item.confusedWith === "object" ? item.confusedWith : {}).forEach(([otherId, count]) => {
      const safeCount = Math.max(0, Number(count) || 0);
      if (otherId && safeCount) confusedWith[otherId] = safeCount;
    });
    metrics[id] = {
      recognition: normalizeAbilityStat(item.recognition),
      spelling: normalizeAbilityStat(item.spelling),
      confusedWith,
      resetAt: normalizeText(item.resetAt || ""),
      updatedAt: normalizeText(item.updatedAt || ""),
    };
  });
  const flowSource = source.flow && typeof source.flow === "object" ? source.flow : {};
  const reports = (Array.isArray(source.reports) ? source.reports : []).slice(-30).map((item) => ({
    id: normalizeText(item?.id || ""),
    type: normalizeText(item?.type || ""),
    label: normalizeText(item?.label || ""),
    startedAt: normalizeText(item?.startedAt || ""),
    endedAt: normalizeText(item?.endedAt || ""),
    completed: Math.max(0, Number(item?.completed) || 0),
    correct: Math.max(0, Number(item?.correct) || 0),
    wrong: Math.max(0, Number(item?.wrong) || 0),
    durationSeconds: Math.max(0, Number(item?.durationSeconds) || 0),
    weakIds: (Array.isArray(item?.weakIds) ? item.weakIds : []).map(normalizeText).filter(Boolean).slice(0, 20),
  })).filter((item) => item.id || item.endedAt);
  return {
    version: 1,
    metrics,
    flow: {
      completedSinceRecap: Math.max(0, Number(flowSource.completedSinceRecap) || 0),
      recentIds: (Array.isArray(flowSource.recentIds) ? flowSource.recentIds : []).map(normalizeText).filter(Boolean).slice(-10),
      autoMiniRecap: flowSource.autoMiniRecap !== false,
    },
    reports,
    updatedAt: normalizeText(source.updatedAt || ""),
  };
}

function loadMemoryLabStore() {
  try {
    return normalizeMemoryLabStore(JSON.parse(localStorage.getItem(MEMORY_LAB_KEY) || "{}"));
  } catch {
    return normalizeMemoryLabStore({});
  }
}

function saveMemoryLabStore() {
  memoryLabStore.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(MEMORY_LAB_KEY, JSON.stringify(normalizeMemoryLabStore(memoryLabStore)));
  } catch {
    // The compact mobile/cloud snapshot also carries this data.
  }
}

function mergeMemoryLabStores(localValue = {}, incomingValue = {}) {
  const localStore = normalizeMemoryLabStore(localValue);
  const incomingStore = normalizeMemoryLabStore(incomingValue);
  const merged = normalizeMemoryLabStore(localStore);
  Object.entries(incomingStore.metrics).forEach(([id, item]) => {
    const current = merged.metrics[id] || { recognition: normalizeAbilityStat(), spelling: normalizeAbilityStat(), confusedWith: {}, resetAt: "", updatedAt: "" };
    const resetAt = [current.resetAt || "", item.resetAt || ""].filter(Boolean).sort().pop() || "";
    const resetTime = Date.parse(resetAt || "") || 0;
    const afterResetStat = (stat) => {
      const safe = normalizeAbilityStat(stat);
      const statTime = Date.parse(safe.updatedAt || "") || 0;
      return resetTime && statTime <= resetTime ? normalizeAbilityStat() : safe;
    };
    const mergeStat = (left, right) => {
      const a = afterResetStat(left);
      const b = afterResetStat(right);
      const newer = (b.updatedAt || "") >= (a.updatedAt || "") ? b : a;
      return {
        correct: Math.max(a.correct, b.correct),
        wrong: Math.max(a.wrong, b.wrong),
        slow: Math.max(a.slow, b.slow),
        totalMs: Math.max(a.totalMs, b.totalMs),
        lastMs: newer.lastMs,
        score: newer.score,
        updatedAt: [a.updatedAt, b.updatedAt].filter(Boolean).sort().pop() || "",
      };
    };
    const currentConfusionValid = !resetTime || (Date.parse(current.updatedAt || "") || 0) > resetTime;
    const incomingConfusionValid = !resetTime || (Date.parse(item.updatedAt || "") || 0) > resetTime;
    const confusedWith = currentConfusionValid ? { ...current.confusedWith } : {};
    if (incomingConfusionValid) {
      Object.entries(item.confusedWith || {}).forEach(([otherId, count]) => {
        confusedWith[otherId] = Math.max(Number(confusedWith[otherId]) || 0, Number(count) || 0);
      });
    }
    merged.metrics[id] = {
      recognition: mergeStat(current.recognition, item.recognition),
      spelling: mergeStat(current.spelling, item.spelling),
      confusedWith,
      resetAt,
      updatedAt: [current.updatedAt, item.updatedAt, resetAt].filter(Boolean).sort().pop() || "",
    };
  });
  const reportsById = new Map();
  [...localStore.reports, ...incomingStore.reports].forEach((report) => {
    const key = report.id || `${report.type}|${report.endedAt}`;
    if (!reportsById.has(key) || (report.endedAt || "") > (reportsById.get(key).endedAt || "")) reportsById.set(key, report);
  });
  merged.reports = [...reportsById.values()].sort((a, b) => (a.endedAt || "").localeCompare(b.endedAt || "")).slice(-30);
  const newerFlow = (incomingStore.updatedAt || "") >= (localStore.updatedAt || "") ? incomingStore.flow : localStore.flow;
  merged.flow = {
    completedSinceRecap: Math.max(localStore.flow.completedSinceRecap, incomingStore.flow.completedSinceRecap),
    recentIds: [...new Set([...(newerFlow.recentIds || []), ...(localStore.flow.recentIds || []), ...(incomingStore.flow.recentIds || [])])].slice(-10),
    autoMiniRecap: newerFlow.autoMiniRecap !== false,
  };
  merged.updatedAt = [localStore.updatedAt, incomingStore.updatedAt].filter(Boolean).sort().pop() || "";
  return normalizeMemoryLabStore(merged);
}

function normalizeContextStudyStore(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return Object.entries(source).reduce((out, [key, item]) => {
    if (!key || !item || typeof item !== "object") return out;
    const reviewCount = Math.max(0, Number(item.reviewCount) || 0);
    const marked = Boolean(item.marked);
    if (!marked && reviewCount <= 0) return out;
    out[key] = {
      term: normalizeText(item.term || ""),
      sentence: normalizeText(item.sentence || ""),
      translation: normalizeText(item.translation || ""),
      contextId: normalizeText(item.contextId || ""),
      marked,
      reviewCount,
      lastReviewedAt: normalizeText(item.lastReviewedAt || ""),
      markedAt: normalizeText(item.markedAt || ""),
    };
    return out;
  }, {});
}

function loadContextStudyStore() {
  try {
    return normalizeContextStudyStore(JSON.parse(localStorage.getItem(CONTEXT_STUDY_KEY) || "{}"));
  } catch {
    return {};
  }
}

function saveContextStudyStore() {
  try {
    localStorage.setItem(CONTEXT_STUDY_KEY, JSON.stringify(normalizeContextStudyStore(contextStudyStore)));
  } catch {
    // The same data is also included in the compact mobile/cloud snapshot.
  }
}

function mergeContextStudyStores(localValue = {}, incomingValue = {}) {
  const localStore = normalizeContextStudyStore(localValue);
  const incomingStore = normalizeContextStudyStore(incomingValue);
  const merged = { ...localStore };
  Object.entries(incomingStore).forEach(([key, item]) => {
    const current = merged[key] || {};
    merged[key] = {
      term: item.term || current.term || "",
      sentence: item.sentence || current.sentence || "",
      translation: item.translation || current.translation || "",
      contextId: item.contextId || current.contextId || "",
      marked: Boolean(current.marked || item.marked),
      reviewCount: Math.max(Number(current.reviewCount) || 0, Number(item.reviewCount) || 0),
      lastReviewedAt: [current.lastReviewedAt, item.lastReviewedAt].filter(Boolean).sort().pop() || "",
      markedAt: [current.markedAt, item.markedAt].filter(Boolean).sort().pop() || "",
    };
  });
  return normalizeContextStudyStore(merged);
}

function contextSentenceKey(term, sentence) {
  const helper = window.WordContextStudyEngine;
  if (helper?.legacyContextSentenceKey) {
    return helper.legacyContextSentenceKey(term, sentence);
  }
  const source = `${normalizeText(term).toLowerCase()}|${normalizeText(sentence).toLowerCase()}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `ctx-${(hash >>> 0).toString(36)}`;
}

function contextStudyEntry(word, view) {
  if (!word || !view?.sentenceText) return null;
  const helper = window.WordContextStudyEngine;
  if (helper?.resolveContextStudyEntry) {
    const entry = helper.resolveContextStudyEntry(contextStudyStore, word, view);
    if (entry.migrated) saveContextStudyStore();
    return { key: entry.key, value: entry.value };
  }
  const key = contextSentenceKey(word.term, view.sentenceText);
  return { key, value: contextStudyStore[key] || null };
}

function recordContextReview(word, view) {
  const entry = contextStudyEntry(word, view);
  if (!entry) return;
  const current = entry.value || {};
  contextStudyStore[entry.key] = {
    term: normalizeText(word.term),
    sentence: normalizeText(view.sentenceText),
    translation: normalizeText(view.translationText || ""),
    contextId: normalizeText(view.contextId || ""),
    marked: Boolean(current.marked),
    reviewCount: (Number(current.reviewCount) || 0) + 1,
    lastReviewedAt: new Date().toISOString(),
    markedAt: normalizeText(current.markedAt || ""),
  };
  saveContextStudyStore();
}

function toggleContextSentenceMark(word, view) {
  const entry = contextStudyEntry(word, view);
  if (!entry) return false;
  const current = entry.value || {};
  const marked = !Boolean(current.marked);
  contextStudyStore[entry.key] = {
    term: normalizeText(word.term),
    sentence: normalizeText(view.sentenceText),
    translation: normalizeText(view.translationText || ""),
    contextId: normalizeText(view.contextId || ""),
    marked,
    reviewCount: Math.max(1, Number(current.reviewCount) || 0),
    lastReviewedAt: normalizeText(current.lastReviewedAt || new Date().toISOString()),
    markedAt: marked ? new Date().toISOString() : "",
  };
  saveContextStudyStore();
  saveWords();
  return marked;
}

const REVIEW_STEPS = [
  { label: "20分钟", ms: 20 * 60 * 1000 },
  { label: "1小时", ms: 60 * 60 * 1000 },
  { label: "9小时", ms: 9 * 60 * 60 * 1000 },
  { label: "1天", ms: 24 * 60 * 60 * 1000 },
  { label: "2天", ms: 2 * 24 * 60 * 60 * 1000 },
  { label: "6天", ms: 6 * 24 * 60 * 60 * 1000 },
  { label: "31天", ms: 31 * 24 * 60 * 60 * 1000 },
];
const PROGRESS_MODES = [
  "card", "threeStep", "enToZh", "zhToEn", "choiceZhToEn", "phrase", "spell", "dictation", "forms",
  "plainList", "multiMeaning", "rareMeaning", "fixedPhrase", "spellingWeak", "dictationWeak",
  "posClassify", "nounCountability", "verbTransitivity", "wordFamily", "posContext"
];
const PROGRESS_MODE_LABELS = {
  card: "卡片",
  threeStep: "三步背诵",
  enToZh: "英译中",
  zhToEn: "中译英",
  choiceZhToEn: "中文选英文",
  phrase: "搭配填空",
  spell: "拼写",
  dictation: "听写",
  forms: "变形",
  plainList: "纯文字速刷",
  multiMeaning: "一词多义",
  rareMeaning: "熟词僻义",
  fixedPhrase: "固定搭配",
  spellingWeak: "拼写易错",
  dictationWeak: "听写错词",
  posClassify: "五大词性",
  nounCountability: "名词可数性",
  verbTransitivity: "动词及物性",
  wordFamily: "易混词形",
  posContext: "语境词性",
};
const GRAMMAR_PRACTICE_MODES = new Set(["posClassify", "nounCountability", "verbTransitivity", "wordFamily", "posContext"]);
const MODE_PROGRESS_HINT = "五类语法训练独立记录进度；答题后自动进入下一题";
const WORD_SOURCES = ["全方位", "Word List", "四级", "蓝色森林", "短语练习", "听写内容"];
const LIST_MASK_MODES = ["show", "hideEnglish", "hideChinese"];
const CLOUD_CONFIG_KEY = "word-memory-trainer:cloud-config:v1";
const SHARE_BASE_URL_KEY = "word-memory-trainer:share-base-url:v1";
const SUPABASE_SETTINGS_KEY = "word-memory-trainer:supabase-settings:v1";
const CLOUD_REQUEST_TIMEOUT_MS = 12000;
const DEFAULT_SUPABASE_URL = "https://fsizdxkwrxzopkoouipr.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BfWyJfb6c4GrV0JYLXejUg_QnkuhPvw";
const DEFAULT_SHARE_BASE_URL = "https://your-name.github.io/word-memory/";
const CLOUD_URL_PARAMS = typeof URLSearchParams !== "undefined"
  ? new URLSearchParams(window.location?.search || "")
  : { get: () => "" };
const PUBLIC_VIEWER_SLUG = normalizeCloudSlug(CLOUD_URL_PARAMS.get("public") || "");
const EDITOR_VIEW_SLUG = normalizeCloudSlug(CLOUD_URL_PARAMS.get("edit") || "");
let suppressCloudSync = false;
let cloudSyncTimer = null;
let wordSaveTimer = null;
let pendingWordSave = false;
let pendingWordSaveSkipCloud = true;
let backgroundRenderHandle = null;
let lastSpeechKey = "";
let lastSpeechAt = 0;
let activeAudioElement = null;
const CLOUD_STUDY_TIME_META_ID = "__word_memory_study_time_meta__";
const CLOUD_COMPACT_PAYLOAD_ID = "__word_memory_compact_payload__";

const BUILTIN_PACKAGE_KEY = "word-memory-trainer:dictation-repair-20260730:b008:v70-b012-buffer-enter-20260801";
const FORCE_SEPARATE_BUILTIN_ID_PREFIXES = ["dictation-1-", "dictation-2-", "dictation-3-", "dictation-4-"]; // 四次听写均保留独立词条与独立学习进度，不受其他词库中同词状态影响。

const BUILTIN_GROUP_ALIASES = {
  "四级 7": new Set(["stale", "fashion", "fashionable", "contemporary", "temple", "temporary", "temporarily", "abundant", "abundance", "ample", "mass", "massive", "massage", "numerous", "number", "multiply", "multiple", "multiplication", "gang", "band", "bandage", "sort", "resort", "flock", "crowd", "crowded", "dozen", "population", "populous", "populate", "popularity", "popular", "prevail", "prevalent", "prevalence", "available", "availability", "crew", "screw", "colleague", "personnel", "staff", "stuff", "stuffy", "stuffing", "infant", "adolescent", "idle", "idly", "youngster"]),
};

function builtinGroupAliasesForTerm(term = "") {
  const key = normalizeText(term).toLowerCase();
  return Object.entries(BUILTIN_GROUP_ALIASES)
    .filter(([, terms]) => terms.has(key))
    .map(([group]) => group);
}
const BUILTIN_WORDS = Array.isArray(window.WORD_MEMORY_WORDS) ? window.WORD_MEMORY_WORDS : [];
const ALL_BUILTIN_WORDS = BUILTIN_WORDS;
const BUILTIN_ID_ALIASES = (window.WORD_MEMORY_ID_ALIASES && typeof window.WORD_MEMORY_ID_ALIASES === "object") ? window.WORD_MEMORY_ID_ALIASES : {};
let shouldPersistBuiltinWords = false;
let restoredStudySession = null;

function normalizeStudySessionSnapshot(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const allowedModes = new Set(["due", "new", "all", "weak"]);
  return {
    mode: allowedModes.has(source.mode) ? source.mode : "due",
    activeGroup: normalizeText(source.activeGroup || "all") || "all",
    activeId: normalizeText(source.activeId || "") || null,
    savedAt: normalizeText(source.savedAt || source.updatedAt || ""),
  };
}

const els = {
  mobileFocusEntry: document.querySelector("#mobileFocusEntry"),
  mobileFocusEntryHint: document.querySelector("#mobileFocusEntryHint"),
  mobileFocusMode: document.querySelector("#mobileFocusMode"),
  mobileFocusModeSwitch: document.querySelector("#mobileFocusModeSwitch"),
  mobileFocusKicker: document.querySelector("#mobileFocusKicker"),
  mobileFocusTip: document.querySelector("#mobileFocusTip"),
  mobileFocusSpelling: document.querySelector("#mobileFocusSpelling"),
  mobileFocusSpellingInput: document.querySelector("#mobileFocusSpellingInput"),
  mobileFocusSpellingCheck: document.querySelector("#mobileFocusSpellingCheck"),
  mobileFocusSpellingClear: document.querySelector("#mobileFocusSpellingClear"),
  mobileFocusSpellingFeedback: document.querySelector("#mobileFocusSpellingFeedback"),
  totalCount: document.querySelector("#totalCount"),
  totalStudyTime: document.querySelector("#totalStudyTime"),
  todayStudyTime: document.querySelector("#todayStudyTime"),
  dueCount: document.querySelector("#dueCount"),
  todayCount: document.querySelector("#todayCount"),
  todayWordActionCount: document.querySelector("#todayWordActionCount"),
  todayPhraseActionCount: document.querySelector("#todayPhraseActionCount"),
  doneTodayCount: document.querySelector("#doneTodayCount"),
  examDays: document.querySelector("#examDays"),
  examDateInput: document.querySelector("#examDateInput"),
  todayNewTarget: document.querySelector("#todayNewTarget"),
  todayReviewTarget: document.querySelector("#todayReviewTarget"),
  todayNewHint: document.querySelector("#todayNewHint"),
  todayReviewHint: document.querySelector("#todayReviewHint"),
  importantCount: document.querySelector("#importantCount"),
  estimateMinutes: document.querySelector("#estimateMinutes"),
  clockNow: document.querySelector("#clockNow"),
  sprintStatus: document.querySelector("#sprintStatus"),
  dailyReport: document.querySelector("#dailyReport"),
  activeCard: document.querySelector("#activeCard"),
  todayTimeline: document.querySelector("#todayTimeline"),
  groupProgress: document.querySelector("#groupProgress"),
  wordList: document.querySelector("#wordList"),
  wordForm: document.querySelector("#wordForm"),
  termInput: document.querySelector("#termInput"),
  meaningInput: document.querySelector("#meaningInput"),
  phraseInput: document.querySelector("#phraseInput"),
  tagInput: document.querySelector("#tagInput"),
  sourceInput: document.querySelector("#sourceInput"),
  thirdPersonInput: document.querySelector("#thirdPersonInput"),
  pastTenseInput: document.querySelector("#pastTenseInput"),
  pastParticipleInput: document.querySelector("#pastParticipleInput"),
  noteInput: document.querySelector("#noteInput"),
  clearFormButton: document.querySelector("#clearFormButton"),
  bulkInput: document.querySelector("#bulkInput"),
  bulkAddButton: document.querySelector("#bulkAddButton"),
  clearBulkButton: document.querySelector("#clearBulkButton"),
  searchInput: document.querySelector("#searchInput"),
  statusFilter: document.querySelector("#statusFilter"),
  librarySourceFilter: document.querySelector("#librarySourceFilter"),
  listMaskMode: document.querySelector("#listMaskMode"),
  bulkSourceInput: document.querySelector("#bulkSourceInput"),
  importButton: document.querySelector("#importButton"),
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  startNewButton: document.querySelector("#startNewButton"),
  batchLearnButton: document.querySelector("#batchLearnButton"),
  sprintButton: document.querySelector("#sprintButton"),
  gazeControlButton: document.querySelector("#gazeControlButton"),
  gazePanel: document.querySelector("#gazePanel"),
  gazeStatus: document.querySelector("#gazeStatus"),
  gazeGuide: document.querySelector("#gazeGuide"),
  gazeStopButton: document.querySelector("#gazeStopButton"),
  cloudSyncButton: document.querySelector("#cloudSyncButton"),
  focusDueButton: document.querySelector("#focusDueButton"),
  weakOnlyButton: document.querySelector("#weakOnlyButton"),
  dictationOrderSelect: document.querySelector("#dictationOrderSelect"),
  copyPlanButton: document.querySelector("#copyPlanButton"),
  dueModeButton: document.querySelector("#dueModeButton"),
  newModeButton: document.querySelector("#newModeButton"),
  allModeButton: document.querySelector("#allModeButton"),
  readonlyBanner: document.querySelector("#readonlyBanner"),
  cloudDialog: document.querySelector("#cloudDialog"),
  cloudForm: document.querySelector("#cloudForm"),
  closeCloudButton: document.querySelector("#closeCloudButton"),
  cancelCloudButton: document.querySelector("#cancelCloudButton"),
  loadCloudButton: document.querySelector("#loadCloudButton"),
  tryCloudSaveButton: document.querySelector("#tryCloudSaveButton"),
  localSaveButton: document.querySelector("#localSaveButton"),
  copyPublicLinkButton: document.querySelector("#copyPublicLinkButton"),
  copyEditLinkButton: document.querySelector("#copyEditLinkButton"),
  cloudSlugInput: document.querySelector("#cloudSlugInput"),
  cloudNameInput: document.querySelector("#cloudNameInput"),
  cloudPinInput: document.querySelector("#cloudPinInput"),
  cloudPublicInput: document.querySelector("#cloudPublicInput"),
  supabaseUrlInput: document.querySelector("#supabaseUrlInput"),
  supabaseKeyInput: document.querySelector("#supabaseKeyInput"),
  shareBaseUrlInput: document.querySelector("#shareBaseUrlInput"),
  cloudStatus: document.querySelector("#cloudStatus"),
  toast: document.querySelector("#toast"),
};

function createPracticeSessions(initialMode = "due") {
  return PROGRESS_MODES.reduce((sessions, mode) => {
    sessions[mode] = {
      mode: initialMode,
      activeId: null,
    };
    return sessions;
  }, {});
}

const initialWords = loadWords();
const initialStudySession = normalizeStudySessionSnapshot(restoredStudySession || {});
const initialPracticeSessions = createPracticeSessions(initialStudySession.mode);
initialPracticeSessions.card = {
  mode: initialStudySession.mode,
  activeId: initialStudySession.activeId,
};

const state = {
  words: initialWords,
  settings: loadSettings(),
  studyTime: loadStudyTime(),
  mode: initialStudySession.mode,
  practiceMode: "card",
  practiceSessions: initialPracticeSessions,
  dictationOrder: "due",
  activeGroup: initialStudySession.activeGroup,
  sprint: {
    active: false,
    startedAt: "",
    endsAt: "",
    completed: 0,
  },
  activeId: initialStudySession.activeId,
  answerVisible: false,
  spellingDraft: "",
  spellingResult: null,
  formDrafts: {
    third: "",
    past: "",
    participle: "",
  },
  formResult: null,
  revealStep: 0,
  contextIndex: 0,
  contextExpanded: false,
  choiceResult: null,
  pendingRatingMeta: null,
  quickSession: {
    active: false,
    ending: false,
    id: "",
    type: "",
    label: "",
    queueIds: [],
    questionModes: [],
    startedAt: "",
    endsAt: "",
    completed: 0,
    correct: 0,
    wrong: 0,
    results: [],
    streaks: {},
    original: null,
  },
  posQuizResult: null,
  lastAutoSpokenId: null,
  gazeControl: {
    enabled: false,
    starting: false,
    mode: "",
    lastZone: "center",
    lastTargetKey: "",
    zoneStartedAt: 0,
    cooldownUntil: 0,
    dwellMs: 2400,
    safeDwellMs: 2000,
    confirmDwellMs: 1600,
    pendingTargetKey: "",
    pendingTargetLabel: "",
    pendingUntil: 0,
    fallbackStream: null,
    fallbackVideo: null,
    fallbackCanvas: null,
    fallbackTimer: null,
    fallbackBaseline: null,
    fallbackSamples: [],
  },
  fingerControl: {
    enabled: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startedAt: 0,
    pendingAction: "",
    pendingLabel: "",
    pendingUntil: 0,
  },
  reviewUndo: null,
  query: "",
  filter: "all",
  librarySourceFilter: "all",
  listMaskMode: "show",
  wordListLimit: 40,
  cloud: {
    config: loadCloudConfig(),
    canEdit: !PUBLIC_VIEWER_SLUG && !EDITOR_VIEW_SLUG,
  },
};

function ensurePracticeSession(mode = state.practiceMode) {
  if (!state.practiceSessions || typeof state.practiceSessions !== "object") {
    state.practiceSessions = createPracticeSessions(state.mode || "due");
  }
  if (!state.practiceSessions[mode]) {
    state.practiceSessions[mode] = {
      mode: state.mode || "due",
      activeId: null,
    };
  }
  return state.practiceSessions[mode];
}

function savePracticeSession() {
  const session = ensurePracticeSession();
  session.mode = state.mode;
  session.activeId = state.activeId;
}

function restorePracticeSession(mode, fallbackMode = state.mode) {
  const session = ensurePracticeSession(mode);
  state.mode = session.mode || fallbackMode || "due";
  state.activeId = session.activeId || null;
}

function setActiveId(id) {
  const nextId = id || null;
  if (nextId !== state.activeId) {
    state.contextExpanded = false;
    state.contextIndex = 0;
  }
  state.activeId = nextId;
  ensurePracticeSession().activeId = state.activeId;
}

function captureStudySessionSnapshot() {
  const cardSession = ensurePracticeSession("card");
  if (state.practiceMode === "card") {
    cardSession.mode = state.mode;
    cardSession.activeId = state.activeId;
  }
  return normalizeStudySessionSnapshot({
    mode: cardSession.mode || state.mode,
    activeGroup: state.activeGroup,
    activeId: cardSession.activeId ?? (state.practiceMode === "card" ? state.activeId : null),
    savedAt: new Date().toISOString(),
  });
}

function applyStudySessionSnapshot(value, options = {}) {
  const snapshot = normalizeStudySessionSnapshot(value || {});
  state.practiceMode = "card";
  state.mode = snapshot.mode;
  state.activeGroup = snapshot.activeGroup;
  state.practiceSessions = state.practiceSessions && typeof state.practiceSessions === "object"
    ? state.practiceSessions
    : createPracticeSessions(snapshot.mode);
  state.practiceSessions.card = {
    mode: snapshot.mode,
    activeId: snapshot.activeId,
  };
  state.activeId = snapshot.activeId;
  state.answerVisible = false;
  state.reviewUndo = null;
  resetTypingState();
  state.lastAutoSpokenId = null;
  if (options.ensureValid !== false) chooseActiveWord(false);
  return snapshot;
}

function setStudyMode(mode) {
  state.mode = mode;
  const session = ensurePracticeSession();
  session.mode = mode;
  session.activeId = null;
  state.activeId = null;
}

function switchPracticeMode(mode) {
  if (!PROGRESS_MODES.includes(mode) || mode === state.practiceMode) {
    return;
  }
  savePracticeSession();
  state.practiceMode = mode;
  restorePracticeSession(mode, state.mode);
  state.answerVisible = false;
  resetTypingState();
  state.lastAutoSpokenId = null;
  if (GRAMMAR_PRACTICE_MODES.has(mode)) {
    state.mode = "all";
    ensurePracticeSession(mode).mode = "all";
    state.activeId = null;
    ensurePracticeSession(mode).activeId = null;
  }
  render();
}

function createId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `word-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowDate() {
  return new Date();
}

function todayKey(date = nowDate()) {
  return date.toISOString().slice(0, 10);
}

function normalizeDailyCompletedStore(raw = {}) {
  const source = raw && typeof raw === "object" && raw.days && typeof raw.days === "object" ? raw.days : raw;
  const days = {};
  Object.entries(source && typeof source === "object" ? source : {}).forEach(([date, entry]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !entry || typeof entry !== "object") return;
    const words = [...new Set((Array.isArray(entry.words) ? entry.words : []).map(normalizeText).filter(Boolean))];
    const phrases = [...new Set((Array.isArray(entry.phrases) ? entry.phrases : []).map(normalizeText).filter(Boolean))];
    if (!words.length && !phrases.length) return;
    days[date] = {
      words,
      phrases,
      updatedAt: entry.updatedAt || "",
    };
  });
  const dates = Object.keys(days).sort().slice(-120);
  return {
    days: Object.fromEntries(dates.map((date) => [date, days[date]])),
    updatedAt: raw?.updatedAt || "",
  };
}

function loadDailyCompletedStore() {
  try {
    return normalizeDailyCompletedStore(JSON.parse(localStorage.getItem(DAILY_COMPLETED_KEY) || "{}"));
  } catch {
    return normalizeDailyCompletedStore({});
  }
}

function mergeDailyCompletedStores(localValue = {}, incomingValue = {}) {
  const local = normalizeDailyCompletedStore(localValue);
  const incoming = normalizeDailyCompletedStore(incomingValue);
  const merged = { days: {}, updatedAt: new Date().toISOString() };
  const dates = new Set([...Object.keys(local.days), ...Object.keys(incoming.days)]);
  dates.forEach((date) => {
    const left = local.days[date] || {};
    const right = incoming.days[date] || {};
    const words = [...new Set([...(left.words || []), ...(right.words || [])])];
    const phrases = [...new Set([...(left.phrases || []), ...(right.phrases || [])])];
    if (words.length || phrases.length) {
      merged.days[date] = {
        words,
        phrases,
        updatedAt: [left.updatedAt || "", right.updatedAt || ""].sort().at(-1) || "",
      };
    }
  });
  return normalizeDailyCompletedStore(merged);
}

function saveDailyCompletedStore() {
  dailyCompletedStore = normalizeDailyCompletedStore(dailyCompletedStore);
  try {
    localStorage.setItem(DAILY_COMPLETED_KEY, JSON.stringify(dailyCompletedStore));
    return true;
  } catch {
    return false;
  }
}

function dailyCompletedWordId(word) {
  return normalizeText(word?.id) || `term:${normalizeText(word?.term).toLowerCase()}`;
}

function ensureDailyCompletedDay(date = todayKey()) {
  if (!dailyCompletedStore || typeof dailyCompletedStore !== "object") {
    dailyCompletedStore = normalizeDailyCompletedStore({});
  }
  if (!dailyCompletedStore.days[date]) {
    dailyCompletedStore.days[date] = { words: [], phrases: [], updatedAt: "" };
  }
  return dailyCompletedStore.days[date];
}

function markDailyCompleted(word, completedAt = nowDate()) {
  if (!word) return;
  const date = todayKey(completedAt instanceof Date ? completedAt : new Date(completedAt));
  const entry = ensureDailyCompletedDay(date);
  const id = dailyCompletedWordId(word);
  const target = isPhraseWord(word) ? entry.phrases : entry.words;
  const other = isPhraseWord(word) ? entry.words : entry.phrases;
  if (!target.includes(id)) target.push(id);
  const otherIndex = other.indexOf(id);
  if (otherIndex >= 0) other.splice(otherIndex, 1);
  entry.updatedAt = new Date().toISOString();
  dailyCompletedStore.updatedAt = entry.updatedAt;
}

function wordHasCompletedEntryOnDate(word, date = todayKey()) {
  const acceptedResults = new Set(["new", "remember", "fuzzy", "forgot"]);
  const records = [];
  if (Array.isArray(word?.history)) records.push(...word.history);
  Object.values(word?.progress || {}).forEach((progress) => {
    if (Array.isArray(progress?.history)) records.push(...progress.history);
  });
  return records.some((entry) => entry?.time && acceptedResults.has(entry.result) && todayKey(new Date(entry.time)) === date);
}

function reconcileDailyCompletedWord(word, date = todayKey()) {
  if (!word) return;
  const entry = ensureDailyCompletedDay(date);
  const id = dailyCompletedWordId(word);
  entry.words = entry.words.filter((item) => item !== id);
  entry.phrases = entry.phrases.filter((item) => item !== id);
  if (wordHasCompletedEntryOnDate(word, date)) {
    const target = isPhraseWord(word) ? entry.phrases : entry.words;
    target.push(id);
  }
  entry.updatedAt = new Date().toISOString();
  dailyCompletedStore.updatedAt = entry.updatedAt;
}

function syncTodayCompletedFromHistories() {
  state.words.forEach((word) => {
    if (wordHasCompletedEntryOnDate(word)) markDailyCompleted(word);
  });
}

function dailyCompletedCounts(date = todayKey()) {
  const entry = normalizeDailyCompletedStore(dailyCompletedStore).days[date] || { words: [], phrases: [] };
  return {
    words: entry.words.length,
    phrases: entry.phrases.length,
    total: entry.words.length + entry.phrases.length,
  };
}

function dateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultExamDate() {
  const now = nowDate();
  const currentYearExam = new Date(now.getFullYear(), 3, 18);
  const exam = currentYearExam >= now ? currentYearExam : new Date(now.getFullYear() + 1, 3, 18);
  return dateInputValue(exam);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeWordSource(value) {
  const source = normalizeText(value);
  return WORD_SOURCES.includes(source) ? source : "全方位";
}

function normalizeWordSources(word = {}) {
  const rawSources = [
    ...(Array.isArray(word.sources) ? word.sources : []),
    word.source,
    word.category,
    word.book,
  ].filter(Boolean);
  const sources = [...new Set(rawSources.map(normalizeWordSource))];
  return sources.length ? sources : ["全方位"];
}

function wordSources(word) {
  const sources = normalizeWordSources(word);
  word.sources = sources;
  word.source = sources[0];
  return sources;
}

function mergeWordSources(existing, incoming) {
  return [...new Set([
    ...normalizeWordSources(existing),
    ...normalizeWordSources(incoming),
  ])];
}

function sourceOptionsHTML(selected = "全方位", includeAll = false) {
  const options = includeAll ? [{ value: "all", label: "全部分类" }] : [];
  WORD_SOURCES.forEach((source) => options.push({ value: source, label: source }));
  return options.map((option) => `
    <option value="${escapeHTML(option.value)}"${option.value === selected ? " selected" : ""}>${escapeHTML(option.label)}</option>`).join("");
}

function maskedText(value, type) {
  const text = normalizeText(value);
  if (type === "english" && state.listMaskMode === "hideEnglish") {
    return `<span class="masked-value">英文已遮住</span>`;
  }
  if (type === "chinese" && state.listMaskMode === "hideChinese") {
    return `<span class="masked-value">中文已遮住</span>`;
  }
  return escapeHTML(text);
}

function renderLibrarySourceFilters() {
  if (els.sourceInput && !els.sourceInput.dataset.ready) {
    els.sourceInput.innerHTML = sourceOptionsHTML("全方位");
    els.sourceInput.dataset.ready = "1";
  }
  if (els.bulkSourceInput && !els.bulkSourceInput.dataset.ready) {
    els.bulkSourceInput.innerHTML = sourceOptionsHTML("全方位");
    els.bulkSourceInput.dataset.ready = "1";
  }
  if (els.librarySourceFilter && !els.librarySourceFilter.dataset.ready) {
    els.librarySourceFilter.innerHTML = sourceOptionsHTML(state.librarySourceFilter, true);
    els.librarySourceFilter.dataset.ready = "1";
  }
  if (els.librarySourceFilter && els.librarySourceFilter.value !== state.librarySourceFilter) {
    els.librarySourceFilter.value = state.librarySourceFilter;
  }
  if (els.listMaskMode && els.listMaskMode.value !== state.listMaskMode) {
    els.listMaskMode.value = state.listMaskMode;
  }
}

function mergeStudyText(current, incoming) {
  const currentText = normalizeText(current);
  const incomingText = normalizeText(incoming);
  if (!incomingText) {
    return currentText;
  }
  if (!currentText) {
    return incomingText;
  }
  return incomingText
    .split(/[；;]/)
    .map(normalizeText)
    .filter(Boolean)
    .reduce((merged, item) => (merged.includes(item) ? merged : `${merged}；${item}`), currentText);
}

function normalizeSpelling(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSpellingCorrect(input, word) {
  return normalizeSpelling(input) === normalizeSpelling(word.term);
}

const IRREGULAR_VERB_FORMS = {
  be: { third: "is", past: "was", participle: "been" },
  have: { third: "has", past: "had", participle: "had" },
  do: { third: "does", past: "did", participle: "done" },
  go: { third: "goes", past: "went", participle: "gone" },
  buy: { past: "bought", participle: "bought" },
  sell: { past: "sold", participle: "sold" },
  take: { past: "took", participle: "taken" },
  know: { past: "knew", participle: "known" },
  see: { past: "saw", participle: "seen" },
  feel: { past: "felt", participle: "felt" },
  hear: { past: "heard", participle: "heard" },
  speak: { past: "spoke", participle: "spoken" },
  tell: { past: "told", participle: "told" },
  read: { past: "read", participle: "read" },
  say: { third: "says", past: "said", participle: "said" },
  give: { past: "gave", participle: "given" },
  make: { past: "made", participle: "made" },
  write: { past: "wrote", participle: "written" },
  come: { past: "came", participle: "come" },
  run: { past: "ran", participle: "run" },
  eat: { past: "ate", participle: "eaten" },
  drink: { past: "drank", participle: "drunk" },
  begin: { past: "began", participle: "begun" },
  swim: { past: "swam", participle: "swum" },
  lend: { past: "lent", participle: "lent" },
  spend: { past: "spent", participle: "spent" },
  cost: { past: "cost", participle: "cost" },
  pay: { third: "pays", past: "paid", participle: "paid" },
  bring: { past: "brought", participle: "brought" },
  think: { past: "thought", participle: "thought" },
  teach: { past: "taught", participle: "taught" },
  catch: { past: "caught", participle: "caught" },
  keep: { past: "kept", participle: "kept" },
  sleep: { past: "slept", participle: "slept" },
  leave: { past: "left", participle: "left" },
  meet: { past: "met", participle: "met" },
  get: { past: "got", participle: "gotten" },
  forget: { past: "forgot", participle: "forgotten" },
  understand: { past: "understood", participle: "understood" },
  stand: { past: "stood", participle: "stood" },
  choose: { past: "chose", participle: "chosen" },
  break: { past: "broke", participle: "broken" },
  drive: { past: "drove", participle: "driven" },
  ride: { past: "rode", participle: "ridden" },
  build: { past: "built", participle: "built" },
  send: { past: "sent", participle: "sent" },
  sit: { past: "sat", participle: "sat" },
  cut: { past: "cut", participle: "cut" },
  put: { past: "put", participle: "put" },
  let: { past: "let", participle: "let" },
};

function emptyVerbForms() {
  return { third: "", past: "", participle: "" };
}

function canInferVerbForms(term) {
  return /^[a-z]+$/i.test(normalizeText(term));
}

function thirdPersonForm(base) {
  if (/(ch|sh|s|x|z|o)$/i.test(base)) {
    return `${base}es`;
  }
  if (/[^aeiou]y$/i.test(base)) {
    return `${base.slice(0, -1)}ies`;
  }
  return `${base}s`;
}

function regularPastForm(base) {
  if (/e$/i.test(base)) {
    return `${base}d`;
  }
  if (/[^aeiou]y$/i.test(base)) {
    return `${base.slice(0, -1)}ied`;
  }
  if (/[^aeiou][aeiou][^aeiouwxy]$/i.test(base) && base.length <= 6) {
    return `${base}${base.slice(-1)}ed`;
  }
  return `${base}ed`;
}

function inferVerbForms(term) {
  const base = normalizeText(term).toLowerCase();
  if (!canInferVerbForms(base)) {
    return emptyVerbForms();
  }
  const irregular = IRREGULAR_VERB_FORMS[base] || {};
  const past = irregular.past || regularPastForm(base);
  return {
    third: irregular.third || thirdPersonForm(base),
    past,
    participle: irregular.participle || past,
  };
}

function verbForms(word) {
  const inferred = inferVerbForms(word.term);
  const saved = word.forms || {};
  return {
    third: normalizeText(saved.third || saved.thirdPerson || word.thirdPerson || inferred.third),
    past: normalizeText(saved.past || saved.pastTense || word.pastTense || inferred.past),
    participle: normalizeText(saved.participle || saved.pastParticiple || word.pastParticiple || inferred.participle),
  };
}

function hasVerbForms(word) {
  const forms = verbForms(word);
  return Boolean(forms.third || forms.past || forms.participle);
}

function isVerbFormsCorrect(drafts, word) {
  const forms = verbForms(word);
  const keys = ["third", "past", "participle"].filter((key) => forms[key]);
  return keys.length > 0 && keys.every((key) => normalizeSpelling(drafts[key]) === normalizeSpelling(forms[key]));
}

function verbFormsAnswerText(word) {
  const forms = verbForms(word);
  return `三单：${forms.third || "-"}  过去式：${forms.past || "-"}  过去分词：${forms.participle || "-"}`;
}

function speechSupported() {
  return Boolean(
    typeof window !== "undefined" &&
    window.speechSynthesis &&
    window.SpeechSynthesisUtterance
  );
}

function cleanPronunciationText(term) {
  const raw = normalizeText(term)
    .replace(/（[^）]*）/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[：:：].*$/g, " ")
    .replace(/\b(sth|sb)\.?\b/gi, "")
    .replace(/\+/g, " ")
    .replace(/…|\.\.\./g, " ")
    .replace(/[^a-zA-Z'\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return raw || normalizeText(term).replace(/[^a-zA-Z'\-\s]/g, " ").replace(/\s+/g, " ").trim();
}

function isMobilePronunciationContext() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const touchMac = platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod|Android|Mobile|Mobi/i.test(ua) || touchMac;
}

function primeSpeechVoices() {
  if (!speechSupported()) return;
  try {
    window.speechSynthesis.getVoices?.();
  } catch (err) {
    // 忽略语音列表预热失败
  }
}

function stopCurrentPronunciation() {
  try {
    if (activeAudioElement) {
      activeAudioElement.pause();
      activeAudioElement.src = "";
      activeAudioElement.load?.();
    }
  } catch {
    // 忽略停止在线音频失败
  }
  activeAudioElement = null;
  try {
    if (speechSupported()) {
      window.speechSynthesis.cancel();
    }
  } catch {
    // 忽略停止系统朗读失败
  }
}

function useSpeechFallback(text, accent = "us", options = {}) {
  if (!speechSupported()) {
    if (!options.silent) {
      showToast("当前浏览器不支持自动读音");
    }
    return false;
  }
  const normalized = normalizeText(text);
  const speechKey = `${accent}:${normalized.toLowerCase()}`;
  const now = Date.now();
  if (speechKey === lastSpeechKey && now - lastSpeechAt < 550) {
    return true;
  }
  lastSpeechKey = speechKey;
  lastSpeechAt = now;
  stopCurrentPronunciation();
  const utterance = new window.SpeechSynthesisUtterance(normalized);
  utterance.lang = accent === "uk" ? "en-GB" : "en-US";
  utterance.rate = 0.9;
  utterance.pitch = 1;
  const voices = window.speechSynthesis.getVoices?.() || [];
  const preferred = voices.find((v) => v.lang === utterance.lang && /Google|Microsoft|Natural|Daniel|Samantha|Alex|Serena/i.test(v.name))
    || voices.find((v) => v.lang === utterance.lang)
    || voices.find((v) => /^en[-_]/i.test(v.lang));
  if (preferred) {
    utterance.voice = preferred;
  }
  utterance.onerror = () => {
    if (!options.silent) {
      showToast("读音被浏览器拦截，重新点一次即可");
    }
  };
  try {
    window.speechSynthesis.speak(utterance);
    window.setTimeout(() => {
      try { window.speechSynthesis.resume?.(); } catch {}
    }, 80);
    return true;
  } catch {
    if (!options.silent) {
      showToast("当前浏览器读音失败");
    }
    return false;
  }
}

function pronunciationAudioUrls(text, accent = "us") {
  const q = encodeURIComponent(text.toLowerCase());
  const type = accent === "uk" ? 1 : 2;
  const dashed = text.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-+|-+$/g, "");
  const urls = [];
  if (q) {
    // 在线词典标准音频优先；失败后自动走浏览器英/美音兜底。
    urls.push(`https://dict.youdao.com/dictvoice?type=${type}&audio=${q}`);
  }
  if (dashed && !dashed.includes("-")) {
    urls.push(`https://ssl.gstatic.com/dictionary/static/sounds/oxford/${dashed}--_${accent === "uk" ? "gb" : "us"}_1.mp3`);
  }
  return urls;
}

function playAudioUrl(url) {
  return new Promise((resolve, reject) => {
    stopCurrentPronunciation();
    const audio = new Audio();
    activeAudioElement = audio;
    audio.preload = "auto";
    audio.src = url;
    let settled = false;
    const cleanup = () => {
      if (activeAudioElement === audio) activeAudioElement = null;
      audio.oncanplay = null;
      audio.onerror = null;
      audio.onended = null;
    };
    const finish = (ok, err) => {
      if (settled) return;
      settled = true;
      cleanup();
      ok ? resolve(true) : reject(err || new Error("audio failed"));
    };
    audio.oncanplay = () => {
      audio.play().then(() => finish(true)).catch((err) => finish(false, err));
    };
    audio.onerror = () => finish(false, new Error("audio failed"));
    try {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise.then(() => finish(true)).catch(() => {
          try { audio.load(); } catch (err) { finish(false, err); }
        });
      } else {
        audio.load();
      }
    } catch (err) {
      try { audio.load(); } catch (loadErr) { finish(false, loadErr); }
    }
    window.setTimeout(() => finish(false, new Error("audio timeout")), 2800);
  });
}

async function speakTerm(term, options = {}) {
  const text = cleanPronunciationText(term);
  const accent = options.accent === "uk" ? "uk" : "us";
  if (!text) {
    if (!options.silent) showToast("这个词条没有可朗读的英文");
    return false;
  }

  // v45：读音改为优先使用浏览器/手机系统语音，避免在线音频请求等待、连点排队、一次性爆音。
  // 每次播放前都会停止上一次读音；550ms 内重复点击同一个词会直接忽略。
  return useSpeechFallback(text, accent, options);
}

if (typeof window !== "undefined") {
  window.speakTerm = speakTerm;
  window.addEventListener("DOMContentLoaded", primeSpeechVoices, { once: true });
}

function escapeHTML(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      examDate: parsed.examDate || defaultExamDate(),
    };
  } catch {
    return { examDate: defaultExamDate() };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch {
    showToast("设置保存失败");
  }
}

function normalizeStudyTime(raw = {}) {
  const today = todayKey();
  const totalSeconds = Math.max(0, Math.floor(Number(raw.totalSeconds || 0)));
  const savedToday = raw.today === today ? Math.max(0, Math.floor(Number(raw.todaySeconds || 0))) : 0;
  return {
    totalSeconds,
    todaySeconds: savedToday,
    today,
    updatedAt: raw.updatedAt || "",
  };
}

function loadStudyTime() {
  try {
    return normalizeStudyTime(JSON.parse(localStorage.getItem(STUDY_TIME_KEY) || "{}"));
  } catch {
    return normalizeStudyTime({});
  }
}

function mergeStudyTimeForCloud(localValue, cloudValue) {
  const local = normalizeStudyTime(localValue || {});
  const cloud = normalizeStudyTime(cloudValue || {});
  const today = todayKey();
  return {
    totalSeconds: Math.max(local.totalSeconds || 0, cloud.totalSeconds || 0),
    todaySeconds: Math.max(
      local.today === today ? local.todaySeconds || 0 : 0,
      cloud.today === today ? cloud.todaySeconds || 0 : 0
    ),
    today,
    updatedAt: new Date().toISOString(),
  };
}

function saveStudyTime() {
  try {
    localStorage.setItem(STUDY_TIME_KEY, JSON.stringify({
      totalSeconds: Math.floor(state.studyTime.totalSeconds || 0),
      todaySeconds: Math.floor(state.studyTime.todaySeconds || 0),
      today: state.studyTime.today || todayKey(),
      updatedAt: new Date().toISOString(),
    }));
    return true;
  } catch {
    // 学习时长只保存一个很小的对象；如果这里失败，说明浏览器存储确实满了。
    return false;
  }
}

function syncStudyTimeDay() {
  const today = todayKey();
  if (!state.studyTime || typeof state.studyTime !== "object") {
    state.studyTime = normalizeStudyTime({});
  }
  if (state.studyTime.today !== today) {
    state.studyTime.today = today;
    state.studyTime.todaySeconds = 0;
    saveStudyTime();
  }
}

function formatStudyTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds || 0)));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours >= 100) {
    return `${hours}小时`;
  }
  if (hours > 0) {
    return `${hours}小时${minutes}分`;
  }
  return `${minutes}分`;
}

function renderStudyTime() {
  if (!els.totalStudyTime || !els.todayStudyTime) {
    return;
  }
  syncStudyTimeDay();
  els.totalStudyTime.textContent = formatStudyTime(state.studyTime.totalSeconds);
  els.todayStudyTime.textContent = `今日 ${formatStudyTime(state.studyTime.todaySeconds)}`;
}

const studyTimeTracker = {
  lastTickAt: Date.now(),
  lastActivityAt: Date.now(),
  dirtySeconds: 0,
};

function markStudyActivity() {
  studyTimeTracker.lastActivityAt = Date.now();
}

function tickStudyTime(forceSave = false) {
  if (!state.studyTime) {
    state.studyTime = normalizeStudyTime({});
  }
  const now = Date.now();
  const elapsedSeconds = Math.max(0, Math.min(30, Math.floor((now - studyTimeTracker.lastTickAt) / 1000)));
  studyTimeTracker.lastTickAt = now;
  const isVisible = document.visibilityState !== "hidden";
  const recentlyActive = now - studyTimeTracker.lastActivityAt <= 5 * 60 * 1000;
  if (elapsedSeconds && isVisible && recentlyActive) {
    syncStudyTimeDay();
    state.studyTime.totalSeconds += elapsedSeconds;
    state.studyTime.todaySeconds += elapsedSeconds;
    studyTimeTracker.dirtySeconds += elapsedSeconds;
    renderStudyTime();
  }
  if (forceSave || studyTimeTracker.dirtySeconds >= 30) {
    const hadDirtyStudyTime = studyTimeTracker.dirtySeconds > 0;
    saveStudyTime();
    if (hadDirtyStudyTime && state.cloud?.config?.autoSync) {
      autoSaveCloudSoon();
    }
    studyTimeTracker.dirtySeconds = 0;
  }
}

function installStudyTimeTracker() {
  ["click", "keydown", "touchstart", "input"].forEach((eventName) => {
    document.addEventListener(eventName, markStudyActivity, { passive: true });
  });
  document.addEventListener("visibilitychange", () => {
    tickStudyTime(true);
    studyTimeTracker.lastTickAt = Date.now();
    if (document.visibilityState !== "hidden") {
      markStudyActivity();
    }
  });
  window.addEventListener("pagehide", () => tickStudyTime(true));
  window.addEventListener("beforeunload", () => tickStudyTime(true));
}


/* builtin word package */
function cloneBuiltinWord(word) {
  return normalizeWord(JSON.parse(JSON.stringify(word)));
}

function cloneBuiltinWords() {
  return ALL_BUILTIN_WORDS.map(cloneBuiltinWord);
}

function createEmptyProgress(source = {}) {
  const stage = Number.isInteger(source.stage) ? source.stage : -1;
  const history = Array.isArray(source.history) ? [...source.history] : [];
  return {
    status: source.status || "new",
    stage,
    nextReviewAt: source.nextReviewAt || "",
    lastStudiedAt: source.lastStudiedAt || "",
    resetAt: source.resetAt || "",
    history,
  };
}

function normalizeModeProgress(word) {
  const existing = word.progress && typeof word.progress === "object" ? word.progress : {};
  const legacyProgress = createEmptyProgress(word);
  return PROGRESS_MODES.reduce((progressByMode, mode) => {
    const source = existing[mode] || (mode === "card" ? legacyProgress : {});
    progressByMode[mode] = createEmptyProgress(source);
    return progressByMode;
  }, {});
}

function modeProgress(word, mode = state.practiceMode) {
  if (!word.progress || typeof word.progress !== "object") {
    word.progress = normalizeModeProgress(word);
  }
  if (!PROGRESS_MODES.includes(mode)) {
    mode = "card";
  }
  if (!word.progress[mode]) {
    word.progress[mode] = createEmptyProgress();
  }
  return word.progress[mode];
}

function activeModeProgress(word) {
  return modeProgress(word, state.practiceMode);
}

function recordModeHistory(word, entry, mode = state.practiceMode) {
  const progress = modeProgress(word, mode);
  const historyEntry = { ...entry, mode };
  progress.history.push(historyEntry);
  if (!Array.isArray(word.history)) {
    word.history = [];
  }
  word.history.push(historyEntry);
}


function cleanupLegacyWordListMisimports(words) {
  if (!Array.isArray(words)) return [];
  return words.filter((word) => {
    const tag = normalizeText(word?.tag || "");
    const id = normalizeText(word?.id || "");
    if (tag.includes("第一章第三节") || tag.includes("冠词与数词")) return false;
    if (/^fullway-20260627-v29-0\d\d$/.test(id)) return false;
    if (/^fullway-20260627-v29-1[0-3]\d$/.test(id)) return false;
    if (id === "cet4-20260714-v68-038") return false;
    return true;
  });
}

function progressStatusRank(status = "new") { return ({ new: 0, learning: 1, mature: 2 })[status] ?? 0; }

function progressActionTime(progress = {}) {
  const direct = Date.parse(progress.lastStudiedAt || "") || 0;
  const resetTime = Date.parse(progress.resetAt || "") || 0;
  const historyTime = (Array.isArray(progress.history) ? progress.history : []).reduce((latest, item) => {
    const value = Date.parse(item?.time || "") || 0;
    return Math.max(latest, value);
  }, 0);
  return Math.max(direct, resetTime, historyTime);
}

function mergeProgressRecord(target = {}, incoming = {}) {
  const tStage = Number.isInteger(target.stage) ? target.stage : -1;
  const iStage = Number.isInteger(incoming.stage) ? incoming.stage : -1;
  const tTime = progressActionTime(target);
  const iTime = progressActionTime(incoming);

  // 跨设备同步必须以“最后一次操作”为准，而不是以最高复习阶段为准。
  // 例如：手机刚点“忘了”回到 2 分钟，电脑里的旧记录仍是 31 天；
  // 此时手机的新操作必须覆盖电脑的旧高阶段，不能被 31 天反向顶回来。
  const useIncoming = iTime > tTime
    || (iTime === tTime && iStage > tStage)
    || (iTime === tTime && iStage === tStage && progressStatusRank(incoming.status) > progressStatusRank(target.status));
  const chosen = useIncoming ? incoming : target;
  const resetAt = [target.resetAt || "", incoming.resetAt || ""].filter(Boolean).sort().at(-1) || "";
  const resetTime = Date.parse(resetAt || "") || 0;
  const history = [...(Array.isArray(target.history) ? target.history : []), ...(Array.isArray(incoming.history) ? incoming.history : [])]
    .filter(Boolean)
    .filter((item) => !resetTime || (Date.parse(item?.time || "") || 0) > resetTime)
    .sort((a,b) => String(a.time || "").localeCompare(String(b.time || "")));
  const seen = new Set();
  const compactHistory = history.filter((item) => { const key = [item.time,item.result,item.mode].join("|"); if(seen.has(key)) return false; seen.add(key); return true; }).slice(-20);
  return { status: chosen.status || "new", stage: Number.isInteger(chosen.stage) ? chosen.stage : -1, nextReviewAt: chosen.nextReviewAt || "", lastStudiedAt: chosen.lastStudiedAt || "", resetAt, history: compactHistory };
}
function mergeRuntimeWord(target, incoming) {
  target.phonetic = normalizeText(target.phonetic) || normalizeText(incoming.phonetic) || normalizeText(incoming.ipa) || normalizeText(incoming.pronunciation);
  target.meaning = mergeStudyText(target.meaning, incoming.meaning);
  target.phrase = mergeStudyText(target.phrase, incoming.phrase);
  target.note = mergeStudyText(target.note, incoming.note);
  target.important = Boolean(target.important || incoming.important);
  target.sources = mergeWordSources(target, incoming); target.source = target.sources[0];
  target.groups = [...new Set([...(target.groups || []), ...(incoming.groups || []), normalizeText(incoming.tag || "").split("/")[0].trim()].map(normalizeText).filter(Boolean))];
  if ((incoming.mastery || "未学") !== "未学") target.mastery = incoming.mastery;
  target.progress = target.progress || {}; incoming.progress = incoming.progress || {};
  PROGRESS_MODES.forEach((mode) => { target.progress[mode] = mergeProgressRecord(target.progress[mode] || {}, incoming.progress[mode] || {}); });
  const card = target.progress.card || {}; target.status = card.status || target.status || "new"; target.stage = Number.isInteger(card.stage) ? card.stage : (Number.isInteger(target.stage) ? target.stage : -1); target.nextReviewAt = card.nextReviewAt || target.nextReviewAt || ""; target.lastStudiedAt = card.lastStudiedAt || target.lastStudiedAt || "";
  const resetAt = PROGRESS_MODES.map((mode) => target.progress?.[mode]?.resetAt || "").filter(Boolean).sort().at(-1) || "";
  const resetTime = Date.parse(resetAt || "") || 0;
  target.history = mergeProgressRecord({history:target.history || []},{history:incoming.history || []}).history
    .filter((item) => !resetTime || (Date.parse(item?.time || "") || 0) > resetTime);
  return target;
}
function dedupeRuntimeWords(words) {
  const out = []; const byTerm = new Map();
  (Array.isArray(words) ? words : []).forEach((item) => {
    const word = normalizeWord(item);
    const termKey = normalizeText(word.term).toLowerCase().replace(/[’‘`]/g,"'").replace(/\s+/g," ");
    if(!termKey) return;
    const keepSeparate = /^dictation-[1-4]-/.test(normalizeText(word.id));
    const key = keepSeparate ? `id:${normalizeText(word.id)}` : `term:${termKey}`;
    const existing = byTerm.get(key);
    if(existing) mergeRuntimeWord(existing, word);
    else { byTerm.set(key, word); out.push(word); }
  });
  return out;
}

function applyBuiltinWords(words) {
  words = dedupeRuntimeWords(cleanupLegacyWordListMisimports(words));
  let packageAlreadyApplied = false;
  try {
    packageAlreadyApplied = localStorage.getItem(BUILTIN_PACKAGE_KEY) === "1";
  } catch {
    packageAlreadyApplied = false;
  }

  const byId = new Map(words.map((word) => [normalizeText(word.id), word]));
  const byTerm = new Map(words.map((word) => [normalizeText(word.term).toLowerCase(), word]));
  ALL_BUILTIN_WORDS.forEach((sourceWord) => {
    const builtin = cloneBuiltinWord(sourceWord);
    const builtinId = normalizeText(builtin.id);
    const termKey = normalizeText(builtin.term).toLowerCase();
    const existingById = byId.get(builtinId);
    const forceSeparate = FORCE_SEPARATE_BUILTIN_ID_PREFIXES.some((prefix) => builtinId.startsWith(prefix));
    if (!existingById && forceSeparate && !packageAlreadyApplied) {
      words.push(builtin);
      byId.set(builtinId, builtin);
      if (!byTerm.has(termKey)) byTerm.set(termKey, builtin);
      shouldPersistBuiltinWords = true;
      return;
    }
    const existing = existingById || byTerm.get(termKey);
    if (existing) {
      const previous = JSON.stringify(existing);
      const isDictationBuiltin = /^dictation-[1-4]-/.test(builtinId);
      if (isDictationBuiltin) {
        // 修复旧版听写存档：内容字段以当前资料为准，学习进度继续保留。
        existing.term = builtin.term;
        existing.meaning = builtin.meaning;
        existing.phrase = builtin.phrase || "";
        existing.note = builtin.note || "";
        existing.tag = builtin.tag;
        existing.groups = [...(builtin.groups || [])];
        existing.sources = [...(builtin.sources || ["听写内容"])];
        existing.source = builtin.source || "听写内容";
      } else {
        existing.phonetic = normalizeText(existing.phonetic) || normalizeText(builtin.phonetic) || normalizeText(builtin.ipa) || normalizeText(builtin.pronunciation);
        existing.meaning = mergeStudyText(existing.meaning, builtin.meaning);
        existing.phrase = mergeStudyText(existing.phrase, builtin.phrase);
        existing.note = mergeStudyText(existing.note, builtin.note);
      }
      existing.forms = {
        third: normalizeText(existing.forms?.third) || normalizeText(builtin.forms?.third),
        past: normalizeText(existing.forms?.past) || normalizeText(builtin.forms?.past),
        participle: normalizeText(existing.forms?.participle) || normalizeText(builtin.forms?.participle),
      };
      const shouldMoveV29FullwayToWordList = /^(fullway-20260627-v29-|wordlist-20260627-v31-|wordlist-20260627-v35-|wordlist-20260627-v35-)/.test(builtin.id || "");
      if (shouldMoveV29FullwayToWordList) {
        existing.tag = builtin.tag;
        existing.source = builtin.source || "Word List";
        existing.sources = [existing.source];
      } else {
        existing.tag = normalizeText(existing.tag) || builtin.tag;
        existing.sources = mergeWordSources(existing, builtin);
        existing.source = existing.sources[0];
      }
      if (JSON.stringify(existing) !== previous) {
        shouldPersistBuiltinWords = true;
      }
      return;
    }

    if (!packageAlreadyApplied) {
      words.push(builtin);
      byId.set(builtinId, builtin);
      byTerm.set(termKey, builtin);
      shouldPersistBuiltinWords = true;
    }
  });

  if (!packageAlreadyApplied) {
    shouldPersistBuiltinWords = true;
  }
  return words;
}


function compactProgress(progress = {}, options = {}) {
  const out = {};
  const emergency = Boolean(options.emergency);
  PROGRESS_MODES.forEach((mode) => {
    const item = progress && progress[mode] ? progress[mode] : null;
    if (!item) return;
    const history = emergency ? [] : (Array.isArray(item.history) ? item.history.slice(-4) : []);
    const status = item.status || "new";
    const stage = Number.isInteger(item.stage) ? item.stage : -1;
    const resetAt = item.resetAt || "";
    const hasData = status !== "new" || stage >= 0 || Boolean(item.nextReviewAt) || Boolean(item.lastStudiedAt) || Boolean(resetAt) || history.length > 0;
    if (!hasData) return;
    const record = {};
    if (status !== "new") record.status = status;
    // “忘了”会把 stage 设为 -1；“全词浏览答错重置”也会保留 stage=-1，这些都是有效操作。
    if (status !== "new" || item.lastStudiedAt || resetAt || history.length) record.stage = stage;
    if (item.nextReviewAt) record.nextReviewAt = item.nextReviewAt;
    if (item.lastStudiedAt) record.lastStudiedAt = item.lastStudiedAt;
    if (resetAt) record.resetAt = resetAt;
    if (history.length) record.history = history;
    out[mode] = record;
  });
  return out;
}

function applyCompactProgress(word, compact = {}) {
  if (!word || !compact) return word;
  if (compact.mastery && compact.mastery !== "未学") word.mastery = compact.mastery;
  if (typeof compact.important === "boolean") word.important = Boolean(word.important || compact.important);
  const legacyIncoming = { status: compact.status || "new", stage: Number.isInteger(compact.stage) ? compact.stage : -1, nextReviewAt: compact.nextReviewAt || "", lastStudiedAt: compact.lastStudiedAt || "", history: [] };
  const legacyMerged = mergeProgressRecord({ status: word.status, stage: word.stage, nextReviewAt: word.nextReviewAt, lastStudiedAt: word.lastStudiedAt, history: word.history || [] }, legacyIncoming);
  word.status = legacyMerged.status; word.stage = legacyMerged.stage; word.nextReviewAt = legacyMerged.nextReviewAt; word.lastStudiedAt = legacyMerged.lastStudiedAt;
  if (compact.updatedAt && (!word.updatedAt || compact.updatedAt > word.updatedAt)) word.updatedAt = compact.updatedAt;
  word.progress = normalizeModeProgress(word);
  if (compact.progress && typeof compact.progress === "object") {
    PROGRESS_MODES.forEach((mode) => { if (compact.progress[mode]) word.progress[mode] = mergeProgressRecord(word.progress[mode], compact.progress[mode]); });
  }
  return normalizeWord(word);
}
function compactWordRecord(word, options = {}) {
  const record = { id: word.id };
  const mastery = word.mastery || "未学";
  const status = word.status || "new";
  const stage = Number.isInteger(word.stage) ? word.stage : -1;
  if (mastery !== "未学") record.mastery = mastery;
  if (word.important) record.important = true;
  if (status !== "new") record.status = status;
  if (status !== "new" || word.lastStudiedAt) record.stage = stage;
  if (word.nextReviewAt) record.nextReviewAt = word.nextReviewAt;
  if (word.lastStudiedAt) record.lastStudiedAt = word.lastStudiedAt;
  if (word.updatedAt && (status !== "new" || stage >= 0 || word.important || mastery !== "未学")) record.updatedAt = word.updatedAt;
  const progress = compactProgress(word.progress, options);
  if (Object.keys(progress).length) record.progress = progress;
  return record;
}

function compactCustomWord(word, options = {}) {
  const emergency = Boolean(options.emergency);
  const custom = {
    id: word.id,
    term: word.term,
    meaning: word.meaning || "",
  };
  if (word.phrase) custom.phrase = word.phrase;
  if (word.note) custom.note = word.note;
  if (word.tag) custom.tag = word.tag;
  if (Array.isArray(word.groups) && word.groups.length) custom.groups = [...new Set(word.groups.filter(Boolean))];
  if (word.source) custom.source = word.source;
  if (Array.isArray(word.sources) && word.sources.length) custom.sources = [...new Set(word.sources.filter(Boolean))];
  const forms = word.forms || {};
  if (forms.third || forms.past || forms.participle) {
    custom.forms = {};
    if (forms.third) custom.forms.third = forms.third;
    if (forms.past) custom.forms.past = forms.past;
    if (forms.participle) custom.forms.participle = forms.participle;
  }
  if (word.mastery && word.mastery !== "未学") custom.mastery = word.mastery;
  if (word.important) custom.important = true;
  if (word.status && word.status !== "new") custom.status = word.status;
  if (Number.isInteger(word.stage) && ((word.status || "new") !== "new" || word.lastStudiedAt)) custom.stage = word.stage;
  if (word.nextReviewAt) custom.nextReviewAt = word.nextReviewAt;
  if (word.lastStudiedAt) custom.lastStudiedAt = word.lastStudiedAt;
  if (word.createdAt) custom.createdAt = word.createdAt;
  if (word.updatedAt) custom.updatedAt = word.updatedAt;
  if (!emergency && Array.isArray(word.history) && word.history.length) custom.history = word.history.slice(-4);
  const progress = compactProgress(word.progress, options);
  if (Object.keys(progress).length) custom.progress = progress;
  return custom;
}

function compactPayloadForStorage(words, options = {}) {
  const builtinIds = new Set(ALL_BUILTIN_WORDS.map((word) => word.id));
  const builtinTerms = new Set(ALL_BUILTIN_WORDS.map((word) => normalizeText(word.term).toLowerCase()));
  const progress = [];
  const customWords = [];
  words.forEach((word) => {
    const normalized = normalizeWord(word);
    const isBuiltin = builtinIds.has(normalized.id) || builtinTerms.has(normalizeText(normalized.term).toLowerCase());
    if (isBuiltin) {
      const record = compactWordRecord(normalized, options);
      // 只有真正学习过、标记过或改变过的内置词才写入存档。
      // 旧版把 6000 多个词的默认状态全部重复存进 localStorage，容易把浏览器空间撑满。
      if (Object.keys(record).length > 1) progress.push(record);
    } else {
      customWords.push(compactCustomWord(normalized, options));
    }
  });
  return {
    app: "专升本单词记忆",
    version: 30,
    compact: true,
    savedAt: new Date().toISOString(),
    studySession: captureStudySessionSnapshot(),
    dailyCompleted: normalizeDailyCompletedStore(dailyCompletedStore),
    contextStudy: normalizeContextStudyStore(contextStudyStore),
    memoryLab: normalizeMemoryLabStore(memoryLabStore),
    progress,
    customWords,
  };
}

function loadCompactWords(parsed, options = {}) {
  if (options.captureSession !== false && parsed?.studySession) {
    restoredStudySession = normalizeStudySessionSnapshot(parsed.studySession);
  }
  if (parsed?.contextStudy) {
    contextStudyStore = mergeContextStudyStores(contextStudyStore, parsed.contextStudy);
    saveContextStudyStore();
  }
  if (parsed?.dailyCompleted) {
    dailyCompletedStore = mergeDailyCompletedStores(dailyCompletedStore, parsed.dailyCompleted);
    saveDailyCompletedStore();
  }
  if (parsed?.memoryLab) {
    memoryLabStore = mergeMemoryLabStores(memoryLabStore, parsed.memoryLab);
    saveMemoryLabStore();
  }
  const words = cloneBuiltinWords();
  const byId = new Map(words.map((word) => [word.id, word]));
  const byTerm = new Map(words.map((word) => [normalizeText(word.term).toLowerCase(), word]));
  Object.entries(BUILTIN_ID_ALIASES).forEach(([oldId, canonicalId]) => { const target = byId.get(canonicalId); if (target) byId.set(oldId, target); });
  (Array.isArray(parsed.progress) ? parsed.progress : []).forEach((item) => {
    const key = normalizeText(item.term).toLowerCase();
    const target = byId.get(item.id) || byTerm.get(key);
    if (target) applyCompactProgress(target, item);
  });
  (Array.isArray(parsed.customWords) ? parsed.customWords : []).forEach((item) => {
    const word = normalizeWord(item);
    const key = normalizeText(word.term).toLowerCase();
    if (!byId.has(word.id) && !byTerm.has(key)) {
      words.push(word);
      byId.set(word.id, word);
      byTerm.set(key, word);
    }
  });
  return applyBuiltinWords(words);
}

function cleanupStorageForWordSave() {
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("word-memory-trainer:wordlist-") && key !== BUILTIN_PACKAGE_KEY) {
        localStorage.removeItem(key);
      }
    });
  } catch {
    // ignore
  }
}

function shrinkHistoriesForEmergency() {
  state.words.forEach((word) => {
    if (Array.isArray(word.history)) word.history = word.history.slice(-4);
    if (word.progress && typeof word.progress === "object") {
      Object.values(word.progress).forEach((item) => {
        if (item && Array.isArray(item.history)) item.history = item.history.slice(-4);
      });
    }
  });
}

function openMobileDatabase() {
  if (mobileDbPromise) return mobileDbPromise;
  mobileDbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    let request;
    try {
      request = indexedDB.open(MOBILE_DB_NAME, MOBILE_DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MOBILE_DB_STORE)) {
        db.createObjectStore(MOBILE_DB_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    request.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
  return mobileDbPromise;
}

async function readMobileDatabaseRecord(key) {
  const db = await openMobileDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MOBILE_DB_STORE, "readonly");
    const request = transaction.objectStore(MOBILE_DB_STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("IndexedDB read failed"));
  });
}

function storedPayloadScore(payload) {
  if (!payload || typeof payload !== "object") return 0;
  if (payload.compact) {
    return (Array.isArray(payload.progress) ? payload.progress.length : 0)
      + (Array.isArray(payload.customWords) ? payload.customWords.length : 0)
      + Object.keys(payload.contextStudy || {}).length;
  }
  return Array.isArray(payload)
    ? payload.length
    : (Array.isArray(payload.words) ? payload.words.length : 0);
}

async function readBestMobileDatabasePayload() {
  try {
    const [primary, previous] = await Promise.all([
      readMobileDatabaseRecord(MOBILE_DB_PRIMARY_KEY),
      readMobileDatabaseRecord(MOBILE_DB_PREVIOUS_KEY),
    ]);
    const primaryPayload = primary?.payload && typeof primary.payload === "object" ? primary.payload : null;
    const previousPayload = previous?.payload && typeof previous.payload === "object" ? previous.payload : null;
    if (!primaryPayload) return previousPayload;
    if (!previousPayload) return primaryPayload;
    const primaryScore = storedPayloadScore(primaryPayload);
    const previousScore = storedPayloadScore(previousPayload);
    // Never let an unexpectedly tiny snapshot replace a substantially fuller last-good copy.
    if (previousScore > 0 && primaryScore < previousScore * 0.55) return previousPayload;
    return payloadSavedAt(primaryPayload) >= payloadSavedAt(previousPayload) ? primaryPayload : previousPayload;
  } catch {
    return null;
  }
}

async function writeMobileDatabasePayload(payload) {
  const db = await openMobileDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MOBILE_DB_STORE, "readwrite");
    const store = transaction.objectStore(MOBILE_DB_STORE);
    const getCurrent = store.get(MOBILE_DB_PRIMARY_KEY);
    getCurrent.onsuccess = () => {
      const current = getCurrent.result;
      if (current?.payload) {
        store.put({
          key: MOBILE_DB_PREVIOUS_KEY,
          payload: current.payload,
          savedAt: current.savedAt || current.payload?.savedAt || "",
        });
      }
      store.put({
        key: MOBILE_DB_PRIMARY_KEY,
        payload,
        savedAt: payload?.savedAt || new Date().toISOString(),
      });
    };
    getCurrent.onerror = () => {
      store.put({
        key: MOBILE_DB_PRIMARY_KEY,
        payload,
        savedAt: payload?.savedAt || new Date().toISOString(),
      });
    };
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB write failed"));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB write aborted"));
  });
}

function queueMobileDatabaseWrite(payload, options = {}) {
  const snapshot = typeof structuredClone === "function"
    ? structuredClone(payload)
    : JSON.parse(JSON.stringify(payload));
  mobileDbWriteChain = mobileDbWriteChain
    .catch(() => undefined)
    .then(() => writeMobileDatabasePayload(snapshot));
  if (options.notifyOnSuccess) {
    // Silent successful autosaves: frequent study actions should not cover the card with a toast.
    // Keep the failure warning so the user still knows when the fallback save did not succeed.
    mobileDbWriteChain.catch(() => {
      showToast("手机存档保存失败，请立即导出备份");
    });
  }
  return mobileDbWriteChain;
}

function parseLocalStoragePayload() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function payloadSavedAt(payload) {
  return Date.parse(payload?.savedAt || "") || 0;
}

function payloadHasStudyData(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (payload.compact) {
    return (Array.isArray(payload.progress) && payload.progress.length > 0)
      || (Array.isArray(payload.customWords) && payload.customWords.length > 0)
      || Object.keys(payload.contextStudy || {}).length > 0
      || Object.keys(payload.memoryLab?.metrics || {}).length > 0
      || (Array.isArray(payload.memoryLab?.reports) && payload.memoryLab.reports.length > 0);
  }
  return Array.isArray(payload) ? payload.length > 0 : Array.isArray(payload.words) && payload.words.length > 0;
}

function wordsFromStoredPayload(payload) {
  if (!payload) return null;
  if (payload.compact) return loadCompactWords(payload);
  const words = Array.isArray(payload)
    ? payload.map(normalizeWord)
    : (Array.isArray(payload.words) ? payload.words.map(normalizeWord) : []);
  return applyBuiltinWords(words);
}

async function hydrateWordsFromMobileDatabase() {
  try {
    navigator.storage?.persist?.().catch(() => false);
    const dbPayload = await readBestMobileDatabasePayload();
    const localPayload = parseLocalStoragePayload();
    const shouldUseDb = payloadHasStudyData(dbPayload)
      && (!payloadHasStudyData(localPayload) || payloadSavedAt(dbPayload) > payloadSavedAt(localPayload));
    if (shouldUseDb) {
      const restoredWords = wordsFromStoredPayload(dbPayload);
      if (Array.isArray(restoredWords) && restoredWords.length) {
        state.words = restoredWords;
        if (dbPayload?.studySession) applyStudySessionSnapshot(dbPayload.studySession);
        else {
          state.activeId = null;
          state.answerVisible = false;
          state.reviewUndo = null;
          resetTypingState();
        }
        render();
        showToast("已从手机大容量存档恢复学习记录");
      }
    } else if (payloadHasStudyData(localPayload)) {
      await queueMobileDatabaseWrite(localPayload);
    } else {
      await queueMobileDatabaseWrite(compactPayloadForStorage(state.words));
    }
  } catch {
    // localStorage remains available as the compatibility fallback.
  } finally {
    mobileDbHydrated = true;
    persistBuiltinWordsIfNeeded();
  }
}

function loadWords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      shouldPersistBuiltinWords = true;
      return cloneBuiltinWords();
    }
    const parsed = JSON.parse(raw);
    if (parsed && parsed.compact) {
      return loadCompactWords(parsed);
    }
    const words = Array.isArray(parsed) ? parsed.map(normalizeWord) : (Array.isArray(parsed.words) ? parsed.words.map(normalizeWord) : []);
    return applyBuiltinWords(words);
  } catch {
    shouldPersistBuiltinWords = true;
    return cloneBuiltinWords();
  }
}

function persistBuiltinWordsIfNeeded() {
  if (!shouldPersistBuiltinWords) {
    return;
  }
  saveWords();
  try {
    localStorage.setItem(BUILTIN_PACKAGE_KEY, "1");
  } catch {
    // Storage failures are handled by saveWords when possible.
  }
}

function normalizeWord(word) {
  const sources = normalizeWordSources(word);
  const groups = [...new Set([
    ...(Array.isArray(word.groups) ? word.groups : []),
    ...builtinGroupAliasesForTerm(word.term),
  ].map(normalizeText).filter(Boolean))];
  return {
    id: word.id || createId(),
    term: word.term || "",
    meaning: word.meaning || "",
    phrase: word.phrase || "",
    note: word.note || "",
    phonetic: word.phonetic || word.ipa || word.pronunciation || "",
    tag: word.tag || "",
    groups,
    source: sources[0],
    sources,
    mastery: normalizeText(word.mastery || "未学"),
    forms: {
      third: normalizeText(word.forms?.third || word.forms?.thirdPerson || word.thirdPerson || ""),
      past: normalizeText(word.forms?.past || word.forms?.pastTense || word.pastTense || ""),
      participle: normalizeText(word.forms?.participle || word.forms?.pastParticiple || word.pastParticiple || ""),
    },
    important: Boolean(word.important),
    status: word.status || "new",
    stage: Number.isInteger(word.stage) ? word.stage : -1,
    nextReviewAt: word.nextReviewAt || "",
    lastStudiedAt: word.lastStudiedAt || "",
    createdAt: word.createdAt || new Date().toISOString(),
    updatedAt: word.updatedAt || new Date().toISOString(),
    history: Array.isArray(word.history) ? word.history : [],
    progress: normalizeModeProgress(word),
  };
}

function writeCompactStorage(payload) {
  const serialized = JSON.stringify(payload);
  const previous = localStorage.getItem(STORAGE_KEY);
  try {
    localStorage.setItem(STORAGE_KEY, serialized);
    return serialized.length;
  } catch (firstError) {
    // iPhone Safari may count both the old and new value while replacing a large item.
    if (previous && serialized.length < previous.length) {
      localStorage.removeItem(STORAGE_KEY);
      try {
        localStorage.setItem(STORAGE_KEY, serialized);
        return serialized.length;
      } catch (secondError) {
        try { localStorage.setItem(STORAGE_KEY, previous); } catch { /* IndexedDB still keeps the last good copy. */ }
        throw secondError;
      }
    }
    throw firstError;
  }
}

function commitWordsSave(options = {}) {
  if (PUBLIC_VIEWER_SLUG) return true;

  saveDailyCompletedStore();
  let payload = compactPayloadForStorage(state.words);
  let localSaved = false;
  try {
    cleanupStorageForWordSave();
    writeCompactStorage(payload);
    localSaved = true;
  } catch {
    try {
      // Keep all current stages and groups, but remove only redundant history entries.
      shrinkHistoriesForEmergency();
      cleanupStorageForWordSave();
      payload = compactPayloadForStorage(state.words, { emergency: true });
      writeCompactStorage(payload);
      localSaved = true;
    } catch {
      localSaved = false;
    }
  }

  // IndexedDB 和云同步改为合并缓冲：连续操作只保存最后一份完整快照，避免每按一次都排队写入。
  queueMobileDatabaseWrite(payload, { notifyOnSuccess: !localSaved });
  if (!options.skipCloud) autoSaveCloudSoon();

  if (!localSaved && typeof indexedDB === "undefined") {
    showToast("手机存档保存失败，请立即导出备份");
    return false;
  }
  return true;
}

function flushBufferedWordSave(options = {}) {
  if (wordSaveTimer) {
    window.clearTimeout(wordSaveTimer);
    wordSaveTimer = null;
  }
  const shouldSave = pendingWordSave || options.force || options.immediate;
  const skipCloud = pendingWordSaveSkipCloud && options.skipCloud !== false;
  pendingWordSave = false;
  pendingWordSaveSkipCloud = true;
  return shouldSave ? commitWordsSave({ ...options, skipCloud }) : true;
}

function saveWords(options = {}) {
  if (PUBLIC_VIEWER_SLUG) return true;
  pendingWordSave = true;
  // 只要这一批里有一次普通保存，就不能跳过云同步。
  pendingWordSaveSkipCloud = pendingWordSaveSkipCloud && Boolean(options.skipCloud);
  if (options.immediate) {
    return flushBufferedWordSave({ ...options, force: true });
  }
  if (wordSaveTimer) window.clearTimeout(wordSaveTimer);
  wordSaveTimer = window.setTimeout(() => flushBufferedWordSave(), 260);
  return true;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function normalizeCloudSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);
}

function toWordMemoryCloudSlug(value) {
  const slug = normalizeCloudSlug(value).slice(0, 29);
  if (!slug) {
    return "";
  }
  return `wm-${slug}`;
}

function loadCloudConfig() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CLOUD_CONFIG_KEY) || "{}");
    return {
      slug: normalizeCloudSlug(parsed.slug || ""),
      displayName: normalizeText(parsed.displayName || "专升本单词记忆"),
      pin: String(parsed.pin || ""),
      isPublic: parsed.isPublic !== false,
      autoSync: Boolean(parsed.autoSync),
    };
  } catch {
    return {
      slug: "",
      displayName: "专升本单词记忆",
      pin: "",
      isPublic: true,
      autoSync: false,
    };
  }
}

function saveCloudConfig(config) {
  if (PUBLIC_VIEWER_SLUG) {
    return;
  }
  try {
    localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(config));
  } catch {
    showToast("云同步设置保存失败");
  }
}

function isCloudReadOnly() {
  return Boolean(PUBLIC_VIEWER_SLUG || (EDITOR_VIEW_SLUG && !state.cloud.canEdit));
}

function guardEditable() {
  if (PUBLIC_VIEWER_SLUG) {
    showToast("公开链接只能查看，不能修改");
    return false;
  }
  if (EDITOR_VIEW_SLUG && !state.cloud.canEdit) {
    openCloudDialog();
    setCloudStatus("这是协作链接，先输入编辑密码才能修改。", "warn");
    return false;
  }
  return true;
}

function setCloudStatus(message, tone = "") {
  if (!els.cloudStatus) {
    return;
  }
  els.cloudStatus.textContent = message || "";
  els.cloudStatus.dataset.tone = tone;
}

function defaultShareBaseUrl() {
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    return url.href;
  }
  try {
    const saved = localStorage.getItem(SHARE_BASE_URL_KEY);
    return saved && !saved.startsWith("file:") ? saved : DEFAULT_SHARE_BASE_URL;
  } catch {
    return DEFAULT_SHARE_BASE_URL;
  }
}

function normalizeShareBaseUrl(value) {
  const candidate = normalizeText(value) || defaultShareBaseUrl();
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return DEFAULT_SHARE_BASE_URL;
    }
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return DEFAULT_SHARE_BASE_URL;
  }
}

function normalizeSupabaseUrl(value) {
  const candidate = normalizeText(value);
  if (!candidate) {
    return "";
  }
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co")) {
      return "";
    }
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function currentSupabaseSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SUPABASE_SETTINGS_KEY) || "{}");
    const url = normalizeSupabaseUrl(saved.url) || DEFAULT_SUPABASE_URL;
    const key = normalizeText(saved.key) || DEFAULT_SUPABASE_PUBLISHABLE_KEY;
    return { url, key };
  } catch {
    return { url: DEFAULT_SUPABASE_URL, key: DEFAULT_SUPABASE_PUBLISHABLE_KEY };
  }
}

function saveSupabaseSettingsFromDialog() {
  const url = normalizeSupabaseUrl(els.supabaseUrlInput?.value || "");
  const key = normalizeText(els.supabaseKeyInput?.value || "");
  if (!url || !key) {
    return { ok: false, message: "请填写 Supabase 项目地址和 anon public key" };
  }
  try {
    localStorage.setItem(SUPABASE_SETTINGS_KEY, JSON.stringify({ url, key }));
  } catch {
    return { ok: false, message: "浏览器无法保存 Supabase 配置" };
  }
  if (els.supabaseUrlInput) {
    els.supabaseUrlInput.value = url;
  }
  if (els.supabaseKeyInput) {
    els.supabaseKeyInput.value = key;
  }
  return { ok: true, url, key };
}

function hydrateCloudDialog() {
  if (!els.cloudDialog) {
    return;
  }
  const config = state.cloud.config;
  if (els.cloudSlugInput) {
    els.cloudSlugInput.value = EDITOR_VIEW_SLUG || PUBLIC_VIEWER_SLUG || config.slug || "";
    els.cloudSlugInput.readOnly = Boolean(EDITOR_VIEW_SLUG || PUBLIC_VIEWER_SLUG);
  }
  if (els.cloudNameInput) {
    els.cloudNameInput.value = config.displayName || "专升本单词记忆";
  }
  if (els.cloudPinInput) {
    els.cloudPinInput.value = PUBLIC_VIEWER_SLUG ? "" : config.pin || "";
  }
  if (els.cloudPublicInput) {
    els.cloudPublicInput.checked = config.isPublic !== false;
    els.cloudPublicInput.disabled = Boolean(PUBLIC_VIEWER_SLUG);
  }
  const supabaseSettings = currentSupabaseSettings();
  if (els.supabaseUrlInput) {
    els.supabaseUrlInput.value = supabaseSettings.url;
  }
  if (els.supabaseKeyInput) {
    els.supabaseKeyInput.value = supabaseSettings.key;
  }
  if (els.shareBaseUrlInput) {
    els.shareBaseUrlInput.value = normalizeShareBaseUrl(els.shareBaseUrlInput.value || defaultShareBaseUrl());
  }
  if (els.loadCloudButton) {
    els.loadCloudButton.disabled = Boolean(PUBLIC_VIEWER_SLUG);
  }
}

function openCloudDialog() {
  hydrateCloudDialog();
  if (!els.cloudDialog) {
    return;
  }
  if (typeof els.cloudDialog.showModal === "function" && !els.cloudDialog.open) {
    els.cloudDialog.showModal();
  } else {
    els.cloudDialog.setAttribute("open", "");
  }
}

function closeCloudDialog() {
  if (!els.cloudDialog) {
    return;
  }
  if (typeof els.cloudDialog.close === "function") {
    els.cloudDialog.close();
  } else {
    els.cloudDialog.removeAttribute("open");
  }
}

function readCloudFormConfig() {
  const supabaseSaved = saveSupabaseSettingsFromDialog();
  if (!supabaseSaved.ok) {
    setCloudStatus(supabaseSaved.message, "warn");
  }
  const slug = normalizeCloudSlug(els.cloudSlugInput?.value || state.cloud.config.slug);
  const config = {
    slug,
    displayName: normalizeText(els.cloudNameInput?.value || state.cloud.config.displayName || "专升本单词记忆"),
    pin: String(els.cloudPinInput?.value || state.cloud.config.pin || ""),
    isPublic: els.cloudPublicInput ? els.cloudPublicInput.checked : state.cloud.config.isPublic !== false,
    autoSync: state.cloud.config.autoSync,
  };
  state.cloud.config = config;
  return config;
}

function safeParseCloudResponse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const shortText = text.replace(/\s+/g, " ").trim().slice(0, 90);
    const detail = shortText ? `返回内容：${shortText}` : "返回内容为空";
    throw new Error(`云端接口没有返回 JSON，通常是 Supabase 服务未部署、接口被拦截或网络异常。${detail}`);
  }
}

function readableCloudError(error) {
  const message = normalizeText(error?.message || String(error || ""));
  if (!message) return "云同步失败，但本机学习记录已经保存。";
  if (/Unexpected token|not valid JSON|JSON/i.test(message)) {
    return "云同步失败：云端返回内容不是 JSON。大概率是 Supabase 接口没部署好或网络拦截。本机学习记录已经保存。";
  }
  if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(message)) {
    return "云同步失败：网络连不上 Supabase。本机学习记录已经保存。";
  }
  if (/schema cache|PGRST202|Could not query|function|rpc|procedure/i.test(message)) {
    return "云同步失败：Supabase 云端表和函数还没建好。请先运行压缩包里的 supabase-word-memory-repair.sql，运行成功后等 30 秒再点保存。";
  }
  if (/upstream|connect error|connection|reset|timeout|503|502|504/i.test(message)) {
    return "云同步失败：Supabase 上游连接异常。本机学习记录已经保存，晚点再试即可。";
  }
  return message;
}

async function cloudRequest(functionName, payload) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), CLOUD_REQUEST_TIMEOUT_MS);
  try {
    const supabase = currentSupabaseSettings();
    if (!supabase.url || !supabase.key) {
      throw new Error("请先填写 Supabase 项目地址和 anon public key");
    }
    const response = await fetch(`${supabase.url}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: {
        apikey: supabase.key,
        Authorization: `Bearer ${supabase.key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try {
      data = safeParseCloudResponse(text);
    } catch (parseError) {
      throw parseError;
    }
    if (!response.ok) {
      throw new Error(data?.message || data?.hint || data?.details || "云端请求失败");
    }
    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("云端连接超过 12 秒。本机学习记录已先保存；请检查 Supabase 网络或稍后重试。");
    }
    throw new Error(readableCloudError(error));
  } finally {
    window.clearTimeout(timer);
  }
}

function cloudWordsPayload() {
  tickStudyTime(true);
  // v38：云端只保存一个压缩包，避免 1800+ 单词逐条插入导致超时。
  // 内置词条正文仍由网页自带；云端只同步掌握状态、重点、复习进度、自定义词和学习时长。
  return [{
    id: CLOUD_COMPACT_PAYLOAD_ID,
    type: "word-memory-compact-cloud",
    app: "专升本单词记忆",
    version: 51,
    studyTime: normalizeStudyTime(state.studyTime || {}),
    data: compactPayloadForStorage(state.words),
    updatedAt: new Date().toISOString(),
  }];
}

function cloudIncomingWords(data) {
  const incoming = Array.isArray(data?.words) ? data.words : Array.isArray(data) ? data : [];
  const compactCloud = incoming.find((item) => item && item.id === CLOUD_COMPACT_PAYLOAD_ID && item.data?.compact);
  if (compactCloud) {
    return {
      words: loadCompactWords(compactCloud.data, { captureSession: false }),
      studyTime: compactCloud.studyTime || null,
      compactCloud,
      incoming,
    };
  }
  const studyMeta = incoming.find((item) => item && item.id === CLOUD_STUDY_TIME_META_ID);
  const wordRecords = incoming.filter((item) => !(item && item.id === CLOUD_STUDY_TIME_META_ID));
  return {
    words: dedupeRuntimeWords(wordRecords.map(normalizeWord)),
    studyTime: studyMeta?.studyTime || null,
    compactCloud: null,
    incoming,
  };
}

function mergeCloudDataIntoLocal(data, options = {}) {
  const remote = cloudIncomingWords(data);
  const localWords = Array.isArray(state.words) ? state.words.map(normalizeWord) : [];
  // 本机记录放前面、云端记录放后面；真正胜负由 mergeProgressRecord 的最后操作时间决定。
  state.words = dedupeRuntimeWords([...localWords, ...(remote.words || [])]);
  if (remote.studyTime) {
    state.studyTime = mergeStudyTimeForCloud(state.studyTime, remote.studyTime);
    saveStudyTime();
  }
  const remoteSession = remote.compactCloud?.data?.studySession;
  if (options.applyStudySession && remoteSession) {
    applyStudySessionSnapshot(remoteSession);
  }
  return remote;
}

function isMissingCloudProfileError(error) {
  return /不存在|未找到|not found|no rows|PGRST116/i.test(String(error?.message || error || ""));
}

async function pullAndMergeCloudBeforeSave(config) {
  if (!config?.slug) return false;
  try {
    const data = await cloudRequest("load_word_memory_cloud", {
      p_slug: toWordMemoryCloudSlug(config.slug),
      p_pin: config.pin || null,
    });
    mergeCloudDataIntoLocal(data);
    suppressCloudSync = true;
    saveWords({ skipCloud: true, immediate: true });
    suppressCloudSync = false;
    return true;
  } catch (error) {
    suppressCloudSync = false;
    // 第一次建立云端编号时，云端不存在是正常情况；其他读取失败则停止保存，
    // 避免离线旧设备把较新的云端进度整包覆盖。
    if (isMissingCloudProfileError(error)) return false;
    throw error;
  }
}

function saveLocalCloudSettingsOnly(config, options = {}) {
  if (PUBLIC_VIEWER_SLUG) {
    showToast("公开链接只能查看，不能保存");
    return false;
  }
  tickStudyTime(true);
  state.cloud.config = { ...state.cloud.config, ...config, autoSync: false };
  saveCloudConfig(state.cloud.config);
  saveWords({ skipCloud: true, immediate: true });
  saveStudyTime();
  if (!options.silent) {
    setCloudStatus("已保存到本机。没有上传到云端。", "ok");
    showToast("已保存到本机");
  }
  if (options.closeDialog !== false) {
    closeCloudDialog();
  }
  return true;
}

async function saveCloudNow(options = {}) {
  const silent = Boolean(options.silent);
  if (PUBLIC_VIEWER_SLUG || (EDITOR_VIEW_SLUG && !state.cloud.canEdit)) {
    return false;
  }
  const config = options.config || state.cloud.config;
  if (!config.slug || config.pin.length < 4) {
    if (!silent) {
      setCloudStatus("请填写公开编号，并设置至少 4 位编辑密码。", "warn");
      showToast("云同步需要公开编号和编辑密码");
    }
    return false;
  }
  try {
    if (!silent) {
      setCloudStatus("正在保存到云端……");
    }
    // 保存前先拉取云端并按“最后一次操作”合并，防止另一台设备的旧 31 天记录
    // 覆盖手机上刚刚点“忘了”的 2 分钟记录。
    await pullAndMergeCloudBeforeSave(config);
    const result = await cloudRequest("save_word_memory_cloud", {
      p_slug: toWordMemoryCloudSlug(config.slug),
      p_pin: config.pin,
      p_words: cloudWordsPayload(),
      p_display_name: config.displayName || "专升本单词记忆",
      p_is_public: config.isPublic !== false,
    });
    state.cloud.config = { ...config, autoSync: true };
    saveCloudConfig(state.cloud.config);
    if (!silent) {
      setCloudStatus(`已保存到云端：${state.cloud.config.slug}`, "ok");
      showToast("已保存到云端并开启自动同步");
    }
    return result;
  } catch (error) {
    state.cloud.config = { ...state.cloud.config, ...config, autoSync: false };
    saveCloudConfig(state.cloud.config);
    const message = error.message || "云同步失败，但本机学习记录已经保存。";
    if (!silent) {
      setCloudStatus(`${message} 已关闭自动云同步，避免反复卡顿。`, "warn");
      showToast("云同步失败，本机已保存");
    }
    return false;
  }
}

async function loadCloudToLocal(options = {}) {
  const slug = normalizeCloudSlug(options.slug || state.cloud.config.slug || PUBLIC_VIEWER_SLUG || EDITOR_VIEW_SLUG);
  const pin = options.pin ?? state.cloud.config.pin ?? "";
  const publicView = Boolean(options.publicView || PUBLIC_VIEWER_SLUG);
  if (!slug) {
    setCloudStatus("请先填写公开编号。", "warn");
    return false;
  }
  try {
    if (!options.silent) {
      setCloudStatus("正在从云端加载……");
    }
    const data = await cloudRequest("load_word_memory_cloud", {
      p_slug: toWordMemoryCloudSlug(slug),
      p_pin: pin || null,
    });
    // 加载云端时不再整包替换本机，而是逐词按最后操作时间合并。
    // 这样手机“忘了”和电脑旧的“31天”发生冲突时，较新的操作会保留。
    const remote = mergeCloudDataIntoLocal(data, { applyStudySession: true });
    suppressCloudSync = true;
    if (!publicView) {
      saveWords({ skipCloud: true, immediate: true });
      state.cloud.config = {
        ...state.cloud.config,
        slug,
        pin,
        displayName: data?.display_name || state.cloud.config.displayName || "专升本单词记忆",
        isPublic: data?.is_public !== false,
        autoSync: true,
      };
      saveCloudConfig(state.cloud.config);
    }
    suppressCloudSync = false;
    if (!remote.compactCloud?.data?.studySession) {
      setActiveId(null);
      resetTypingState();
    }
    render();
    if (!options.silent) {
      setCloudStatus(`已连接并加载 ${state.words.length} 个词条，自动同步已开启。`, "ok");
      showToast("已连接云端并开启同步");
    }
    return true;
  } catch (error) {
    suppressCloudSync = false;
    setCloudStatus(error.message || "从云端加载失败", "warn");
    showToast(error.message || "从云端加载失败");
    return false;
  }
}

function autoSaveCloudSoon() {
  if (suppressCloudSync || PUBLIC_VIEWER_SLUG || (EDITOR_VIEW_SLUG && !state.cloud.canEdit)) {
    return;
  }
  const config = state.cloud.config;
  if (!config.autoSync || !config.slug || !config.pin) {
    return;
  }
  window.clearTimeout(cloudSyncTimer);
  cloudSyncTimer = window.setTimeout(() => {
    saveCloudNow({ silent: true });
  }, 1000);
}

function makeShareLink(kind) {
  const config = readCloudFormConfig();
  const base = normalizeShareBaseUrl(els.shareBaseUrlInput?.value || defaultShareBaseUrl());
  try {
    localStorage.setItem(SHARE_BASE_URL_KEY, base);
  } catch {
    // Link generation can continue without saving the address.
  }
  const url = new URL(base);
  url.search = kind === "edit" ? `?edit=${config.slug}` : `?public=${config.slug}`;
  return url.href;
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
  } catch {
    showToast(text);
  }
}

function copyPublicLink() {
  const config = readCloudFormConfig();
  if (!config.slug) {
    setCloudStatus("请先填写公开编号。", "warn");
    return;
  }
  copyText(makeShareLink("public"), "公开链接已复制");
}

function copyEditLink() {
  const config = readCloudFormConfig();
  if (!config.slug) {
    setCloudStatus("请先填写公开编号。", "warn");
    return;
  }
  copyText(makeShareLink("edit"), "协作链接已复制");
}

async function connectSharedEditCloud() {
  const config = readCloudFormConfig();
  config.slug = EDITOR_VIEW_SLUG || config.slug;
  if (!config.slug || config.pin.length < 4) {
    setCloudStatus("协作编辑需要公开编号和编辑密码。", "warn");
    return false;
  }
  try {
    setCloudStatus("正在验证编辑密码……");
    await cloudRequest("verify_word_memory_cloud_pin", {
      p_slug: toWordMemoryCloudSlug(config.slug),
      p_pin: config.pin,
    });
    state.cloud.canEdit = true;
    state.cloud.config = { ...config, autoSync: true };
    saveCloudConfig(state.cloud.config);
    await loadCloudToLocal({ slug: config.slug, pin: config.pin, silent: true });
    setCloudStatus("协作编辑已开启，之后的修改会自动同步。", "ok");
    showToast("协作编辑已开启");
    closeCloudDialog();
    return true;
  } catch (error) {
    setCloudStatus(error.message || "编辑密码不正确", "warn");
    showToast(error.message || "编辑密码不正确");
    return false;
  }
}

function renderCloudAccessState() {
  const readonly = isCloudReadOnly();
  document.body?.classList?.toggle("is-readonly-cloud", readonly);
  if (!els.readonlyBanner) {
    return;
  }
  if (PUBLIC_VIEWER_SLUG) {
    els.readonlyBanner.hidden = false;
    els.readonlyBanner.textContent = `正在查看公开词库：${PUBLIC_VIEWER_SLUG}，这里只能查看，不能编辑。`;
    return;
  }
  if (EDITOR_VIEW_SLUG && !state.cloud.canEdit) {
    els.readonlyBanner.hidden = false;
    els.readonlyBanner.textContent = `协作词库：${EDITOR_VIEW_SLUG}。输入编辑密码后才能修改并同步。`;
    return;
  }
  els.readonlyBanner.hidden = true;
}

function initializeCloudFromUrl() {
  if (PUBLIC_VIEWER_SLUG) {
    state.cloud.canEdit = false;
    state.words = [];
    setActiveId(null);
    render();
    loadCloudToLocal({ slug: PUBLIC_VIEWER_SLUG, publicView: true, silent: true }).then((ok) => {
      if (ok) {
        showToast("已打开公开词库，只能查看");
      }
    });
    return;
  }
  if (EDITOR_VIEW_SLUG) {
    state.cloud.canEdit = false;
    state.cloud.config = { ...state.cloud.config, slug: EDITOR_VIEW_SLUG, autoSync: false };
    state.words = [];
    setActiveId(null);
    render();
    openCloudDialog();
    setCloudStatus("这是协作链接，输入编辑密码后可以修改同一份云端数据。", "warn");
  }
}

function formatDateTime(value) {
  if (!value) {
    return "未安排";
  }
  const date = new Date(value);
  const sameDay = todayKey(date) === todayKey();
  const day = sameDay ? "今天" : `${date.getMonth() + 1}/${date.getDate()}`;
  return `${day} ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function isDue(word, date = nowDate(), mode = state.practiceMode) {
  const progress = modeProgress(word, mode);
  return Boolean(progress.nextReviewAt && new Date(progress.nextReviewAt) <= date);
}

function isTodayReview(word, mode = state.practiceMode) {
  const progress = modeProgress(word, mode);
  return Boolean(progress.nextReviewAt && todayKey(new Date(progress.nextReviewAt)) === todayKey());
}

function learnedToday(word, mode = state.practiceMode) {
  const progress = modeProgress(word, mode);
  return progress.history.some((entry) => todayKey(new Date(entry.time)) === todayKey());
}

function wordGroupName(word) {
  return wordGroupNames(word)[0] || "未分组";
}

function wordGroupNames(word) {
  const tag = normalizeText(word.tag);
  const primary = tag ? (tag.split("/")[0].trim() || tag) : "未分组";
  return [...new Set([
    primary,
    ...(Array.isArray(word.groups) ? word.groups : []),
    ...builtinGroupAliasesForTerm(word.term),
  ].map(normalizeText).filter(Boolean))];
}

function wordMatchesActiveGroup(word) {
  if (state.activeGroup === "all") return true;
  const groupNames = wordGroupNames(word);
  if (groupNames.includes(state.activeGroup)) return true;
  if (["全方位", "蓝色森林", "Word List", "四级", "短语练习", "听写内容"].includes(state.activeGroup)) {
    return groupNames.some((groupName) => progressRootName(groupName) === state.activeGroup);
  }
  return false;
}

function wordTextBlob(word) {
  return [word.term, word.meaning, word.phrase, word.note, word.tag, ...(word.groups || []), ...(word.sources || [])].join(" ").toLowerCase();
}

function meaningSegments(text) {
  const raw = normalizeText(text || "");
  if (!raw) return [];
  return raw
    .split(/[；;。]|(?:\s+[/／]\s+)|(?:，(?=[^，]{1,18}(?:；|$)))/)
    .map((item) => normalizeText(item).replace(/^[,，、:：\s]+/, ""))
    .filter(Boolean)
    .slice(0, 8);
}

function hasMultiMeaning(word) {
  const parts = meaningSegments(word.meaning);
  return parts.length >= 2 || /；|;|一词多义|多义|熟词僻义/.test(word.meaning || word.note || "");
}

function hasFixedPhrase(word) {
  return Boolean(normalizeText(word.phrase)) || /搭配|短语|固定搭配|look forward to|be .* to|depend on|according to/i.test(wordTextBlob(word));
}

const RARE_MEANING_TERMS = new Set("case charge present park leave book match fair fine still light address rest mean right term course issue matter business raise lie bear sound spring capital subject object form figure deal".split(" "));
function hasRareMeaning(word) {
  const term = normalizeText(word.term).toLowerCase().replace(/[^a-z]/g, "");
  const text = wordTextBlob(word);
  return RARE_MEANING_TERMS.has(term) || /熟词僻义|僻义|考试义|多义|指控|充电|提出|出席|案件|期限|术语/.test(text);
}

function progressHasResult(word, matcher) {
  const progress = word.progress && typeof word.progress === "object" ? word.progress : {};
  return Object.values(progress).some((item) => Array.isArray(item?.history) && item.history.some((entry) => matcher(entry.result || "")))
    || (Array.isArray(word.history) && word.history.some((entry) => matcher(entry.result || "")));
}

function isSpellingWeakWord(word) {
  return word.important || progressHasResult(word, (result) => ["spell-wrong", "forms-wrong"].includes(result));
}

function isDictationWeakWord(word) {
  return word.important || progressHasResult(word, (result) => ["dictation-wrong", "spell-wrong"].includes(result));
}

function abilityMetric(wordOrId, type = "recognition") {
  const id = typeof wordOrId === "string" ? wordOrId : wordOrId?.id;
  const item = id ? memoryLabStore.metrics[id] : null;
  return normalizeAbilityStat(item?.[type]);
}

function abilityLabel(score = 0) {
  if (score >= 80) return "熟练";
  if (score >= 55) return "基本掌握";
  if (score >= 25) return "学习中";
  return "薄弱";
}

function recordMemoryMetric(word, type, correct, meta = {}) {
  if (!word?.id || !["recognition", "spelling"].includes(type)) return;
  const now = new Date().toISOString();
  const item = memoryLabStore.metrics[word.id] || {
    recognition: normalizeAbilityStat(),
    spelling: normalizeAbilityStat(),
    confusedWith: {},
    resetAt: "",
    updatedAt: "",
  };
  const stat = normalizeAbilityStat(item[type]);
  const responseMs = Math.max(0, Number(meta.responseMs) || 0);
  if (correct) stat.correct += 1;
  else stat.wrong += 1;
  if (responseMs) {
    stat.totalMs += responseMs;
    stat.lastMs = responseMs;
    if (responseMs >= 3500) stat.slow += 1;
  }
  const speedBonus = responseMs && responseMs <= 2200 ? 2 : 0;
  stat.score = Math.max(0, Math.min(100, stat.score + (correct ? 6 + speedBonus : -14)));
  stat.updatedAt = now;
  item[type] = stat;
  const confusedId = normalizeText(meta.confusedWithId || "");
  if (!correct && confusedId && confusedId !== word.id) {
    item.confusedWith[confusedId] = (Number(item.confusedWith[confusedId]) || 0) + 1;
  }
  item.updatedAt = now;
  memoryLabStore.metrics[word.id] = item;
  saveMemoryLabStore();
}

function recordRatingMetric(word, result, meta = null) {
  if (!word) return;
  if (meta?.skipMetric) return;
  const correct = result === "remember" || result === "new";
  const mode = meta?.mode || "recall";
  const type = mode === "spelling" ? "spelling" : "recognition";
  recordMemoryMetric(word, type, correct, {
    responseMs: meta?.responseMs || 0,
    confusedWithId: meta?.confusedWithId || "",
  });
}

function wordFamilyStem(value = "") {
  let term = normalizeText(typeof value === "string" ? value : value?.term || "").toLowerCase().replace(/[^a-z]/g, "");
  if (term.length < 4) return term;
  const suffixes = ["ization", "isation", "ational", "fulness", "ousness", "iveness", "ability", "ibility", "ation", "ition", "tion", "sion", "ment", "ness", "ance", "ence", "ancy", "ency", "ality", "ility", "ity", "ive", "ous", "ful", "less", "able", "ible", "ally", "ly", "er", "or", "ing", "ed", "es", "s"];
  for (const suffix of suffixes) {
    if (term.endsWith(suffix) && term.length - suffix.length >= 4) {
      term = term.slice(0, -suffix.length);
      break;
    }
  }
  return term;
}

function wordAbilitySummary(word) {
  const recognition = abilityMetric(word, "recognition");
  const spelling = abilityMetric(word, "spelling");
  return { recognition, spelling, recognitionLabel: abilityLabel(recognition.score), spellingLabel: abilityLabel(spelling.score) };
}

function weakScore(word) {
  let score = 0;
  if (word.important) score += 50;
  if (isDue(word)) score += 30;
  const progress = activeModeProgress(word);
  if (progress.stage < 1) score += 16;
  if (progress.status === "new") score += 8;
  if (progressHasResult(word, (result) => ["forgot", "fuzzy", "spell-wrong", "forms-wrong", "choice-wrong"].includes(result))) score += 30;
  return score;
}

function isWeakWord(word) {
  return weakScore(word) > 0;
}

function priorityOf(word) {
  if (word.priority) return word.priority;
  if (word.important || /重点|高频|核心|必背|四级|蓝色森林/i.test(wordTextBlob(word))) return "A";
  if (hasMultiMeaning(word) || hasFixedPhrase(word) || hasRareMeaning(word)) return "B";
  return "C";
}

const POS_CLASSIFY_LABELS = {
  noun: "名词",
  verb: "动词",
  numeral: "数词",
  adjective: "形容词",
  adverb: "副词",
};
const NOUN_COUNT_LABELS = {
  countable: "可数名词",
  uncountable: "不可数名词",
  both: "可数 / 不可数均可",
};
const VERB_TRANSITIVITY_LABELS = {
  transitive: "及物动词",
  intransitive: "不及物动词",
  both: "及物 / 不及物均可",
  linking: "系动词",
  auxiliary: "助动词",
  modal: "情态动词",
};
const LINKING_VERBS = new Set(["be", "become", "seem", "appear", "remain", "stay", "feel", "look", "sound", "smell", "taste", "grow", "turn", "get", "prove"]);
const AUXILIARY_VERBS = new Set(["be", "do", "have"]);
const MODAL_VERBS = new Set(["can", "could", "may", "might", "must", "shall", "should", "will", "would", "ought"]);
const NUMERAL_TERMS = new Set([
  "zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety","hundred","thousand","million","billion","dozen",
  "first","second","third","fourth","fifth","sixth","seventh","eighth","ninth","tenth","eleventh","twelfth","thirteenth","fourteenth","fifteenth","sixteenth","seventeenth","eighteenth","nineteenth","twentieth"
]);
const BOTH_COUNT_NOUNS = new Set([
  "experience","time","room","paper","glass","chicken","light","hair","business","work","exercise","coffee","tea","food","education","behavior","behaviour","life","sound","language","truth","memory","thought","interest","success","failure","change","history","society","nature","power","service"
]);
const UNCOUNTABLE_NOUNS = new Set([
  "advice","information","news","furniture","luggage","baggage","equipment","homework","weather","traffic","progress","knowledge","money","music","bread","rice","water","milk","sugar","salt","air","evidence","research","health","happiness","luck","fun","damage","pollution","accommodation","permission","software","hardware","clothing","electricity","energy","patience","courage","honesty","freedom","peace","rubbish","garbage","trash","cash","medicine","tuition","transportation","transport","machinery","scenery","jewelry","jewellery","poetry","grammar","vocabulary","employment","unemployment","wealth","poverty","safety","importance"
]);

function normalizedTermKey(word) {
  return normalizeText(word?.term || "").toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ");
}

function targetPosesFor(word) {
  const term = normalizedTermKey(word);
  if (NUMERAL_TERMS.has(term)) return ["numeral"];
  const raw = normalizeText(word?.meaning || "");
  const hits = [];
  const patterns = [
    ["noun", /(?:^|[\s;/／；，,、])(?:n|noun)\s*[.:：]/gi],
    ["verb", /(?:^|[\s;/／；，,、])(?:vt|vi|v|verb)\s*[.:：]/gi],
    ["numeral", /(?:^|[\s;/／；，,、])(?:num|numeral)\s*[.:：]/gi],
    ["adjective", /(?:^|[\s;/／；，,、])(?:adj|adjective)\s*[.:：]/gi],
    ["adverb", /(?:^|[\s;/／；，,、])(?:adv|adverb)\s*[.:：]/gi],
  ];
  patterns.forEach(([type, pattern]) => {
    for (const match of raw.matchAll(pattern)) hits.push({ type, index: match.index || 0 });
  });
  if (/数词/.test(raw)) hits.push({ type: "numeral", index: raw.indexOf("数词") });
  if (/形容词/.test(raw)) hits.push({ type: "adjective", index: raw.indexOf("形容词") });
  if (/副词/.test(raw)) hits.push({ type: "adverb", index: raw.indexOf("副词") });
  if (/名词/.test(raw)) hits.push({ type: "noun", index: raw.indexOf("名词") });
  if (/动词/.test(raw)) hits.push({ type: "verb", index: raw.indexOf("动词") });
  hits.sort((a, b) => a.index - b.index);
  return [...new Set(hits.map((item) => item.type))];
}

function primaryTargetPos(word) {
  const poses = targetPosesFor(word);
  return poses[0] || "";
}

function hasUnambiguousTargetPos(word) {
  return targetPosesFor(word).length === 1;
}

function isPosClassificationEligible(word) {
  if (isPhraseWord(word)) return false;
  return Boolean(primaryTargetPos(word));
}

function nounCountability(word) {
  const term = normalizedTermKey(word).replace(/'s$/, "");
  const raw = normalizeText(word?.meaning || "").toLowerCase();
  if (/两者均可|可数与不可数|可数或不可数|\[c\/?u\]|\[u\/?c\]/i.test(raw)) return "both";
  if (/不可数|\[u\]|\(u\)|uncountable/i.test(raw)) return "uncountable";
  if (/可数|\[c\]|\(c\)|countable/i.test(raw)) return "countable";
  if (BOTH_COUNT_NOUNS.has(term)) return "both";
  if (UNCOUNTABLE_NOUNS.has(term)) return "uncountable";
  const uncountableHint = /信息|建议|家具|设备|行李|作业|天气|交通|进步|知识|钱|音乐|面包|米饭|水|牛奶|糖|盐|空气|证据|研究|健康|幸福|运气|污染|电力|能源|耐心|勇气|诚实|自由|和平|垃圾|现金|学费|词汇|语法/.test(raw);
  if (uncountableHint) return "uncountable";
  return "countable";
}

function verbTransitivity(word) {
  const term = normalizedTermKey(word);
  const raw = normalizeText(word?.meaning || "").toLowerCase();
  if (/情态动词|modal\s*(?:verb)?/i.test(raw) || MODAL_VERBS.has(term)) return "modal";
  if (/助动词|aux(?:iliary)?\s*(?:verb)?/i.test(raw)) return "auxiliary";
  if (/系动词|linking\s*(?:verb)?/i.test(raw)) return "linking";
  const hasVt = /(?:^|[\s;/／；，,、])vt\s*[.:：]/i.test(raw) || /及物动词/.test(raw);
  const hasVi = /(?:^|[\s;/／；，,、])vi\s*[.:：]/i.test(raw) || /不及物动词/.test(raw);
  if (hasVt && hasVi) return "both";
  if (hasVt) return "transitive";
  if (hasVi) return "intransitive";
  if (LINKING_VERBS.has(term) && /系|表语|变得|保持|似乎|看起来|听起来|闻起来|尝起来/.test(raw)) return "linking";
  if (AUXILIARY_VERBS.has(term) && /助动/.test(raw)) return "auxiliary";
  return "";
}

function isNounCountabilityEligible(word) {
  return !isPhraseWord(word) && primaryTargetPos(word) === "noun";
}

function isVerbTransitivityEligible(word) {
  return !isPhraseWord(word) && primaryTargetPos(word) === "verb" && Boolean(verbTransitivity(word));
}

function normalizeFamilyTerm(value = "") {
  return normalizeText(value).toLowerCase().replace(/[^a-z]/g, "");
}

function familyStem(value = "") {
  let term = normalizeFamilyTerm(value);
  if (term.length < 5) return term;
  const rules = [
    [/ically$/, "ic"], [/ational$/, "ate"], [/fulness$/, "ful"], [/lessness$/, "less"],
    [/ization$/, "ize"], [/isation$/, "ise"], [/ability$/, "able"], [/ibility$/, "ible"],
    [/ically$/, "ic"], [/ously$/, "ous"], [/ively$/, "ive"], [/ally$/, "al"],
    [/ments?$/, ""], [/ness$/, ""], [/ities$/, "ity"], [/ity$/, ""],
    [/ations?$/, "ate"], [/itions?$/, ""], [/tions?$/, ""], [/sions?$/, ""],
    [/ances?$/, ""], [/ences?$/, ""], [/ables?$/, ""], [/ibles?$/, ""],
    [/ives?$/, ""], [/ous$/, ""], [/ful$/, ""], [/less$/, ""], [/ally$/, ""], [/ly$/, ""],
    [/ers?$/, ""], [/ors?$/, ""], [/al$/, ""], [/ic$/, ""], [/ize$/, ""], [/ise$/, ""], [/ify$/, ""],
  ];
  for (const [re, replacement] of rules) {
    if (re.test(term) && term.replace(re, replacement).length >= 4) {
      term = term.replace(re, replacement);
      break;
    }
  }
  if (term.endsWith("i") && term.length >= 5) term = term.slice(0, -1) + "y";
  return term;
}

function wordFamilyMembers(word, pool = state.words) {
  const stem = familyStem(word?.term || "");
  if (stem.length < 4) return [];
  const seen = new Set();
  return pool.filter((item) => {
    const term = normalizeFamilyTerm(item?.term || "");
    if (!term || isPhraseWord(item) || !primaryTargetPos(item)) return false;
    if (familyStem(term) !== stem || seen.has(term)) return false;
    seen.add(term);
    return true;
  }).sort((a, b) => a.term.localeCompare(b.term));
}

function isWordFamilyEligible(word) {
  return wordFamilyMembers(word).length >= 2;
}

function contextSentenceFor(word) {
  const term = normalizeText(word?.term || "");
  if (!term) return "";
  const presenter = window.WordContextPresenter;
  const catalogRecords = presenter?.contextsFor(word)?.records || [];
  if (catalogRecords[0]?.sentence) return catalogRecords[0].sentence;
  const candidates = [word?.example, word?.exampleSentence, word?.sentence, word?.phrase, word?.note]
    .filter(Boolean)
    .flatMap((value) => String(value).split(/[；;\n]/));
  return candidates.map(normalizeText).find((text) => {
    const exactMatch = window.WordContextEngine?.splitTarget(text, term);
    return exactMatch && text.split(/\s+/).length >= 4 && /[A-Za-z]/.test(text);
  }) || "";
}

function isPosContextEligible(word) {
  return Boolean(hasUnambiguousTargetPos(word) && contextSentenceFor(word));
}

function suffixHint(word) {
  const term = normalizeFamilyTerm(word?.term || "");
  const hints = [
    [/tion$|sion$|ment$|ness$|ity$|ance$|ence$/, "词尾常提示名词"],
    [/ous$|ful$|less$|able$|ible$|ive$|al$|ic$/, "词尾常提示形容词"],
    [/ly$/, "-ly 常提示副词，但 friendly、lovely 等是例外"],
    [/teen$|ty$|th$/, "词尾常见于基数词或序数词"],
  ];
  const match = hints.find(([re]) => re.test(term));
  return match ? match[1] : "结合词义、词尾和句中位置判断";
}

function meaningWithoutPosLabels(word) {
  const raw = normalizeText(word?.meaning || word?.phrase || word?.note || "未填释义");
  return raw
    .replace(/(?:^|[\s;/／；，,、])(?:n|noun|num|numeral|adj|adjective|adv|adverb|vt|vi|v|prep|pron|conj|det|art|aux|modal)\s*[.:：]/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[：:；;，,、\s]+/, "")
    .trim() || "未填释义";
}

function practiceEligibleWords(words) {
  switch (state.practiceMode) {
    case "forms":
      return words.filter(hasVerbForms);
    case "multiMeaning":
      return words.filter(hasMultiMeaning);
    case "rareMeaning":
      return words.filter(hasRareMeaning);
    case "fixedPhrase":
      return words.filter(hasFixedPhrase);
    case "spellingWeak":
      return words.filter(isSpellingWeakWord);
    case "dictationWeak":
      return words.filter(isDictationWeakWord);
    case "posClassify":
      return words.filter(isPosClassificationEligible);
    case "nounCountability":
      return words.filter(isNounCountabilityEligible);
    case "verbTransitivity":
      return words.filter(isVerbTransitivityEligible);
    case "wordFamily": {
      const counts = new Map();
      words.forEach((word) => {
        if (isPhraseWord(word) || !primaryTargetPos(word)) return;
        const stem = familyStem(word.term);
        if (stem.length >= 4) counts.set(stem, (counts.get(stem) || 0) + 1);
      });
      return words.filter((word) => {
        const stem = familyStem(word.term);
        return !isPhraseWord(word) && Boolean(primaryTargetPos(word)) && (counts.get(stem) || 0) >= 2;
      });
    }
    case "posContext":
      return words.filter(isPosContextEligible);
    default:
      return words;
  }
}

function resetTypingState() {
  state.spellingDraft = "";
  state.spellingResult = null;
  state.formDrafts = emptyVerbForms();
  state.formResult = null;
  state.revealStep = 0;
  state.contextIndex = 0;
  state.contextExpanded = false;
  state.choiceResult = null;
  state.posQuizResult = null;
}

function statusOf(word, mode = state.practiceMode) {
  const progress = modeProgress(word, mode);
  if (isDue(word, nowDate(), mode)) {
    return "due";
  }
  if (progress.status === "new" || (progress.stage < 0 && !progress.nextReviewAt)) {
    return "new";
  }
  if (progress.stage >= REVIEW_STEPS.length - 1) {
    return "mature";
  }
  return "learning";
}

function statusLabel(status) {
  return {
    due: "到期",
    new: "新词",
    learning: "学习中",
    mature: "稳定",
    important: "重点",
  }[status] || "新词";
}

function cloneWordForUndo(word) {
  return JSON.parse(JSON.stringify(word));
}

function rememberReviewUndo(word, action) {
  state.reviewUndo = {
    wordId: word.id,
    word: cloneWordForUndo(word),
    action,
    practiceMode: state.practiceMode,
    mode: state.mode,
    activeGroup: state.activeGroup,
    sprintWasActive: Boolean(state.sprint.active),
    createdAt: new Date().toISOString(),
  };
}


const GAZE_PROTECTED_ACTIONS = new Set(["remember", "fuzzy", "forgot", "undo-review", "show", "speak", "speak-uk"]);
const GAZE_SAFE_ACTIONS = new Set([]);

function isProtectedGazeAction(action) {
  return GAZE_PROTECTED_ACTIONS.has(action);
}

function clearGazePending() {
  const control = state.gazeControl;
  control.pendingTargetKey = "";
  control.pendingTargetLabel = "";
  control.pendingUntil = 0;
  document.querySelectorAll(".gaze-armed").forEach((node) => node.classList.remove("gaze-armed"));
}

function setGazeStatus(message, tone = "") {
  if (els.gazeStatus) {
    els.gazeStatus.textContent = message;
  }
  if (els.gazePanel) {
    els.gazePanel.dataset.tone = tone;
  }
}

function updateGazeButton() {
  if (!els.gazeControlButton) return;
  const active = Boolean(state.fingerControl?.enabled);
  els.gazeControlButton.classList.toggle("active", active);
  document.body.classList.toggle("finger-active", active);
  document.body.classList.remove("gaze-active");
  els.gazeControlButton.innerHTML = active ? '<span aria-hidden="true">☝</span> 关闭手指' : '<span aria-hidden="true">☝</span> 手指已关闭';
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateGazeGuidePosition() {
  if (!els.gazeGuide || !els.activeCard) return;
  const rect = els.activeCard.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const viewportWidth = Math.max(320, window.innerWidth || document.documentElement.clientWidth || 320);
  const viewportHeight = Math.max(420, window.innerHeight || document.documentElement.clientHeight || 420);
  const markerWidth = viewportWidth <= 720 ? 106 : 136;
  const safePad = viewportWidth <= 720 ? 6 : 12;
  const sideTop = clampNumber(
    rect.top + Math.min(Math.max(rect.height * 0.46, 145), rect.height - 110),
    78,
    viewportHeight - 118
  );
  const centerTop = clampNumber(rect.top + 12, 78, viewportHeight - 102);
  const leftX = clampNumber(rect.left + 18, safePad, viewportWidth - markerWidth - safePad);
  const rightX = clampNumber(rect.right - markerWidth - 18, safePad, viewportWidth - markerWidth - safePad);
  const centerX = clampNumber(rect.left + rect.width / 2, markerWidth / 2 + safePad, viewportWidth - markerWidth / 2 - safePad);
  els.gazeGuide.style.setProperty("--gaze-left-x", `${Math.round(leftX)}px`);
  els.gazeGuide.style.setProperty("--gaze-right-x", `${Math.round(rightX)}px`);
  els.gazeGuide.style.setProperty("--gaze-center-x", `${Math.round(centerX)}px`);
  els.gazeGuide.style.setProperty("--gaze-side-top", `${Math.round(sideTop)}px`);
  els.gazeGuide.style.setProperty("--gaze-center-top", `${Math.round(centerTop)}px`);
}

function loadExternalScript(src, timeoutMs = 4500) {
  return new Promise((resolve, reject) => {
    if (window.webgazer && typeof window.webgazer.setGazeListener === "function") {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[data-dynamic-src="${src}"]`);
    if (existing) existing.remove();
    const script = document.createElement("script");
    let done = false;
    const timer = window.setTimeout(() => {
      if (done) return;
      done = true;
      script.remove();
      reject(new Error(`脚本加载超时：${src}`));
    }, timeoutMs);
    script.src = src;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.dynamicSrc = src;
    script.onload = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      script.remove();
      reject(new Error(`脚本加载失败：${src}`));
    };
    document.head.appendChild(script);
  });
}

function isCameraSecureContext() {
  return window.isSecureContext || location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

async function requestGazeCameraStream() {
  if (!isCameraSecureContext()) {
    throw new Error("摄像头只能在 HTTPS 网页或本机 localhost 使用，不能直接用 D 盘文件稳定开启");
  }
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    throw new Error("当前浏览器不支持摄像头权限接口");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 320 }, height: { ideal: 240 } },
      audio: false,
    });
  } catch (error) {
    const name = error && error.name ? error.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      throw new Error("浏览器拒绝了摄像头权限：点地址栏左边小锁/网站设置，把摄像头改成允许");
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      throw new Error("没有检测到可用摄像头");
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      throw new Error("摄像头正在被其他软件占用，先关闭微信/钉钉/相机/会议软件再试");
    }
    throw new Error(error?.message || "摄像头开启失败");
  }
}

function stopMediaStream(stream) {
  try {
    stream?.getTracks?.().forEach((track) => track.stop());
  } catch (error) {}
}

async function ensureWebGazer() {
  if (window.webgazer && typeof window.webgazer.setGazeListener === "function") {
    return window.webgazer;
  }
  const sources = [
    "https://webgazer.cs.brown.edu/webgazer.js",
    "https://cdn.jsdelivr.net/npm/webgazer@2.1.1/dist/webgazer.min.js",
    "https://unpkg.com/webgazer@2.1.1/dist/webgazer.min.js",
    "https://cdn.jsdelivr.net/npm/webgazer/dist/webgazer.min.js",
  ];
  const errors = [];
  for (const src of sources) {
    try {
      await loadExternalScript(src);
      if (window.webgazer && typeof window.webgazer.setGazeListener === "function") return window.webgazer;
      errors.push(`${src} 未生成 webgazer`);
    } catch (error) {
      errors.push(error?.message || String(error));
    }
  }
  throw new Error(`眼神识别库加载失败，已切换备用模式。${errors.slice(0, 2).join("；")}`);
}

function readableGazeActionLabel(button) {
  const action = button?.dataset?.cardAction || "";
  const text = (button?.textContent || "").replace(/\s+/g, " ").trim();
  if (text) return text.length > 16 ? `${text.slice(0, 16)}…` : text;
  const labels = {
    remember: "记完",
    fuzzy: "模糊",
    forgot: "忘了",
    "undo-review": "撤回上一个",
    show: "显示释义",
    speak: "美音",
    "speak-uk": "英音",
    "toggle-important": "标重点",
  };
  return labels[action] || action || "按钮";
}

function gazeTargetFromPoint(data) {
  if (!data || !Number.isFinite(data.x) || !Number.isFinite(data.y) || !els.activeCard) return null;
  const x = data.x;
  const y = data.y;
  const buttons = Array.from(els.activeCard.querySelectorAll("[data-card-action]"))
    .filter((button) => !button.disabled && button.offsetParent !== null);
  let nearest = null;
  let nearestDistance = Infinity;
  for (const button of buttons) {
    const rect = button.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    // v58: 只认按钮中间的安全区域，不再把按钮边缘也算进去，减少误触。
    const insetX = Math.min(34, Math.max(14, rect.width * 0.18));
    const insetY = Math.min(22, Math.max(10, rect.height * 0.20));
    const innerLeft = rect.left + insetX;
    const innerRight = rect.right - insetX;
    const innerTop = rect.top + insetY;
    const innerBottom = rect.bottom - insetY;
    const inside = x >= innerLeft && x <= innerRight && y >= innerTop && y <= innerBottom;
    if (!inside) continue;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const distance = Math.hypot(x - cx, y - cy);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = button;
    }
  }
  if (!nearest) return null;
  return {
    action: nearest.dataset.cardAction,
    label: readableGazeActionLabel(nearest),
    button: nearest,
  };
}

function stopGazeControl(message = "已关闭眼神翻词") {
  const control = state.gazeControl;
  control.enabled = false;
  control.starting = false;
  control.mode = "";
  control.lastZone = "center";
  control.lastTargetKey = "";
  control.zoneStartedAt = 0;
  control.cooldownUntil = 0;
  clearGazePending();
  control.fallbackBaseline = null;
  control.fallbackSamples = [];
  if (control.fallbackTimer) {
    window.cancelAnimationFrame(control.fallbackTimer);
    control.fallbackTimer = null;
  }
  stopMediaStream(control.fallbackStream);
  control.fallbackStream = null;
  if (control.fallbackVideo) {
    try { control.fallbackVideo.pause?.(); } catch (error) {}
    control.fallbackVideo.srcObject = null;
    control.fallbackVideo.remove();
    control.fallbackVideo = null;
  }
  if (control.fallbackCanvas) {
    control.fallbackCanvas.remove();
    control.fallbackCanvas = null;
  }
  if (window.webgazer) {
    try { window.webgazer.clearGazeListener?.(); } catch (error) {}
    try { window.webgazer.pause?.(); } catch (error) {}
    try { window.webgazer.showVideoPreview?.(false); } catch (error) {}
    try { window.webgazer.showPredictionPoints?.(false); } catch (error) {}
  }
  if (els.gazePanel) els.gazePanel.hidden = true;
  if (els.gazeGuide) els.gazeGuide.hidden = true;
  clearGazeHover();
  updateGazeButton();
  if (message) showToast(message);
}

function runGazeAction(target) {
  const word = activeWord();
  if (!word || !target?.action) return;
  const action = target.action;
  handleCardAction(action);
  setGazeStatus(`已触发：${target.label}`, "ok");
}

function clearGazeHover() {
  document.querySelectorAll(".gaze-hover").forEach((node) => node.classList.remove("gaze-hover"));
}

function markGazePending(target) {
  clearGazePending();
  const control = state.gazeControl;
  const key = `${target.action}:${target.label}`;
  control.pendingTargetKey = key;
  control.pendingTargetLabel = target.label;
  control.pendingUntil = Date.now() + 4500;
  target.button?.classList.add("gaze-armed");
}

function handleResolvedGazeTarget(target, emptyMessage = "保护模式：所有按钮都要先锁定，再看同一个按钮确认。") {
  const control = state.gazeControl;
  if (!control.enabled) return;
  const now = Date.now();
  if (now < control.cooldownUntil) return;

  if (control.pendingTargetKey && now > control.pendingUntil) {
    const oldLabel = control.pendingTargetLabel;
    clearGazePending();
    setGazeStatus(oldLabel ? `已取消“${oldLabel}”确认` : emptyMessage, "");
  }

  if (!target) {
    clearGazeHover();
    control.lastTargetKey = "";
    control.zoneStartedAt = now;
    setGazeStatus(control.pendingTargetKey ? `已锁定“${control.pendingTargetLabel}”，再看同一个按钮确认；4 秒后自动取消。` : emptyMessage, "");
    return;
  }

  const key = `${target.action}:${target.label}`;
  if (control.pendingTargetKey && control.pendingTargetKey !== key) {
    clearGazeHover();
    target.button?.classList.add("gaze-hover");
    setGazeStatus(`已锁定“${control.pendingTargetLabel}”。要执行就再看它；不想执行等 4 秒自动取消。`, "warn");
    return;
  }

  if (key !== control.lastTargetKey) {
    clearGazeHover();
    target.button?.classList.add("gaze-hover");
    control.lastTargetKey = key;
    control.zoneStartedAt = now;
  }

  const dwell = now - (control.zoneStartedAt || now);
  const protectedAction = isProtectedGazeAction(target.action);
  const isConfirming = control.pendingTargetKey === key;
  const requiredMs = isConfirming ? control.confirmDwellMs : (protectedAction ? control.dwellMs : control.safeDwellMs);
  const pct = Math.min(100, Math.round((dwell / requiredMs) * 100));
  const prefix = isConfirming ? "确认" : (protectedAction ? "锁定" : "看着");
  setGazeStatus(`${prefix}“${target.label}” ${pct}%`, protectedAction ? "warn" : "");

  if (dwell < requiredMs) return;

  if (protectedAction && !isConfirming) {
    markGazePending(target);
    control.cooldownUntil = now + 500;
    control.lastTargetKey = "";
    control.zoneStartedAt = 0;
    setGazeStatus(`已锁定“${target.label}”：4 秒内再看一次才会执行。`, "warn");
    return;
  }

  clearGazePending();
  control.cooldownUntil = now + 1800;
  control.lastTargetKey = "";
  control.zoneStartedAt = 0;
  clearGazeHover();
  runGazeAction(target);
}

function handleGazePoint(data) {
  handleResolvedGazeTarget(gazeTargetFromPoint(data));
}

function buttonTargetByAction(action) {
  const button = els.activeCard?.querySelector(`[data-card-action="${action}"]`);
  if (!button || button.disabled || button.offsetParent === null) return null;
  return { action, label: readableGazeActionLabel(button), button };
}

function fallbackTargetFromDirection(dx, dy) {
  // v59: 备用眼控更保守，方向不明显时一律不触发。布局按三列三行：
  // 记完 / 模糊 / 显示释义；撤回 / 美音 / 忘了；空 / 英音 / 空。
  if (Math.abs(dx) < 0.095 && Math.abs(dy) < 0.095) return null;
  let col = 1;
  if (dx < -0.16) col = 0;
  else if (dx > 0.16) col = 2;
  else if (Math.abs(dx) > 0.095) col = 1;
  let row = null;
  if (dy < -0.12) row = 0;
  else if (dy > 0.22) row = 2;
  else if (dy > 0.105) row = 1;
  if (row === null) return null;
  const actionRows = [
    ["remember", "fuzzy", "show"],
    ["undo-review", "speak", "forgot"],
    ["", "speak-uk", ""],
  ];
  const action = actionRows[row]?.[col] || "";
  return action ? buttonTargetByAction(action) : null;
}

function estimateEyeDirectionFromVideo(video, canvas, control) {
  const width = 160;
  const height = 120;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || video.readyState < 2) return null;
  try { ctx.drawImage(video, 0, 0, width, height); } catch (error) { return null; }
  const rx = Math.round(width * 0.22);
  const ry = Math.round(height * 0.22);
  const rw = Math.round(width * 0.56);
  const rh = Math.round(height * 0.34);
  const image = ctx.getImageData(rx, ry, rw, rh);
  const data = image.data;
  const grays = [];
  for (let i = 0; i < data.length; i += 4) {
    grays.push(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
  }
  if (!grays.length) return null;
  const sorted = grays.slice().sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * 0.22)] + 10;
  let total = 0, sx = 0, sy = 0, p = 0;
  for (let y = 0; y < rh; y += 1) {
    for (let x = 0; x < rw; x += 1) {
      const gray = grays[p++];
      if (gray <= threshold) {
        const weight = Math.max(1, threshold - gray);
        total += weight;
        sx += x * weight;
        sy += y * weight;
      }
    }
  }
  if (total < 80) return null;
  const nx = sx / total / rw;
  const ny = sy / total / rh;
  if (!control.fallbackBaseline) {
    control.fallbackSamples.push({ nx, ny });
    if (control.fallbackSamples.length < 12) {
      setGazeStatus(`备用眼控校准中 ${control.fallbackSamples.length}/12：正视单词，不要动`, "");
      return null;
    }
    const sum = control.fallbackSamples.reduce((acc, item) => ({ x: acc.x + item.nx, y: acc.y + item.ny }), { x: 0, y: 0 });
    control.fallbackBaseline = { x: sum.x / control.fallbackSamples.length, y: sum.y / control.fallbackSamples.length };
    setGazeStatus("备用眼控已开启：保护模式开启。所有按钮都需要二次确认。", "ok");
    return null;
  }
  return { dx: nx - control.fallbackBaseline.x, dy: ny - control.fallbackBaseline.y };
}

async function startLocalGazeFallback(reason = "标准眼神识别不可用") {
  const control = state.gazeControl;
  const stream = await requestGazeCameraStream();
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = stream;
  video.style.position = "fixed";
  video.style.left = "-9999px";
  video.style.width = "1px";
  video.style.height = "1px";
  const canvas = document.createElement("canvas");
  canvas.hidden = true;
  document.body.append(video, canvas);
  await video.play().catch(() => {});
  control.fallbackStream = stream;
  control.fallbackVideo = video;
  control.fallbackCanvas = canvas;
  control.fallbackBaseline = null;
  control.fallbackSamples = [];
  control.mode = "fallback";
  control.enabled = true;
  control.starting = false;
  control.cooldownUntil = Date.now() + 1200;
  setGazeStatus(`${reason}，已启用本机备用眼控。先正视单词 1 秒校准。`, "warn");
  const tick = () => {
    if (!control.enabled || control.mode !== "fallback") return;
    const estimate = estimateEyeDirectionFromVideo(video, canvas, control);
    if (estimate) {
      handleResolvedGazeTarget(fallbackTargetFromDirection(estimate.dx, estimate.dy), "备用眼控保护模式：方向明显才识别；所有按钮都需要二次确认。");
    }
    control.fallbackTimer = window.requestAnimationFrame(tick);
  };
  tick();
  updateGazeButton();
  showToast("已启用备用眼控模式");
}

async function startGazeControl() {
  const control = state.gazeControl;
  if (control.enabled || control.starting) {
    stopGazeControl();
    return;
  }
  control.starting = true;
  control.mode = "starting";
  updateGazeButton();
  if (els.gazePanel) els.gazePanel.hidden = false;
  setGazeStatus("正在检查摄像头权限。首次使用请点允许。", "");
  let permissionStream = null;
  try {
    permissionStream = await requestGazeCameraStream();
    stopMediaStream(permissionStream);
    permissionStream = null;
    setGazeStatus("摄像头已允许，最多等待 6 秒加载标准眼神识别库；失败会自动切换备用模式。", "");
    const webgazer = await Promise.race([
      ensureWebGazer(),
      new Promise((_, reject) => window.setTimeout(() => reject(new Error("标准眼神识别库加载超过 6 秒，已改用备用模式")), 6000))
    ]);
    try { webgazer.showVideoPreview?.(false); } catch (error) {}
    try { webgazer.showPredictionPoints?.(false); } catch (error) {}
    try { webgazer.showFaceOverlay?.(false); } catch (error) {}
    try { webgazer.showFaceFeedbackBox?.(false); } catch (error) {}
    webgazer.setGazeListener((data) => handleGazePoint(data));
    const result = webgazer.begin();
    if (result && typeof result.then === "function") await result;
    control.enabled = true;
    control.starting = false;
    control.mode = "webgazer";
    control.lastZone = "center";
    control.lastTargetKey = "";
    control.zoneStartedAt = Date.now();
    control.cooldownUntil = Date.now() + 1000;
    setGazeStatus("已开启保护模式：所有按钮都需要先锁定，再看同一个按钮确认。", "ok");
    showToast("眼神翻词已开启");
  } catch (error) {
    stopMediaStream(permissionStream);
    try {
      await startLocalGazeFallback(error?.message || "标准眼神识别不可用");
      return;
    } catch (fallbackError) {
      control.enabled = false;
      control.starting = false;
      control.mode = "";
      if (els.gazePanel) els.gazePanel.hidden = false;
      if (els.gazeGuide) els.gazeGuide.hidden = true;
      const message = fallbackError?.message || error?.message || "眼神翻词开启失败";
      setGazeStatus(`开启失败：${message}`, "warn");
      showToast(`眼神翻词开启失败：${message}`);
    }
  }
  updateGazeButton();
}

function undoLastReview() {
  if (!state.reviewUndo) {
    showToast("没有可撤回的上一步");
    return;
  }
  if (!guardEditable()) {
    return;
  }
  const snapshot = state.reviewUndo;
  const index = state.words.findIndex((item) => item.id === snapshot.wordId);
  if (index < 0) {
    state.reviewUndo = null;
    showToast("上一个词已经不存在，不能撤回");
    renderActiveCard();
    return;
  }
  state.words[index] = normalizeWord(snapshot.word);
  state.practiceMode = PROGRESS_MODES.includes(snapshot.practiceMode) ? snapshot.practiceMode : state.practiceMode;
  state.mode = ["due", "new", "all", "weak"].includes(snapshot.mode) ? snapshot.mode : state.mode;
  state.activeGroup = snapshot.activeGroup || state.activeGroup;
  setActiveId(snapshot.wordId);
  state.answerVisible = true;
  resetTypingState();
  state.lastAutoSpokenId = null;
  if (snapshot.sprintWasActive && state.sprint.active) {
    state.sprint.completed = Math.max(0, Number(state.sprint.completed || 0) - 1);
  }
  state.reviewUndo = null;
  reconcileDailyCompletedWord(state.words[index]);
  saveWords();
  render();
  showToast("已撤回上一步，回到上一个词");
}

function quickSessionQuestionMode(session = state.quickSession) {
  const modes = Array.isArray(session?.questionModes) ? session.questionModes.filter((mode) => ["recall", "choice", "spelling"].includes(mode)) : [];
  return modes.length ? modes[Math.max(0, Number(session.completed) || 0) % modes.length] : "choice";
}

function quickSessionSnapshot() {
  const session = state.quickSession || {};
  return {
    active: Boolean(session.active),
    ending: Boolean(session.ending),
    id: session.id || "",
    type: session.type || "",
    label: session.label || "",
    remaining: Array.isArray(session.queueIds) ? session.queueIds.length : 0,
    completed: Number(session.completed) || 0,
    correct: Number(session.correct) || 0,
    wrong: Number(session.wrong) || 0,
    startedAt: session.startedAt || "",
    endsAt: session.endsAt || "",
    questionMode: quickSessionQuestionMode(session),
    results: Array.isArray(session.results) ? session.results.slice(-30) : [],
  };
}

function notifyMemoryLab() {
  try { window.WordMemoryLab?.render?.(); } catch { /* optional enhancement */ }
}

function openMobileFocusForSession() {
  if (!mobileFocusController) initializeMobileFocus();
  if (!mobileFocusController) return;
  mobileFocusController.open();
  mobileFocusController.setMode(quickSessionQuestionMode());
}

function startQuickSession(config = {}) {
  const ids = [...new Set((Array.isArray(config.ids) ? config.ids : []).map(normalizeText).filter((id) => state.words.some((word) => word.id === id)))];
  if (!ids.length) {
    showToast(config.emptyMessage || "当前没有符合条件的单词");
    return false;
  }
  if (state.quickSession.active) finishQuickSession("replaced", { immediate: true });
  const now = new Date();
  const durationSeconds = Math.max(0, Number(config.durationSeconds) || 0);
  state.quickSession = {
    active: true,
    ending: false,
    id: `quick-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: normalizeText(config.type || "rapid"),
    label: normalizeText(config.label || "快速复习"),
    queueIds: ids,
    questionModes: (Array.isArray(config.questionModes) ? config.questionModes : [config.mode || "choice"]).filter((mode) => ["recall", "choice", "spelling"].includes(mode)),
    startedAt: now.toISOString(),
    endsAt: durationSeconds ? new Date(now.getTime() + durationSeconds * 1000).toISOString() : "",
    completed: 0,
    correct: 0,
    wrong: 0,
    results: [],
    streaks: {},
    original: {
      practiceMode: state.practiceMode,
      mode: state.mode,
      activeGroup: state.activeGroup,
      activeId: state.activeId,
    },
  };
  state.practiceMode = "card";
  state.mode = "all";
  setActiveId(ids[0]);
  state.answerVisible = false;
  resetTypingState();
  render();
  window.setTimeout(openMobileFocusForSession, 0);
  notifyMemoryLab();
  return true;
}

function finishQuickSession(reason = "completed", options = {}) {
  const session = state.quickSession;
  if (!session?.active && !session?.ending) return null;
  const endedAt = new Date();
  const startedMs = Date.parse(session.startedAt || "") || endedAt.getTime();
  const weakIds = [...new Set((session.results || []).filter((item) => !item.correct).map((item) => item.wordId).filter(Boolean))].slice(0, 20);
  const report = {
    id: session.id || `quick-${endedAt.getTime()}`,
    type: session.type || reason,
    label: session.label || "快速复习",
    startedAt: session.startedAt || endedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    completed: Number(session.completed) || 0,
    correct: Number(session.correct) || 0,
    wrong: Number(session.wrong) || 0,
    durationSeconds: Math.max(0, Math.round((endedAt.getTime() - startedMs) / 1000)),
    weakIds,
  };
  memoryLabStore.reports = [...(memoryLabStore.reports || []), report].slice(-30);
  saveMemoryLabStore();
  const original = session.original || {};
  state.quickSession = { active: false, ending: false, id: "", type: "", label: "", queueIds: [], questionModes: [], startedAt: "", endsAt: "", completed: 0, correct: 0, wrong: 0, results: [], streaks: {}, original: null };
  state.practiceMode = PROGRESS_MODES.includes(original.practiceMode) ? original.practiceMode : "card";
  state.mode = ["due", "new", "all", "weak"].includes(original.mode) ? original.mode : "due";
  state.activeGroup = original.activeGroup || "all";
  setActiveId(original.activeId || null);
  chooseActiveWord(false);
  if (options.immediate) {
    mobileFocusController?.close?.();
    render();
  } else {
    window.setTimeout(() => {
      mobileFocusController?.close?.();
      render();
      showToast(`${report.label}结束：完成 ${report.completed} 个，错 ${report.wrong} 个`);
      notifyMemoryLab();
    }, 260);
  }
  return report;
}

function tickQuickSession() {
  const session = state.quickSession;
  if (!session?.active || session.ending || !session.endsAt) return;
  if (Date.now() >= Date.parse(session.endsAt)) {
    session.ending = true;
    finishQuickSession("timeout");
  }
}

function updateQuickSessionAfterRating(word, result) {
  const session = state.quickSession;
  if (!session?.active || session.ending || !word?.id) return;
  const index = session.queueIds.indexOf(word.id);
  if (index >= 0) session.queueIds.splice(index, 1);
  const correct = result === "remember" || result === "new";
  if (correct) session.correct += 1;
  else session.wrong += 1;
  session.results.push({ wordId: word.id, result, correct, time: new Date().toISOString() });

  if (session.type === "today-errors") {
    const streak = correct ? (Number(session.streaks[word.id]) || 0) + 1 : 0;
    session.streaks[word.id] = streak;
    if (streak < 2) {
      const gap = correct ? 5 : 3;
      session.queueIds.splice(Math.min(gap, session.queueIds.length), 0, word.id);
    } else {
      session.completed += 1;
    }
  } else {
    session.completed += 1;
  }

  if (!session.queueIds.length || (session.endsAt && Date.now() >= Date.parse(session.endsAt))) {
    session.ending = true;
    finishQuickSession(session.queueIds.length ? "timeout" : "completed");
    return;
  }
  setActiveId(session.queueIds[0]);
  window.setTimeout(() => mobileFocusController?.setMode?.(quickSessionQuestionMode()), 0);
  notifyMemoryLab();
}

function miniRecapCandidates() {
  const ids = memoryLabStore.flow.recentIds || [];
  return ids.map((id) => state.words.find((word) => word.id === id)).filter(Boolean)
    .sort((a, b) => {
      const aa = wordAbilitySummary(a);
      const bb = wordAbilitySummary(b);
      const aScore = (100 - Math.min(aa.recognition.score || 0, aa.spelling.score || 0)) + weakScore(a);
      const bScore = (100 - Math.min(bb.recognition.score || 0, bb.spelling.score || 0)) + weakScore(b);
      return bScore - aScore;
    }).slice(0, 3);
}

function trackMiniRecap(word, result) {
  if (!word?.id || state.quickSession.active || !memoryLabStore.flow.autoMiniRecap) return;
  if (!["new", "remember", "fuzzy", "forgot"].includes(result)) return;
  memoryLabStore.flow.recentIds = [...(memoryLabStore.flow.recentIds || []).filter((id) => id !== word.id), word.id].slice(-10);
  memoryLabStore.flow.completedSinceRecap = (Number(memoryLabStore.flow.completedSinceRecap) || 0) + 1;
  if (memoryLabStore.flow.completedSinceRecap < 10) {
    saveMemoryLabStore();
    return;
  }
  const words = miniRecapCandidates();
  memoryLabStore.flow.completedSinceRecap = 0;
  saveMemoryLabStore();
  if (words.length < 3) return;
  window.setTimeout(() => startQuickSession({
    type: "mini-recap",
    label: "每10词小复盘",
    ids: words.map((item) => item.id),
    questionModes: ["choice", "spelling", "choice"],
  }), 420);
}

function todayWrongWordIds() {
  const today = todayKey();
  const wrongResults = new Set(["forgot", "fuzzy", "spell-wrong", "forms-wrong", "dictation-wrong", "choice-wrong", "pos-wrong", "noun-wrong", "verb-wrong", "family-wrong", "context-wrong"]);
  return state.words.filter((word) => {
    const records = [];
    Object.values(word.progress || {}).forEach((progress) => { if (Array.isArray(progress?.history)) records.push(...progress.history); });
    if (Array.isArray(word.history)) records.push(...word.history);
    return records.some((entry) => wrongResults.has(entry.result) && entry.time && todayKey(new Date(entry.time)) === today);
  }).sort((a, b) => weakScore(b) - weakScore(a)).map((word) => word.id);
}

function scheduleNext(word, result, options = {}) {
  const progress = modeProgress(word);
  const completedAt = options.completedAt || nowDate();
  let nextStep = 0;
  let delay = REVIEW_STEPS[0].ms;
  let label = REVIEW_STEPS[0].label;

  if (result === "new" || result === "remember") {
    nextStep = Math.min(progress.stage + 1, REVIEW_STEPS.length - 1);
    if (progress.stage < 0) {
      nextStep = 0;
    }
    delay = REVIEW_STEPS[nextStep].ms;
    label = REVIEW_STEPS[nextStep].label;
  }

  if (result === "fuzzy") {
    nextStep = Math.max(0, progress.stage);
    delay = 8 * 60 * 1000;
    label = "8分钟";
    word.important = true;
  }

  if (result === "forgot") {
    nextStep = -1;
    delay = 2 * 60 * 1000;
    label = "2分钟";
    word.important = true;
  }

  const nextDate = new Date(completedAt.getTime() + delay);
  progress.stage = nextStep;
  progress.status = nextStep >= REVIEW_STEPS.length - 1 ? "mature" : "learning";
  progress.nextReviewAt = nextDate.toISOString();
  progress.lastStudiedAt = completedAt.toISOString();
  word.updatedAt = completedAt.toISOString();
  recordModeHistory(word, {
    time: completedAt.toISOString(),
    result,
    nextReviewAt: progress.nextReviewAt,
  });
  const ratingMeta = state.pendingRatingMeta && state.pendingRatingMeta.wordId === word.id ? state.pendingRatingMeta : null;
  state.pendingRatingMeta = null;
  recordRatingMetric(word, result, ratingMeta);
  updateQuickSessionAfterRating(word, result);
  trackMiniRecap(word, result);
  markDailyCompleted(word, completedAt);
  if (!options.silent) {
    showToast(`下次：${formatDateTime(progress.nextReviewAt)}（${label}后）`);
  }
}

function getQueue() {
  if (state.quickSession.active) {
    return state.quickSession.queueIds.map((id) => state.words.find((word) => word.id === id)).filter(Boolean);
  }
  const scopedWords = practiceEligibleWords(state.words.filter(wordMatchesActiveGroup));
  if (state.sprint.active) {
    return sprintQueue(scopedWords);
  }
  const sorted = getOrderedStudyWords(scopedWords);

  if (state.mode === "new") {
    return sorted.filter((word) => statusOf(word) === "new");
  }
  if (state.mode === "all") {
    return sorted;
  }
  if (state.mode === "weak") {
    return sorted.filter(isWeakWord).sort((a, b) => weakScore(b) - weakScore(a));
  }
  return sorted.filter((word) => isDue(word));
}

function sprintQueue(words = state.words.filter(wordMatchesActiveGroup)) {
  const rank = (word) => {
    if (isDue(word)) {
      return 0;
    }
    if (word.important) {
      return 1;
    }
    if (statusOf(word) === "new") {
      return 2;
    }
    return 3;
  };
  return [...words].sort((a, b) => {
    const rankDiff = rank(a) - rank(b);
    if (rankDiff) {
      return rankDiff;
    }
    const aTime = activeModeProgress(a).nextReviewAt || "9999-12-31";
    const bTime = activeModeProgress(b).nextReviewAt || "9999-12-31";
    return aTime.localeCompare(bTime) || a.term.localeCompare(b.term, "en", { sensitivity: "base" });
  });
}

function withCardPracticeMode(callback) {
  const previousMode = state.practiceMode;
  state.practiceMode = "card";
  ensurePracticeSession("card");
  try {
    return callback();
  } finally {
    state.practiceMode = previousMode;
  }
}

function mobileFocusQueue() {
  // 一屏一词就是普通卡片的另一种显示方式：严格使用当前卡片队列。
  // 当前模式没有到期词时直接显示完成，不再退回全词库从头开始。
  return withCardPracticeMode(() => getQueue());
}

function mobileFocusView(word) {
  return {
    term: word.term,
    phonetic: extractWordPhonetic(word),
    answer: word.meaning || "未填中文",
    example: word.phrase || word.note || "",
  };
}

function mobileFocusChoiceHash(seed = "") {
  let hash = 2166136261;
  for (const char of String(seed)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mobileFocusChoiceOptions(word) {
  const correct = normalizeText(word?.meaning || "未填中文") || "未填中文";
  const correctKey = correct.toLowerCase();
  const phraseLike = /\s/.test(normalizeText(word?.term));
  const targetPos = primaryTargetPos(word);
  const targetStem = wordFamilyStem(word);
  const targetGroups = new Set(wordGroupNames(word));
  const confusion = memoryLabStore.metrics[word?.id]?.confusedWith || {};
  const candidates = [];
  const seen = new Set([correctKey]);

  const collect = (items) => {
    items.forEach((item) => {
      if (!item || item.id === word.id) return;
      const meaning = normalizeText(item.meaning || "");
      const key = meaning.toLowerCase();
      if (!meaning || meaning === "未填中文" || seen.has(key)) return;
      seen.add(key);
      const sameShape = /\s/.test(normalizeText(item.term)) === phraseLike;
      const samePos = primaryTargetPos(item) === targetPos;
      const sameFamily = targetStem && wordFamilyStem(item) === targetStem;
      const sameGroup = wordGroupNames(item).some((group) => targetGroups.has(group));
      const confusedCount = Number(confusion[item.id]) || 0;
      const lengthGap = Math.abs(meaning.length - correct.length);
      const score = lengthGap
        + (sameShape ? 0 : 14)
        + (samePos ? 0 : 18)
        + (sameGroup ? 0 : 6)
        - (sameFamily ? 12 : 0)
        - Math.min(20, confusedCount * 5);
      candidates.push({
        id: item.id,
        meaning,
        score,
        rank: mobileFocusChoiceHash(`${word.id}|${item.id}|${meaning}`),
      });
    });
  };

  collect(state.words.filter(wordMatchesActiveGroup));
  if (candidates.length < 12) collect(state.words);

  const distractors = candidates
    .sort((a, b) => a.score - b.score || a.rank - b.rank)
    .slice(0, 3);

  const fallback = ["未掌握该词义", "与本词无关的释义", "暂无对应释义"];
  fallback.forEach((meaning) => {
    if (distractors.length < 3 && meaning.toLowerCase() !== correctKey && !distractors.some((item) => item.meaning === meaning)) {
      distractors.push({ id: "", meaning, score: 99, rank: mobileFocusChoiceHash(`${word.id}|fallback|${meaning}`) });
    }
  });

  return [{ id: word.id, meaning: correct }, ...distractors.slice(0, 3)]
    .map((item) => ({ ...item, rank: mobileFocusChoiceHash(`${word.id}|choice|${item.meaning}`) }))
    .sort((a, b) => a.rank - b.rank)
    .map((item) => ({ meaning: item.meaning, wordId: item.id }));
}

function applySharedCardRating(id, result, meta = {}) {
  const word = state.words.find((item) => item.id === id);
  if (!word || !["remember", "fuzzy", "forgot"].includes(result)) return;

  // 直接复用普通卡片的动作入口：同一 progress.card、同一 history、同一每日完成、同一云存档。
  if (state.practiceMode !== "card") switchPracticeMode("card");
  setActiveId(id);
  state.pendingRatingMeta = { wordId: id, ...meta };
  handleCardAction(result);
}

let mobileFocusController = null;

function initializeMobileFocus() {
  if (
    mobileFocusController
    || !els.mobileFocusEntry
    || !els.mobileFocusMode
    || typeof window.MobileFocus?.createController !== "function"
  ) return;

  const root = els.mobileFocusMode;
  mobileFocusController = window.MobileFocus.createController({
    elements: {
      entry: els.mobileFocusEntry,
      root,
      exit: root.querySelector("#mobileFocusExit"),
      card: root.querySelector("#mobileFocusCard"),
      audio: root.querySelector("#mobileFocusAudio"),
      previous: root.querySelector("#mobileFocusPrevious"),
      previousTerm: root.querySelector("#mobileFocusPreviousTerm"),
      previousMeaning: root.querySelector("#mobileFocusPreviousMeaning"),
      ratingButtons: Array.from(root.querySelectorAll("[data-mobile-focus-rate]")),
      count: root.querySelector("#mobileFocusCount"),
      progress: root.querySelector("#mobileFocusProgress"),
      progressFill: root.querySelector("#mobileFocusProgressFill"),
      term: root.querySelector("#mobileFocusTerm"),
      phonetic: root.querySelector("#mobileFocusPhonetic"),
      answer: root.querySelector("#mobileFocusAnswer"),
      meaning: root.querySelector("#mobileFocusMeaning"),
      detail: root.querySelector("#mobileFocusDetail"),
      source: root.querySelector("#mobileFocusSource"),
      title: root.querySelector("#mobileFocusTitle"),
      empty: root.querySelector("#mobileFocusEmpty"),
      actions: root.querySelector(".mobile-focus-actions"),
      modeButtons: Array.from(root.querySelectorAll("[data-mobile-focus-mode]")),
      kicker: root.querySelector("#mobileFocusKicker"),
      tip: root.querySelector("#mobileFocusTip"),
      spelling: root.querySelector("#mobileFocusSpelling"),
      spellingInput: root.querySelector("#mobileFocusSpellingInput"),
      spellingCheck: root.querySelector("#mobileFocusSpellingCheck"),
      spellingClear: root.querySelector("#mobileFocusSpellingClear"),
      spellingFeedback: root.querySelector("#mobileFocusSpellingFeedback"),
      choice: root.querySelector("#mobileFocusChoice"),
      choiceButtons: Array.from(root.querySelectorAll("[data-mobile-focus-choice]")),
      choiceFeedback: root.querySelector("#mobileFocusChoiceFeedback"),
    },
    queue: mobileFocusQueue,
    activeId: () => ensurePracticeSession("card").activeId || state.activeId,
    select: (id) => {
      if (!id) return;
      state.practiceMode = "card";
      setActiveId(id);
      saveWords();
    },
    getWord: (id) => state.words.find((word) => word.id === id),
    view: mobileFocusView,
    renderAnswer: (view, answerElements) => {
      if (answerElements.meaning) answerElements.meaning.textContent = view.answer || "未填释义";
      if (answerElements.detail) answerElements.detail.textContent = view.example || "";
    },
    speak: (word) => speakTerm(word.term, { accent: "us" }),
    rate: applySharedCardRating,
    checkSpelling: (input, word) => isSpellingCorrect(input, word),
    choiceOptions: mobileFocusChoiceOptions,
    source: () => state.quickSession.active
      ? `${state.quickSession.label || "快速复习"} · 与普通卡片共用进度`
      : (state.activeGroup === "all" ? "全部词库 · 与当前卡片完全同进度" : `${state.activeGroup} · 与当前卡片完全同进度`),
    title: () => state.quickSession.active ? (state.quickSession.label || "快速复习") : "一屏一词",
  });
}

function stableRandomRank(word) {
  const seed = `${todayKey()}-${word.id || word.term}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function getOrderedStudyWords(words, order = state.dictationOrder) {
  const sortedByDue = [...words].sort((a, b) => {
    const ad = activeModeProgress(a).nextReviewAt || "9999-12-31";
    const bd = activeModeProgress(b).nextReviewAt || "9999-12-31";
    return ad.localeCompare(bd);
  });

  if (!["dictation", "dictationWeak"].includes(state.practiceMode)) {
    return sortedByDue.sort((a, b) => {
      const pa = priorityOf(a) === "A" ? 0 : (priorityOf(a) === "B" ? 1 : 2);
      const pb = priorityOf(b) === "A" ? 0 : (priorityOf(b) === "B" ? 1 : 2);
      return (Number(b.important) - Number(a.important)) || pa - pb || ((activeModeProgress(a).nextReviewAt || "9999-12-31").localeCompare(activeModeProgress(b).nextReviewAt || "9999-12-31"));
    });
  }

  switch (order) {
    case "important":
      return sortedByDue.sort((a, b) => Number(b.important) - Number(a.important));
    case "random":
      return sortedByDue.sort((a, b) => stableRandomRank(a) - stableRandomRank(b));
    case "az":
      return sortedByDue.sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));
    case "due":
    default:
      return sortedByDue.sort((a, b) => {
        const dueDiff = Number(isDue(b)) - Number(isDue(a));
        if (dueDiff) {
          return dueDiff;
        }
        const aTime = activeModeProgress(a).nextReviewAt || "9999-12-31";
        const bTime = activeModeProgress(b).nextReviewAt || "9999-12-31";
        return aTime.localeCompare(bTime);
      });
  }
}

function chooseActiveWord(forceFirst = false) {
  const queue = getQueue();
  if (!queue.length) {
    setActiveId(null);
    state.answerVisible = false;
    return;
  }
  const activeStillValid = queue.some((word) => word.id === state.activeId);
  if (forceFirst || !activeStillValid) {
    setActiveId(queue[0].id);
    state.answerVisible = false;
    resetTypingState();
    state.lastAutoSpokenId = null;
  }
}

function activeWord() {
  return state.words.find((word) => word.id === state.activeId) || null;
}

function render() {
  renderCloudAccessState();
  chooseActiveWord();
  renderStats();
  renderDashboard();
  renderDailyReport();
  renderClock();
  renderSprintStatus();
  updateGazeButton();
  renderModeButtons();
  renderPracticeButtons();
  renderDictationTools();
  renderLibrarySourceFilters();
  renderActiveCard();
  renderTimeline();
  renderGroupProgress();
  renderWordList();
}

function cancelBackgroundRender() {
  if (backgroundRenderHandle == null) return;
  if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(backgroundRenderHandle);
  else window.clearTimeout(backgroundRenderHandle);
  backgroundRenderHandle = null;
}

function scheduleBackgroundRender() {
  cancelBackgroundRender();
  const run = () => {
    backgroundRenderHandle = null;
    renderStats();
    renderDashboard();
    renderDailyReport();
    renderClock();
    renderSprintStatus();
    renderTimeline();
    renderGroupProgress();
    renderWordList();
  };
  // 等用户停顿后再刷新统计和长列表；连续按键时会反复取消，不抢当前卡片响应。
  backgroundRenderHandle = window.setTimeout(() => {
    backgroundRenderHandle = null;
    if (typeof window.requestIdleCallback === "function") {
      backgroundRenderHandle = window.requestIdleCallback(run, { timeout: 900 });
    } else {
      run();
    }
  }, 520);
}

function renderStudyTransition() {
  chooseActiveWord();
  renderActiveCard();
  renderModeButtons();
  renderPracticeButtons();
  renderDictationTools();
  scheduleBackgroundRender();
}

function focusTypingInputSoon() {
  window.requestAnimationFrame(() => {
    const input = els.activeCard?.querySelector?.("[data-spell-input], [data-form-input]");
    if (input && document.contains(input)) {
      try {
        input.focus({ preventScroll: true });
        const length = input.value?.length || 0;
        input.setSelectionRange?.(length, length);
      } catch {
        input.focus?.();
      }
    }
  });
}

function isPhraseWord(word) {
  const term = normalizeText(word?.term);
  const note = normalizeText(word?.note);
  const tag = normalizeText(word?.tag);
  return /\s/.test(term) || /短语/.test(note) || /短语/.test(tag);
}

function todayOperationEntries() {
  const today = todayKey();
  const acceptedResults = new Set(["new", "remember", "fuzzy", "forgot"]);
  return state.words.flatMap((word) => {
    const records = [];
    if (Array.isArray(word.history)) records.push(...word.history);
    Object.values(word.progress || {}).forEach((progress) => {
      if (Array.isArray(progress?.history)) records.push(...progress.history);
    });
    const seen = new Set();
    return records.filter((entry) => {
      if (!entry || !acceptedResults.has(entry.result) || !entry.time) return false;
      if (todayKey(new Date(entry.time)) !== today) return false;
      const key = [entry.time, entry.result, entry.mode || "card", entry.nextReviewAt || ""].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((entry) => ({ ...entry, word }));
  });
}

function hasEverLearned(word) {
  const progress = modeProgress(word, "card");
  const progressHistory = Array.isArray(progress.history) ? progress.history : [];
  const legacyHistory = Array.isArray(word.history) ? word.history : [];
  const legacyStage = Number.isInteger(word.stage) ? word.stage : -1;
  const mastery = normalizeText(word.mastery || "未学");

  return progress.stage >= 0
    || legacyStage >= 0
    || (progress.status && progress.status !== "new")
    || (word.status && word.status !== "new")
    || Boolean(progress.lastStudiedAt || word.lastStudiedAt)
    || progressHistory.length > 0
    || legacyHistory.length > 0
    || (mastery && mastery !== "未学");
}

function renderStats() {
  // “已完成”按当天完成过的不同词条统计，并写入本机备份与云端压缩存档。
  // 同一云同步编号在手机和电脑加载后，会合并当天已完成词条，不会因换设备清零。
  syncTodayCompletedFromHistories();
  const completedToday = dailyCompletedCounts();

  // “已学习”是累计值：直接根据每个词条的真实卡片进度计算，跨天、刷新和重新打开都不会归零。
  const learnedItems = state.words.filter(hasEverLearned);
  const learnedWords = learnedItems.filter((word) => !isPhraseWord(word)).length;
  const learnedPhrases = learnedItems.filter((word) => isPhraseWord(word)).length;

  els.totalCount.textContent = state.words.length;
  els.dueCount.textContent = state.words.filter((word) => isDue(word)).length;
  els.todayCount.textContent = completedToday.total;
  els.doneTodayCount.textContent = learnedItems.length;
  if (els.todayWordActionCount) els.todayWordActionCount.textContent = learnedWords;
  if (els.todayPhraseActionCount) els.todayPhraseActionCount.textContent = learnedPhrases;
  renderStudyTime();
}

function renderClock() {
  els.clockNow.textContent = nowDate().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(ms) {
  const safeMs = Math.max(0, ms);
  const minutes = Math.floor(safeMs / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function endSprint() {
  if (!state.sprint.active) {
    return;
  }
  state.sprint.active = false;
  state.sprint.endsAt = "";
  state.sprint.startedAt = "";
  showToast(`15分钟冲刺结束，完成 ${state.sprint.completed} 个`);
}

function renderSprintStatus() {
  if (!els.sprintStatus) {
    return;
  }
  if (!state.sprint.active) {
    els.sprintStatus.textContent = "15分钟未开始";
    els.sprintStatus.classList.remove("active");
    return;
  }
  const remaining = new Date(state.sprint.endsAt) - nowDate();
  if (remaining <= 0) {
    endSprint();
    els.sprintStatus.textContent = `本轮完成 ${state.sprint.completed} 个`;
    els.sprintStatus.classList.remove("active");
    return;
  }
  els.sprintStatus.classList.add("active");
  els.sprintStatus.textContent = `冲刺 ${formatDuration(remaining)} · ${state.sprint.completed} 个`;
}

function todayHistoryEntries(mode = state.practiceMode) {
  const today = todayKey();
  return state.words.flatMap((word) => modeProgress(word, mode).history
    .filter((entry) => todayKey(new Date(entry.time)) === today)
    .map((entry) => ({ ...entry, word })));
}

function dailyReportStats() {
  const entries = todayHistoryEntries();
  const studiedWords = new Set(entries.map((entry) => entry.word.id));
  const reviewEntries = entries.filter((entry) => ["new", "remember", "fuzzy", "forgot"].includes(entry.result));
  const spellingEntries = entries.filter((entry) => ["spell-correct", "spell-wrong", "forms-correct", "forms-wrong"].includes(entry.result));
  const spellingCorrect = spellingEntries.filter((entry) => ["spell-correct", "forms-correct"].includes(entry.result)).length;
  const forgotten = entries.filter((entry) => ["forgot", "spell-wrong", "forms-wrong", "dictation-wrong", "choice-wrong"].includes(entry.result)).length;
  const importantNow = state.words.filter((word) => word.important).length;
  const nextReview = state.words
    .map((word) => modeProgress(word))
    .filter((progress) => progress.nextReviewAt)
    .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt))[0]?.nextReviewAt || "";
  syncStudyTimeDay();
  return {
    studied: studiedWords.size,
    reviews: reviewEntries.length,
    spellingTotal: spellingEntries.length,
    spellingCorrect,
    spellingRate: spellingEntries.length ? Math.round((spellingCorrect / spellingEntries.length) * 100) : 0,
    forgotten,
    importantNow,
    nextReview,
    todayStudyTime: state.studyTime?.todaySeconds || 0,
    totalStudyTime: state.studyTime?.totalSeconds || 0,
  };
}

function renderDailyReport() {
  if (!els.dailyReport) {
    return;
  }
  const report = dailyReportStats();
  els.dailyReport.innerHTML = `
    <div class="panel-heading">
      <div>
        <p class="eyebrow">Report</p>
        <h2>今日战报</h2>
      </div>
      <span class="status-pill">${todayKey()}</span>
    </div>
    <div class="report-grid">
      <article><span>今日学习</span><strong>${report.studied}</strong><p>个词有记录</p></article>
      <article><span>今日时长</span><strong>${formatStudyTime(report.todayStudyTime)}</strong><p>总计 ${formatStudyTime(report.totalStudyTime)}</p></article>
      <article><span>复习动作</span><strong>${report.reviews}</strong><p>记完/会了/模糊/忘了</p></article>
      <article><span>拼写正确率</span><strong>${report.spellingTotal ? `${report.spellingRate}%` : "--"}</strong><p>${report.spellingCorrect}/${report.spellingTotal}</p></article>
      <article><span>忘记/拼错</span><strong>${report.forgotten}</strong><p>自动进入重点复盘</p></article>
      <article><span>重点词</span><strong>${report.importantNow}</strong><p>当前重点词本</p></article>
      <article><span>下次提醒</span><strong>${report.nextReview ? formatDateTime(report.nextReview) : "--"}</strong><p>按间隔复习生成</p></article>
    </div>`;
}

function renderModeButtons() {
  [
    [els.dueModeButton, "due"],
    [els.newModeButton, "new"],
    [els.allModeButton, "all"],
    [els.weakOnlyButton, "weak"],
  ].forEach(([button, mode]) => button?.classList.toggle("active", state.mode === mode));
}

function renderPracticeButtons() {
  document.querySelectorAll("[data-practice-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.practiceMode === state.practiceMode);
  });
}

function renderDictationTools() {
  if (!els.dictationOrderSelect) {
    return;
  }
  if (els.dictationOrderSelect.value !== state.dictationOrder) {
    els.dictationOrderSelect.value = state.dictationOrder;
  }
  const visible = ["dictation", "dictationWeak"].includes(state.practiceMode);
  els.dictationOrderSelect.closest(".dictation-tools")?.classList.toggle("is-visible", visible);
}

function renderDashboard() {
  const newCount = state.words.filter((word) => statusOf(word) === "new").length;
  const dueNow = state.words.filter((word) => isDue(word)).length;
  const todayReview = state.words.filter(isTodayReview).length;
  const important = state.words.filter((word) => word.important).length;
  const importantDue = state.words.filter((word) => word.important && (isDue(word) || statusOf(word) === "new")).length;
  const newTarget = Math.min(30, newCount);
  const reviewTarget = Math.max(dueNow, todayReview);
  const estimate = Math.max(0, Math.ceil(newTarget * 0.8 + reviewTarget * 0.45 + importantDue * 0.35));
  const examDate = new Date(`${state.settings.examDate}T00:00:00`);
  const today = new Date(`${todayKey()}T00:00:00`);
  const dayDiff = Math.ceil((examDate - today) / (24 * 60 * 60 * 1000));

  els.examDays.textContent = Number.isFinite(dayDiff) ? Math.max(0, dayDiff) : "--";
  if (els.examDateInput.value !== state.settings.examDate) {
    els.examDateInput.value = state.settings.examDate;
  }
  els.todayNewTarget.textContent = newTarget;
  els.todayReviewTarget.textContent = reviewTarget;
  els.importantCount.textContent = important;
  els.estimateMinutes.textContent = estimate;
  els.todayNewHint.textContent = newCount ? `还剩 ${newCount} 个新词，建议今天先拿下 ${newTarget} 个` : "新词清空了，今天专心复习";
  els.todayReviewHint.textContent = reviewTarget ? `现在到期 ${dueNow} 个，今日已排 ${todayReview} 个` : "暂无到期复习，等系统提醒";
  if (els.mobileFocusEntryHint) {
    const focusCount = mobileFocusQueue().length;
    els.mobileFocusEntryHint.textContent = focusCount
      ? `当前卡片队列 ${focusCount} 词；手机电脑恢复后停在同一进度`
      : "当前分组暂无待背词；本模式与普通卡片共用存档";
  }
}

function progressRootName(groupName = "") {
  const name = normalizeText(groupName);
  if (/^全方位/.test(name)) return "全方位";
  if (/^蓝色森林/.test(name)) return "蓝色森林";
  if (/^Word List/.test(name)) return "Word List";
  if (/^四级/.test(name)) return "四级";
  if (/^短语练习/.test(name)) return "短语练习";
  if (/^第[一二三四]次听写内容$|^听写内容/.test(name)) return "听写内容";
  return "其他";
}

let progressGroupFilter = "全部";

function renderGroupProgress() {
  const groups = new Map();
  state.words.forEach((word) => {
    wordGroupNames(word).forEach((name) => {
      if (!groups.has(name)) groups.set(name, []);
      if (!groups.get(name).some((item) => item.id === word.id)) groups.get(name).push(word);
    });
  });

  if (!groups.size) {
    els.groupProgress.innerHTML = `<div class="group-card"><strong>暂无分组</strong><p>导入 Word List 后会显示进度</p></div>`;
    return;
  }

  const modeName = PROGRESS_MODE_LABELS[state.practiceMode] || "当前模式";
  const rootNames = ["全部", ...Array.from(new Set([...groups.keys()].map(progressRootName))).filter(Boolean)];
  if (!rootNames.includes(progressGroupFilter)) progressGroupFilter = "全部";
  const shownEntries = [...groups.entries()].filter(([name]) => progressGroupFilter === "全部" || progressRootName(name) === progressGroupFilter);
  const shownWordsRaw = progressGroupFilter === "全部" ? state.words : shownEntries.flatMap(([, words]) => words);
  const shownWords = [...new Map(shownWordsRaw.map((word) => [word.id, word])).values()];
  const learnedAll = shownWords.filter((word) => modeProgress(word).stage >= 0).length;
  const matureAll = shownWords.filter((word) => statusOf(word) === "mature").length;
  const dueAll = shownWords.filter((word) => isDue(word)).length;
  const importantAll = shownWords.filter((word) => word.important).length;
  const allPercent = shownWords.length ? Math.round((learnedAll / shownWords.length) * 100) : 0;

  const tabs = `<div class="progress-folder-tabs">${rootNames.map((name) => `<button class="progress-folder-tab ${name === progressGroupFilter ? "active" : ""}" data-progress-filter="${escapeHTML(name)}" type="button">${escapeHTML(name)}</button>`).join("")}</div>`;
  const allGroupName = progressGroupFilter === "全部" ? "all" : `__root__${progressGroupFilter}`;
  const allCard = `
      <article class="group-card progress-summary-card${state.activeGroup === allGroupName ? " active" : ""}" data-group-action="study" data-group="${escapeHTML(allGroupName)}" data-root-group="${escapeHTML(progressGroupFilter)}">
        <strong>${escapeHTML(progressGroupFilter === "全部" ? "全部词库" : progressGroupFilter + " 总进度")}</strong>
        <div class="progress-bar"><div class="progress-fill" style="width:${allPercent}%"></div></div>
        <p>${learnedAll}/${shownWords.length} 已学 · 到期 ${dueAll} · 重点 ${importantAll} · 稳定 ${matureAll}</p>
        <button class="text-button" type="button">只背这一大类</button>
      </article>`;

  const cards = shownEntries.map(([name, words]) => {
    const learned = words.filter((word) => modeProgress(word).stage >= 0).length;
    const mature = words.filter((word) => statusOf(word) === "mature").length;
    const due = words.filter((word) => isDue(word)).length;
    const important = words.filter((word) => word.important).length;
    const percent = Math.round((learned / words.length) * 100);
    return `
      <article class="group-card${state.activeGroup === name ? " active" : ""}" data-group-action="study" data-group="${escapeHTML(name)}">
        <strong>${escapeHTML(name)}</strong>
        <div class="progress-bar"><div class="progress-fill" style="width:${percent}%"></div></div>
        <p>${learned}/${words.length} 已学 · 到期 ${due} · 重点 ${important} · 稳定 ${mature}</p>
        <button class="text-button" type="button">只背本组</button>
      </article>`;
  }).join("");

  els.groupProgress.innerHTML = tabs + allCard + cards;
}

function activateModuleFromApp(name = "study") {
  const titleMap = { folder: "英语资料夹", study: "记忆训练", smart: "构词归类", progress: "学习进度", manage: "管理词库" };
  const target = titleMap[name] ? name : "study";
  document.querySelectorAll("[data-module-target]").forEach((button) => {
    button.classList.toggle("active", button.dataset.moduleTarget === target);
  });
  document.querySelectorAll("[data-module-section]").forEach((section) => {
    section.classList.toggle("active", section.dataset.moduleSection === target);
  });
  const main = document.querySelector(".workspace");
  if (main) main.dataset.activeModule = target;
  try {
    history.replaceState(null, "", `#${target}`);
  } catch {
    // hash update is cosmetic; training still works without it.
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}


const MASTERY_LEVELS = ["未学", "认识", "熟悉", "掌握", "稳定"];

function masteryIndex(level) {
  const index = MASTERY_LEVELS.indexOf(normalizeText(level));
  return index >= 0 ? index : 0;
}

function masteryClass(level) {
  return `mastery-${masteryIndex(level)}`;
}

function setMastery(word, level) {
  if (!MASTERY_LEVELS.includes(level)) {
    return;
  }
  word.mastery = level;
  if (level === "稳定") {
    word.status = "mature";
  }
  word.updatedAt = new Date().toISOString();
  saveWords();
  render();
  showToast(`已设为：${level}`);
}

function choiceOptionsFor(word) {
  const seed = normalizeText(word.term).split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const candidates = state.words
    .filter((item) => item.id !== word.id && normalizeText(item.term))
    .map((item, index) => ({ item, score: Math.abs((index * 37 + seed) % 997) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((entry) => entry.item);
  const options = [word, ...candidates].slice(0, 4);
  return options
    .map((item, index) => ({ item, sortKey: (seed + index * 113) % 389 }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((entry) => entry.item);
}

function answerChoice(word, selectedTerm) {
  const correct = normalizeSpelling(selectedTerm) === normalizeSpelling(word.term);
  state.choiceResult = { selectedTerm, correct };
  state.answerVisible = true;
  const completedAt = new Date();
  if (!correct) {
    word.important = true;
    word.errorReason = word.errorReason || "忘记中文";
  }
  recordMemoryMetric(word, "recognition", correct);
  state.pendingRatingMeta = { wordId: word.id, skipMetric: true, mode: "choice" };
  recordModeHistory(word, {
    time: completedAt.toISOString(),
    result: correct ? "choice-correct" : "choice-wrong",
    nextReviewAt: modeProgress(word).nextReviewAt || "",
  }, "choiceZhToEn");
  if (correct) {
    rememberReviewUndo(word, "remember");
    scheduleNext(word, modeProgress(word, "choiceZhToEn").stage < 0 ? "new" : "remember", { completedAt, silent: true });
  }
  word.updatedAt = completedAt.toISOString();
  saveWords();
  renderActiveCard();
  showToast(correct ? "选对了，自动进入下一个" : "已加入重点词");
  if (correct) {
    window.setTimeout(() => {
      if (state.choiceResult?.correct) {
        state.answerVisible = false;
        resetTypingState();
        chooseActiveWord(true);
        render();
      }
    }, 550);
  }
}

function practiceView(word) {
  const safeMeaning = word.meaning || "未填中文";
  const safeTerm = word.term || "未命名";
  const phrase = word.phrase || "";

  if (GRAMMAR_PRACTICE_MODES.has(state.practiceMode)) {
    return {
      prompt: PROGRESS_MODE_LABELS[state.practiceMode] || "语法训练",
      target: safeTerm,
      hidden: "先完成当前判断",
      answer: safeMeaning,
      extra: "各训练模式独立记录进度",
    };
  }

  if (state.practiceMode === "threeStep") {
    return {
      prompt: "三步背诵",
      target: safeTerm,
      hidden: "先看英文，再点开中文和例句",
      answer: safeMeaning,
      extra: phrase ? `例句 / 搭配：${phrase}` : (word.note ? `备注：${word.note}` : ""),
    };
  }

  if (state.practiceMode === "choiceZhToEn") {
    return {
      prompt: "中文选英文",
      target: safeMeaning,
      hidden: "先选答案，再查看结果",
      answer: safeTerm,
      extra: phrase ? `搭配：${phrase}` : "",
    };
  }

  if (state.practiceMode === "multiMeaning") {
    return {
      prompt: "一词多义专项",
      target: safeTerm,
      hidden: "多义词释义已盖住",
      answer: safeMeaning,
      extra: phrase ? `常见搭配：${phrase}` : "重点看不同语境下的意思",
    };
  }

  if (state.practiceMode === "rareMeaning") {
    return {
      prompt: "熟词僻义专项",
      target: safeTerm,
      hidden: "考试义 / 僻义已盖住",
      answer: safeMeaning,
      extra: word.note ? `备注：${word.note}` : (phrase ? `搭配：${phrase}` : "不要只记最常见意思"),
    };
  }

  if (state.practiceMode === "fixedPhrase") {
    return {
      prompt: "固定搭配速记",
      target: phrase || safeTerm,
      hidden: "搭配含义已盖住",
      answer: phrase ? `${safeTerm}：${safeMeaning}` : safeMeaning,
      extra: phrase ? `固定搭配：${phrase}` : "暂无搭配，建议后续补充",
    };
  }

  if (state.practiceMode === "spellingWeak") {
    return {
      prompt: "拼写易错专项",
      target: safeMeaning,
      hidden: "英文已盖住",
      answer: safeTerm,
      extra: phrase ? `搭配：${phrase}` : "只刷拼错、模糊、重点里的拼写弱项",
    };
  }

  if (state.practiceMode === "dictationWeak") {
    return {
      prompt: "听写错词本",
      target: "先听读音，再把易错词拼出来",
      hidden: "答案已盖住",
      answer: safeTerm,
      extra: state.answerVisible ? safeMeaning : "",
    };
  }

  if (state.practiceMode === "forms") {
    return {
      prompt: "动词变形拼写",
      target: safeTerm,
      hidden: "三单 / 过去式 / 过去分词已盖住",
      answer: verbFormsAnswerText(word),
      extra: safeMeaning,
    };
  }

  if (state.practiceMode === "spell") {
    const pattern = new RegExp(escapeRegExp(safeTerm), "ig");
    const hintPhrase = phrase && pattern.test(phrase) ? phrase.replace(pattern, "____") : phrase;
    return {
      prompt: "看提示，拼出英文",
      target: safeMeaning,
      hidden: "输入英文后检查",
      answer: safeTerm,
      extra: hintPhrase ? `搭配提示：${hintPhrase}` : "",
    };
  }

  if (state.practiceMode === "dictation") {
    return {
      prompt: "听读音，拼写英文",
      target: "先听读音，再把单词或短语拼出来",
      hidden: "答案已盖住",
      answer: safeTerm,
      extra: state.answerVisible ? safeMeaning : "",
    };
  }

  if (state.practiceMode === "zhToEn") {
    return {
      prompt: "看中文，拼出英文",
      target: safeMeaning,
      hidden: "英文已盖住",
      answer: safeTerm,
      extra: phrase ? `搭配：${phrase}` : "",
    };
  }

  if (state.practiceMode === "phrase") {
    const pattern = new RegExp(escapeRegExp(safeTerm), "i");
    const blanked = phrase && pattern.test(phrase) ? phrase.replace(pattern, "____") : (phrase || safeMeaning);
    return {
      prompt: "搭配填空",
      target: blanked,
      hidden: "答案已盖住",
      answer: safeTerm,
      extra: safeMeaning,
    };
  }

  if (state.practiceMode === "enToZh") {
    return {
      prompt: "看英文，说中文",
      target: safeTerm,
      hidden: "中文已盖住",
      answer: safeMeaning,
      extra: phrase ? `搭配：${phrase}` : "",
    };
  }

  return {
    prompt: "卡片记忆",
    target: safeTerm,
    hidden: "释义已盖住",
    answer: safeMeaning,
    extra: phrase ? `搭配：${phrase}` : "",
  };
}

function renderVerbFormsBox(word) {
  if (state.practiceMode !== "forms") {
    return "";
  }
  const forms = verbForms(word);
  const drafts = state.formDrafts;
  const result = state.formResult;
  const answer = result ? `
    <div class="forms-summary ${result.correct ? "is-correct" : "is-wrong"}">
      ${result.correct ? "三个变形都拼对了" : `正确答案：${escapeHTML(verbFormsAnswerText(word))}`}
    </div>` : "";
  return `
    <div class="spell-box verb-forms-box">
      <div class="form-result-grid">
        <label>
          <span>三单</span>
          <input data-form-input="third" type="text" value="${escapeHTML(drafts.third)}" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="请输入三单">
        </label>
        <label>
          <span>过去式</span>
          <input data-form-input="past" type="text" value="${escapeHTML(drafts.past)}" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="请输入过去式">
        </label>
        <label>
          <span>过去分词</span>
          <input data-form-input="participle" type="text" value="${escapeHTML(drafts.participle)}" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="请输入过去分词">
        </label>
      </div>
      <div class="spell-actions">
        <button class="primary-button" data-card-action="check-forms" type="button">检查变形</button>
        <button class="secondary-button" data-card-action="clear-spelling" type="button">重写</button>
        <button class="secondary-button audio-button" data-card-action="speak" type="button">播放原词</button>
      </div>
      <p>三个都填对才算通过；不规则词可以在添加单词时手动填准。</p>
      ${answer}
    </div>`;
}

function renderSpellingBox(word) {
  if (!["spell", "dictation", "spellingWeak", "dictationWeak"].includes(state.practiceMode)) {
    return "";
  }
  const result = state.spellingResult;
  const value = escapeHTML(state.spellingDraft);
  const feedback = result ? `
    <div class="spell-feedback ${result.correct ? "is-correct" : "is-wrong"}">
      ${result.correct ? "拼对了，再按一次 Enter 直接记住" : `拼错了，正确答案：${escapeHTML(word.term)}；再按一次 Enter 记为忘了`}
    </div>` : "";
  const isDictationMode = ["dictation", "dictationWeak"].includes(state.practiceMode);
  const hint = isDictationMode
    ? "听不清可以点“播放读音”，不会就点显示答案。"
    : "第一次 Enter 检查；拼对后再按 Enter 直接记住，拼错后再按 Enter 记为忘了。";
  return `
    <div class="spell-box">
      <label>
        <span>${["dictation", "dictationWeak"].includes(state.practiceMode) ? "听写输入" : "拼写输入"}</span>
        <input data-spell-input type="text" value="${value}" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="在这里输入英文">
      </label>
      <div class="spell-actions">
        <button class="primary-button" data-card-action="check-spelling" type="button">检查拼写</button>
        <button class="secondary-button" data-card-action="clear-spelling" type="button">重写</button>
        <button class="secondary-button audio-button" data-card-action="speak" type="button">播放读音</button>
      </div>
      <p>${hint}</p>
      ${feedback}
    </div>`;
}


function renderThreeStepBox(word, view) {
  const step = Number(state.revealStep || 0);
  const meaning = step >= 1 ? `<div class="three-step-reveal"><b>中文释义</b><p>${escapeHTML(view.answer)}</p></div>` : `<div class="answer-mask">第2步：中文已盖住</div>`;
  const examples = step >= 2 ? `<div class="three-step-reveal"><b>例句 / 搭配 / 备注</b><p>${escapeHTML(view.extra || word.note || "暂无例句，后续可继续补")}</p></div>` : `<div class="answer-mask">第3步：例句和备注已盖住</div>`;
  return `
    <div class="three-step-box">
      <div class="three-step-head"><span class="step-dot active">1</span><span class="step-dot ${step >= 1 ? "active" : ""}">2</span><span class="step-dot ${step >= 2 ? "active" : ""}">3</span></div>
      ${meaning}
      ${examples}
      <div class="spell-actions">
        <button class="primary-button" data-card-action="next-reveal" type="button">${step < 1 ? "显示中文" : (step < 2 ? "显示例句" : "已全部显示")}</button>
        <button class="secondary-button" data-card-action="reset-reveal" type="button">重新盖住</button>
      </div>
    </div>`;
}

function renderChoiceBox(word) {
  const options = choiceOptionsFor(word);
  const result = state.choiceResult;
  return `
    <div class="choice-box">
      <p class="choice-tip">根据中文释义选出正确英文。</p>
      <div class="choice-grid">
        ${options.map((option, index) => {
          const selected = result && normalizeSpelling(result.selectedTerm) === normalizeSpelling(option.term);
          const correct = normalizeSpelling(option.term) === normalizeSpelling(word.term);
          const klass = result ? (correct ? "is-correct" : (selected ? "is-wrong" : "")) : "";
          return `<button class="choice-option ${klass}" data-card-action="choice:${encodeURIComponent(option.term)}" type="button"><span>${String.fromCharCode(65 + index)}.</span>${escapeHTML(option.term)}</button>`;
        }).join("")}
      </div>
      ${result ? `<div class="choice-result ${result.correct ? "is-correct" : "is-wrong"}">${result.correct ? "选对了" : `选错了，正确答案：${escapeHTML(word.term)}`}</div>` : ""}
    </div>`;
}

function posOptionClass(result, option, correctValue) {
  if (!result) return "";
  if (option === correctValue) return "is-correct";
  if (option === result.selected) return "is-wrong";
  return "";
}

function grammarChoiceButtons(labels, actionPrefix, correctValue, result, columns = "") {
  return Object.entries(labels).map(([value, label]) => {
    const klass = posOptionClass(result, value, correctValue);
    const disabled = result ? "disabled" : "";
    return `<button class="pos-choice-button ${columns} ${klass}" data-card-action="${actionPrefix}:${value}" type="button" ${disabled}>${label}</button>`;
  }).join("");
}

function grammarResultHTML(result, correctLabel, word) {
  if (!result || result.step !== "done") return "";
  const hint = result.correct ? "" : `<small>${escapeHTML(suffixHint(word))}</small>`;
  return result.correct
    ? `<div class="pos-result is-correct">回答正确：${escapeHTML(correctLabel || result.answerLabel || "")}</div>`
    : `<div class="pos-result is-wrong">回答错误，正确答案：${escapeHTML(correctLabel || result.answerLabel || "")}${hint}</div>`;
}


const CONTEXT_REVIEW_STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "these", "those", "have", "has", "had", "was", "were", "will", "would", "could", "should", "into", "onto", "than", "then", "when", "where", "what", "which", "while", "about", "after", "before", "during", "their", "there", "they", "them", "your", "you", "our", "ours", "his", "her", "hers", "its", "are", "is", "am", "been", "being", "can", "may", "might", "must", "not", "but", "because", "also", "very", "more", "most", "some", "any", "each", "every", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"
]);

function contextVocabularyReviewWords(word, sentence) {
  const target = normalizeText(word?.term || "").toLowerCase();
  const source = ` ${normalizeText(sentence).toLowerCase().replace(/[’‘`]/g, "'")} `;
  const matches = [];
  const seen = new Set();
  state.words.forEach((candidate) => {
    const term = normalizeText(candidate?.term || "").toLowerCase().replace(/[’‘`]/g, "'");
    if (!term || term === target || seen.has(term) || CONTEXT_REVIEW_STOP_WORDS.has(term)) return;
    if (term.length < 3 && !term.includes(" ")) return;
    const escaped = escapeRegExp(term).replace(/\\\s+/g, "\\s+");
    if (!new RegExp(`(^|[^a-z0-9'’-])${escaped}(?=$|[^a-z0-9'’-])`, "i").test(source)) return;
    seen.add(term);
    const progress = modeProgress(candidate, "card");
    matches.push({
      term: candidate.term,
      meaning: meaningSegments(candidate.meaning || candidate.phrase || "")[0] || "",
      important: Boolean(candidate.important),
      learned: Number(progress.stage) >= 0,
      length: term.length,
    });
  });
  return matches
    .sort((a, b) => Number(b.important) - Number(a.important) || Number(b.learned) - Number(a.learned) || b.length - a.length)
    .slice(0, 5);
}

function currentContextView(word) {
  const presenter = window.WordContextPresenter;
  if (!presenter || typeof presenter.viewFor !== "function") return null;
  const answered = Boolean(state.answerVisible || state.posQuizResult);
  const policy = presenter.contextPolicy(state.practiceMode, answered, state.revealStep);
  const view = presenter.viewFor(word, {
    index: state.contextIndex,
    concealed: policy.concealed,
  });
  return view?.available ? { view, policy } : null;
}

function renderContextCard(word) {
  const current = currentContextView(word);
  if (!current) return "";
  const { view, policy } = current;
  const study = contextStudyEntry(word, view)?.value || {};
  const markLabel = study.marked ? "★ 已标记" : "☆ 标记句子";
  const reviewCount = Number(study.reviewCount) || 0;

  if (!state.contextExpanded || !policy.showSentence) {
    const locked = !policy.showSentence;
    return `
      <section class="memory-context-card is-collapsed ${locked ? "is-locked" : ""}" aria-label="单词语境">
        <div class="memory-context-head">
          <div>
            <span>语境记忆</span>
            <small>${locked ? "完成当前答题后才可展开" : `${view.count} 个专升本语境 · 默认收起`}</small>
          </div>
          <button class="memory-context-expand" type="button" data-card-action="context-toggle" ${locked ? "disabled" : ""}>${locked ? "答题后展开" : "手动展开"}</button>
        </div>
      </section>`;
  }

  const sentenceTarget = view.sentence.concealed
    ? `<span class="memory-context-cloze">${view.sentence.target}</span>`
    : `<mark>${view.sentence.target}</mark>`;
  const translation = policy.showTranslation
    ? `<p class="memory-context-translation">${view.translation}</p>`
    : `<p class="memory-context-translation is-hidden">答题后显示中文译文</p>`;
  const sense = policy.showTranslation && view.sense
    ? `<span class="memory-context-sense">${view.sense}</span>`
    : "";
  const navigation = view.count > 1 ? `
    <div class="memory-context-nav" aria-label="切换语境">
      <button type="button" data-card-action="context-prev" aria-label="上一个语境">‹</button>
      <span>${view.index + 1} / ${view.count}</span>
      <button type="button" data-card-action="context-next" aria-label="下一个语境">›</button>
    </div>` : "";
  const kindLabel = view.contextKind === "metalinguistic-fallback" ? "表达说明" : "专升本语境";
  const reviewWords = contextVocabularyReviewWords(word, view.sentenceText);
  const reviewHTML = reviewWords.length ? `
    <div class="memory-context-review-words">
      <b>本句同时复习词库词</b>
      <div>${reviewWords.map((item) => `<span><strong>${escapeHTML(item.term)}</strong>${item.meaning ? ` · ${escapeHTML(item.meaning)}` : ""}</span>`).join("")}</div>
    </div>` : `<div class="memory-context-review-words is-empty"><b>本句重点</b><span>先理解目标词，再切换下一条语境反复复习。</span></div>`;

  return `
    <section class="memory-context-card ${view.contextKind === "metalinguistic-fallback" ? "is-fallback" : ""}" aria-label="单词语境">
      <div class="memory-context-head">
        <div>
          <span>语境记忆 · ${kindLabel}</span>
          <small>${reviewCount ? `已复习 ${reviewCount} 次` : "首次复习"}</small>
        </div>
        <div class="memory-context-head-actions">
          ${navigation}
          <button class="memory-context-mark ${study.marked ? "is-marked" : ""}" type="button" data-card-action="context-mark">${markLabel}</button>
          <button class="memory-context-collapse" type="button" data-card-action="context-toggle">收起</button>
        </div>
      </div>
      <p class="memory-context-sentence">${view.sentence.before}${sentenceTarget}${view.sentence.after}</p>
      ${translation}
      ${reviewHTML}
      <div class="memory-context-meta">
        <span>${escapeHTML(view.posLabel)}</span>
        <span>${escapeHTML(view.levelLabel)}</span>
        ${sense}
      </div>
    </section>`;
}

function highlightedContextSentence(word, sentence) {
  const term = normalizeText(word?.term || "");
  if (!term) return escapeHTML(sentence);
  const re = new RegExp(`(${escapeRegExp(term)})`, "ig");
  return escapeHTML(sentence).replace(re, "<mark>$1</mark>");
}

function renderPosClassificationCard(word) {
  const mode = state.practiceMode;
  const result = state.posQuizResult;
  const sourceHint = wordSources(word).join(" / ") || "当前词库";
  let title = PROGRESS_MODE_LABELS[mode] || "语法训练";
  let question = "";
  let note = "";
  let resultText = "";
  let displayMeaning = meaningWithoutPosLabels(word);

  if (mode === "posClassify") {
    const correctPos = primaryTargetPos(word);
    const buttons = grammarChoiceButtons(POS_CLASSIFY_LABELS, "pos-choice", correctPos, result?.kind === "pos" ? result : null);
    question = `<div class="pos-question-block"><h4>请选择正确词性</h4><p>判断当前主要义项：名词、动词、数词、形容词或副词。</p><div class="pos-choice-grid pos-five-grid">${buttons}</div></div>`;
    resultText = grammarResultHTML(result, POS_CLASSIFY_LABELS[correctPos], word);
    note = "多词性词会按词库中最先出现的主要义项训练；标注冲突的词自动跳过。";
  } else if (mode === "nounCountability") {
    const correctValue = nounCountability(word);
    const buttons = grammarChoiceButtons(NOUN_COUNT_LABELS, "noun-choice", correctValue, result?.kind === "noun" ? result : null, "noun-count-button");
    question = `<div class="pos-question-block"><h4>这个名词属于哪一类？</h4><p>按当前主要义项判断可数性。</p><div class="pos-choice-grid noun-count-grid">${buttons}</div></div>`;
    resultText = grammarResultHTML(result, NOUN_COUNT_LABELS[correctValue], word);
    note = "同一个词在不同含义下可数性可能不同，系统按当前词库释义判断。";
  } else if (mode === "verbTransitivity") {
    const correctValue = verbTransitivity(word);
    const buttons = grammarChoiceButtons(VERB_TRANSITIVITY_LABELS, "verb-choice", correctValue, result?.kind === "verb" ? result : null);
    question = `<div class="pos-question-block"><h4>这个动词属于哪一类？</h4><p>判断及物性或特殊动词类型。</p><div class="pos-choice-grid verb-type-grid">${buttons}</div></div>`;
    resultText = grammarResultHTML(result, VERB_TRANSITIVITY_LABELS[correctValue], word);
    note = "答案包括：及物、不及物、两者均可、系动词、助动词和情态动词。";
  } else if (mode === "wordFamily") {
    const family = wordFamilyMembers(word);
    const options = [word, ...family.filter((item) => item.id !== word.id)].slice(0, 4);
    while (options.length < 4) {
      const filler = state.words.find((item) => !options.some((option) => option.id === item.id) && primaryTargetPos(item) && !isPhraseWord(item));
      if (!filler) break;
      options.push(filler);
    }
    options.sort((a, b) => a.term.localeCompare(b.term));
    const buttons = options.map((item) => {
      const value = item.id;
      const klass = posOptionClass(result?.kind === "family" ? result : null, value, word.id);
      const disabled = result ? "disabled" : "";
      return `<button class="pos-choice-button ${klass}" data-card-action="family-choice:${escapeHTML(value)}" type="button" ${disabled}>${escapeHTML(item.term)}<small>${escapeHTML(POS_CLASSIFY_LABELS[primaryTargetPos(item)] || "")}</small></button>`;
    }).join("");
    displayMeaning = meaningWithoutPosLabels(word);
    question = `<div class="pos-question-block"><h4>根据释义选择正确词形</h4><p>同一词族中注意名词、动词、形容词和副词形式。</p><div class="pos-choice-grid">${buttons}</div></div>`;
    resultText = grammarResultHTML(result, word.term, word);
    note = `同词族参考：${family.slice(0, 6).map((item) => item.term).join(" / ")}`;
  } else if (mode === "posContext") {
    const correctPos = primaryTargetPos(word);
    const sentence = contextSentenceFor(word);
    displayMeaning = highlightedContextSentence(word, sentence);
    const buttons = grammarChoiceButtons(POS_CLASSIFY_LABELS, "context-choice", correctPos, result?.kind === "context" ? result : null);
    question = `<div class="pos-question-block"><h4>判断标记词在句中的词性</h4><p class="context-sentence">${displayMeaning}</p><div class="pos-choice-grid pos-five-grid">${buttons}</div></div>`;
    displayMeaning = meaningWithoutPosLabels(word);
    resultText = grammarResultHTML(result, POS_CLASSIFY_LABELS[correctPos], word);
    note = "根据句中位置判断，不只依赖词尾。";
  }

  const contextCard = mode === "posContext" && !result ? "" : renderContextCard(word);
  els.activeCard.innerHTML = `
    <div class="pos-training-card">
      <div class="pos-training-head">
        <span class="pos-training-badge">${escapeHTML(title)}</span>
        <span class="pos-training-source">${escapeHTML(sourceHint)}</span>
      </div>
      <h3 class="pos-training-term">${escapeHTML(word.term)}</h3>
      <p class="pos-training-meaning">${escapeHTML(displayMeaning)}</p>
      ${contextCard}
      ${question}
      ${resultText}
      <div class="pos-training-actions">
        <button class="secondary-button" data-card-action="pos-speak" type="button">播放读音</button>
        <button class="secondary-button" data-card-action="pos-skip" type="button">跳过本题</button>
      </div>
      <p class="pos-training-note">${escapeHTML(note)}</p>
    </div>`;
}

function renderMasteryBox(word) {
  const level = normalizeText(word.mastery || "未学");
  return `
    <div class="mastery-box ${masteryClass(level)}">
      <div class="mastery-title"><span>掌握等级</span><b>${escapeHTML(level)}</b></div>
      <div class="mastery-buttons">
        ${MASTERY_LEVELS.map((item) => `<button class="mini-pill ${item === level ? "active" : ""}" data-card-action="set-mastery:${escapeHTML(item)}" type="button">${escapeHTML(item)}</button>`).join("")}
      </div>
    </div>`;
}


function compactMeaningParts(word) {
  const raw = normalizeText(word?.meaning || word?.phrase || word?.note || "");
  if (!raw) return [];
  const posRegex = /\b(?:exclamation|modal|aux|prep|pron|conj|det|num|adj|adv|vt|vi|n|v|int|art)\./gi;
  const matches = [...raw.matchAll(posRegex)].map((match) => ({ label: match[0], index: match.index }));
  const cleanDefinition = (text) => normalizeText(text)
    .replace(/^[\s:：,，;；、.。/／-]+/, "")
    .split(/[；;，,、。]/)
    .map((item) => normalizeText(item).replace(/^\(?[^\u4e00-\u9fa5A-Za-z0-9]+/, ""))
    .find(Boolean) || "";
  const normalizeLabels = (labels) => {
    const seen = new Set();
    return labels
      .map((label) => normalizeText(label).toLowerCase())
      .filter((label) => {
        if (!label || seen.has(label)) return false;
        seen.add(label);
        return true;
      })
      .join("/");
  };
  const parts = [];
  if (!matches.length) {
    const fallback = cleanDefinition(raw);
    return fallback ? [{ label: "释义", text: fallback }] : [];
  }
  let pendingLabels = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : raw.length;
    const segment = raw.slice(start, end);
    const labels = [...segment.matchAll(posRegex)].map((match) => match[0]);
    const afterLabel = segment.replace(new RegExp(`^(?:\\s|/|／|、|,|，|;|；|和|及|or|and|${labels.map(escapeRegExp).join("|")})+`, "i"), "");
    const definition = cleanDefinition(afterLabel);
    if (!definition) {
      pendingLabels.push(...labels);
      continue;
    }
    const label = normalizeLabels([...pendingLabels, ...labels]) || "释义";
    pendingLabels = [];
    if (!parts.some((item) => item.label === label && item.text === definition)) {
      parts.push({ label, text: definition });
    }
    if (parts.length >= 4) break;
  }
  return parts;
}

function renderPreviousWordHint() {
  const previous = state.reviewUndo?.word;
  if (!previous) return "";
  const parts = compactMeaningParts(previous);
  if (!parts.length) return "";
  return `
    <div class="previous-word-hint">
      <span class="previous-word-label">上一个</span>
      <b>${escapeHTML(previous.term || "上一词")}</b>
      <span>${parts.map((part) => `${escapeHTML(part.label)} ${escapeHTML(part.text)}`).join(" · ")}</span>
    </div>`;
}

function extractWordPhonetic(word) {
  const candidates = [word?.phonetic, word?.ipa, word?.pronunciation, word?.note, word?.phrase]
    .filter(Boolean)
    .map((value) => String(value));
  for (const value of candidates) {
    const match = value.match(/\/[A-Za-zɑɒæʌɔəɜː:ɪiʊuɛeɡθðʃʒŋˈˌ\'`\.\-\s\(\)r]+\//);
    if (match && match[0].length >= 4 && match[0].length <= 180) {
      return match[0].replace(/\s+/g, " ").trim();
    }
  }
  return "";
}

function renderAudioButton(label, action, phonetic) {
  const phoneticText = phonetic ? `<small>${escapeHTML(phonetic)}</small>` : "";
  return `<button class="secondary-button audio-button phonetic-audio" data-card-action="${escapeHTML(action)}" type="button"><span>${escapeHTML(label)}</span>${phoneticText}</button>`;
}

function renderLayeredMeaning(answerText) {
  const parts = meaningSegments(answerText);
  if (parts.length <= 1) {
    return `<p class="word-meaning">${escapeHTML(answerText)}</p>`;
  }
  const labels = ["核心义", "常考义", "扩展义"];
  return `<div class="meaning-layers">${parts.slice(0, 5).map((part, index) => `<p><b>${labels[index] || "补充义"}</b><span>${escapeHTML(part)}</span></p>`).join("")}</div>`;
}

function renderErrorReasonBox(word) {
  if (!state.answerVisible && !word.important) return "";
  const reasons = ["忘记中文", "拼写不熟", "相似词混了", "听音不熟", "一词多义", "搭配没记住"];
  const current = normalizeText(word.errorReason || "");
  return `<div class="error-reason-box"><span>错词原因</span>${reasons.map((reason) => `<button class="mini-pill ${current === reason ? "active" : ""}" data-card-action="set-error-reason:${escapeHTML(reason)}" type="button">${escapeHTML(reason)}</button>`).join("")}</div>`;
}


function renderAbilityBox(word) {
  const summary = wordAbilitySummary(word);
  const statText = (stat) => stat.correct || stat.wrong ? `${stat.correct}对 / ${stat.wrong}错` : "暂无测试";
  return `<div class="ability-dual-box" aria-label="认识度与拼写度">
    <div><span>认识度</span><b>${summary.recognition.score}</b><em>${summary.recognitionLabel}</em><small>${statText(summary.recognition)}</small><i style="--ability:${summary.recognition.score}%"></i></div>
    <div><span>拼写度</span><b>${summary.spelling.score}</b><em>${summary.spellingLabel}</em><small>${statText(summary.spelling)}</small><i style="--ability:${summary.spelling.score}%"></i></div>
  </div>`;
}

function renderPlainListCard() {
  const queue = getQueue().slice(0, 14);
  if (!queue.length) {
    els.activeCard.innerHTML = `<div class="empty-card"><div><h3>纯文字速刷暂无单词</h3><p>切换到新词记忆、全部抽查或只背不会的继续。</p></div></div>`;
    return;
  }
  els.activeCard.innerHTML = `
    <div class="plain-speed-card">
      <div class="plain-speed-head"><h3>纯文字速刷</h3><p>一屏多词，适合快速过重点和到期词。</p></div>
      <div class="plain-speed-list">
        ${queue.map((word) => `<article class="plain-speed-row" data-id="${escapeHTML(word.id)}"><b>${escapeHTML(word.term)}</b><span>${escapeHTML(meaningSegments(word.meaning)[0] || word.meaning || word.phrase || "未填释义")}</span><em>${priorityOf(word)}级</em><div><button data-card-action="studyword:${escapeHTML(word.id)}:remember" class="primary-button" type="button">记完</button><button data-card-action="studyword:${escapeHTML(word.id)}:fuzzy" class="secondary-button" type="button">模糊</button><button data-card-action="studyword:${escapeHTML(word.id)}:forgot" class="danger-button" type="button">忘了</button></div></article>`).join("")}
      </div>
    </div>`;
}

function renderActiveCard() {
  const word = activeWord();
  if (!word) {
    const message = GRAMMAR_PRACTICE_MODES.has(state.practiceMode) && state.words.length ? "当前分组没有可训练词条" : (state.practiceMode === "forms" && state.words.length ? "当前没有可练的动词变形" : (state.words.length ? "现在没有到期词" : "先加入第一批单词"));
    const detail = GRAMMAR_PRACTICE_MODES.has(state.practiceMode) && state.words.length ? "当前模式会自动跳过不符合条件或标注不明确的词条；可切换到“全部”或其他词库" : (state.practiceMode === "forms" && state.words.length ? "短语不会进入变形练习；可以切换 Word List 或添加单个动词" : (state.words.length ? "切到“新词记忆”或“全部抽查”继续" : "把你发来的单词和短语放进词库"));
    els.activeCard.innerHTML = `
      <div class="empty-card">
        <div>
          <h3>${message}</h3>
          <p>${detail}</p>
          <button class="primary-button" data-card-action="new-mode">新词记忆</button>
        </div>
      </div>`;
    return;
  }

  const progress = activeModeProgress(word);
  const status = statusOf(word);
  if (GRAMMAR_PRACTICE_MODES.has(state.practiceMode)) {
    renderPosClassificationCard(word);
    return;
  }
  if (state.practiceMode === "plainList") {
    renderPlainListCard();
    return;
  }
  const typingMode = ["spell", "dictation", "forms", "spellingWeak", "dictationWeak"].includes(state.practiceMode);
  const letters = typingMode ? [] : word.term.replace(/[^a-zA-Z]/g, "").slice(0, 9).split("");
  const ribbon = typingMode
    ? (state.practiceMode === "forms" ? "<span>F</span><span>O</span><span>R</span><span>M</span>" : "<span>S</span><span>P</span><span>E</span><span>L</span><span>L</span>")
    : (letters.length ? letters.map((letter) => `<span>${escapeHTML(letter)}</span>`).join("") : "<span>W</span><span>O</span><span>R</span><span>D</span>");
  const view = practiceView(word);
  const contextCard = renderContextCard(word);
  const choiceBox = state.practiceMode === "choiceZhToEn" ? renderChoiceBox(word) : "";
  const previousHint = renderPreviousWordHint();
  const phonetic = extractWordPhonetic(word);
  const threeStepBox = state.practiceMode === "threeStep" ? renderThreeStepBox(word, view) : "";
  const answer = state.practiceMode === "threeStep" ? "" : (state.answerVisible ? renderLayeredMeaning(view.answer) : `<div class="answer-mask">${escapeHTML(view.hidden)}</div>`);
  const extra = state.practiceMode === "threeStep" ? "" : (state.answerVisible && view.extra ? `<p class="word-phrase">${escapeHTML(view.extra)}</p>` : "");
  const note = state.practiceMode === "threeStep" ? "" : (state.answerVisible && word.note ? `<p class="word-note">备注：${escapeHTML(word.note)}</p>` : "");
  const important = word.important ? `<p class="important-line">重点词</p>` : "";
  const masteryBox = renderMasteryBox(word);
  const errorReasonBox = renderErrorReasonBox(word);
  const abilityBox = renderAbilityBox(word);
  const spellingBox = state.practiceMode === "forms" ? renderVerbFormsBox(word) : renderSpellingBox(word);
  const undoDisabled = state.reviewUndo ? "" : "disabled";
  const quickActions = `
    <div class="quick-review-actions action-grid-v59 action-grid-v61">
      <button class="primary-button" data-card-action="remember">${progress.stage < 0 ? "记完" : "会了"}</button>
      <button class="secondary-button" data-card-action="fuzzy">模糊</button>
      <button class="secondary-button meaning-button" data-card-action="show">${state.answerVisible ? "隐藏词义" : "显示词义"}</button>
      <button class="secondary-button" data-card-action="undo-review" ${undoDisabled}>撤回上一个</button>
      ${renderAudioButton("美音", "speak", phonetic)}
      <button class="danger-button" data-card-action="forgot">忘了</button>
      <span class="action-spacer" aria-hidden="true"></span>
      ${renderAudioButton("英音", "speak-uk", phonetic)}
      <span class="action-spacer" aria-hidden="true"></span>
    </div>`;

  els.activeCard.innerHTML = `
    <div class="card-top">
      <div class="letter-ribbon">${ribbon}</div>
      ${previousHint}
      <p class="quiz-prompt">${escapeHTML(view.prompt)}</p>
      <h3 class="${state.practiceMode === "card" || state.practiceMode === "enToZh" ? "word-term" : "quiz-target"}">${escapeHTML(view.target)}</h3>
      <p class="word-phonetic-line">${phonetic ? escapeHTML(phonetic) : "点击美音或英音听读"}</p>
      ${contextCard}
      ${quickActions}
      ${spellingBox}
      ${choiceBox}
      ${threeStepBox}
      ${answer}
      ${extra}
      ${note}
      ${important}
      ${abilityBox}
      ${errorReasonBox}
      ${masteryBox}
      <p class="next-line">下次：${formatDateTime(progress.nextReviewAt)} · ${statusLabel(status)}</p>
    </div>
    <div class="card-bottom">
      <div class="stage-track">${REVIEW_STEPS.map((_, index) => `<span class="stage-dot${index <= progress.stage ? " active" : ""}"></span>`).join("")}</div>
      <div class="card-actions">
        <button class="secondary-button" data-card-action="toggle-important">${word.important ? "取消重点" : "标重点"}</button>
      </div>
    </div>`;

  updateGazeGuidePosition();

  if (["dictation", "dictationWeak"].includes(state.practiceMode) && state.lastAutoSpokenId !== word.id) {
    state.lastAutoSpokenId = word.id;
    window.setTimeout(() => speakTerm(word.term, { silent: true, accent: "us" }), 120);
  }
}

function renderTimeline() {
  const todayWords = state.words
    .filter(isTodayReview)
    .filter(wordMatchesActiveGroup)
    .sort((a, b) => activeModeProgress(a).nextReviewAt.localeCompare(activeModeProgress(b).nextReviewAt));

  if (!todayWords.length) {
    els.todayTimeline.innerHTML = `<div class="time-slot"><strong>今天</strong><div><span>暂无安排</span></div></div>`;
    return;
  }

  els.todayTimeline.innerHTML = todayWords.slice(0, 18).map((word) => `
    <div class="time-slot">
      <strong>${formatTime(activeModeProgress(word).nextReviewAt)}</strong>
      <div>
        <span>${escapeHTML(word.term)}</span>
        <span>${escapeHTML(word.meaning || word.phrase || "未填释义")}</span>
      </div>
    </div>`).join("");
}

function filteredWords() {
  const query = state.query.toLowerCase();
  return state.words
    .filter((word) => {
      const forms = verbForms(word);
      const text = [word.term, word.meaning, word.phrase, word.note, word.tag, ...wordSources(word), forms.third, forms.past, forms.participle].join(" ").toLowerCase();
      const matchesQuery = !query || text.includes(query);
      const status = statusOf(word);
      const matchesFilter = state.filter === "all" || status === state.filter || (state.filter === "important" && word.important);
      const matchesSource = state.librarySourceFilter === "all" || wordSources(word).includes(state.librarySourceFilter);
      return matchesQuery && matchesFilter && matchesSource && wordMatchesActiveGroup(word);
    })
    .sort((a, b) => {
      const statusDiff = Number(isDue(b)) - Number(isDue(a));
      if (statusDiff) {
        return statusDiff;
      }
      return (activeModeProgress(a).nextReviewAt || "9999").localeCompare(activeModeProgress(b).nextReviewAt || "9999");
    });
}

function renderWordList() {
  const words = filteredWords();
  if (!words.length) {
    els.wordList.innerHTML = `<div class="empty-card"><div><h3>没有匹配的单词</h3><p>换一个分组、状态或搜索词再看</p></div></div>`;
    return;
  }

  const limit = Math.max(20, state.wordListLimit || 40);
  const visibleWords = words.slice(0, limit);
  const hiddenCount = Math.max(0, words.length - visibleWords.length);

  const summary = `
    <div class="light-list-summary">
      <strong>当前只显示 ${visibleWords.length} / ${words.length} 个</strong>
      <span>为了手机不卡，列表不会一次性渲染全部单词。想找具体单词请用搜索。</span>
    </div>`;

  const rows = visibleWords.map((word) => {
    const status = statusOf(word);
    const progress = activeModeProgress(word);
    return `
      <article class="word-row" data-id="${escapeHTML(word.id)}">
        <div>
          <strong>${maskedText(word.term, "english")}</strong>
          ${wordSources(word).map((source) => `<span class="source-pill">${escapeHTML(source)}</span>`).join("")}
          <p>${escapeHTML(word.tag || "未标记")}</p>
        </div>
        <div>
          <p>${maskedText(word.meaning || "未填中文", "chinese")}</p>
          <p>${escapeHTML(word.phrase || "")}</p>
        </div>
        <div>
          <span class="status-pill status-${status}">${statusLabel(status)}</span>
          ${word.important ? `<span class="status-pill status-important">重点</span>` : ""}
          <p>${formatDateTime(progress.nextReviewAt)}</p>
        </div>
        <div class="mini-actions">
          <button class="secondary-button" data-row-action="study">打开</button>
          <button class="secondary-button" data-row-action="important">${word.important ? "取消重点" : "重点"}</button>
          <button class="danger-button" data-row-action="delete">删</button>
        </div>
      </article>`;
  }).join("");

  const more = hiddenCount ? `
    <div class="light-load-more">
      <button class="secondary-button" data-row-action="load-more" type="button">再显示 40 个</button>
      <p>还有 ${hiddenCount} 个未显示。搜索结果仍然会从全部词库里找，不会漏。</p>
    </div>` : "";

  els.wordList.innerHTML = summary + rows + more;
}

function clearForm() {
  els.wordForm.reset();
  els.termInput.focus();
}

function wordFromForm() {
  const now = new Date().toISOString();
  return normalizeWord({
    id: createId(),
    term: normalizeText(els.termInput.value),
    meaning: normalizeText(els.meaningInput.value),
    phrase: normalizeText(els.phraseInput.value),
    tag: normalizeText(els.tagInput.value),
    source: els.sourceInput.value,
    note: normalizeText(els.noteInput.value),
    forms: {
      third: normalizeText(els.thirdPersonInput.value),
      past: normalizeText(els.pastTenseInput.value),
      participle: normalizeText(els.pastParticipleInput.value),
    },
    status: "new",
    stage: -1,
    createdAt: now,
    updatedAt: now,
  });
}

function addWord(event) {
  event.preventDefault();
  if (!guardEditable()) {
    return;
  }
  const word = wordFromForm();
  if (!word.term) {
    return;
  }
  state.words.unshift(word);
  saveWords();
  clearForm();
  setStudyMode("new");
  setActiveId(word.id);
  state.answerVisible = false;
  render();
  showToast("已加入词库");
}

function splitImportLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  let parts = [];
  if (trimmed.includes("|")) {
    parts = trimmed.split("|");
  } else if (trimmed.includes("\t")) {
    parts = trimmed.split("\t");
  } else if (/\s[-—]\s/.test(trimmed)) {
    parts = trimmed.split(/\s[-—]\s/);
  } else {
    parts = trimmed.split(/[,，；;]/);
  }
  parts = parts.map(normalizeText).filter(Boolean);
  const hasForms = parts.length >= 6;
  return {
    term: parts[0] || trimmed,
    meaning: parts[1] || "",
    phrase: parts[2] || "",
    forms: hasForms ? {
      third: parts[3] || "",
      past: parts[4] || "",
      participle: parts[5] || "",
    } : emptyVerbForms(),
    note: (hasForms ? parts.slice(6) : parts.slice(3)).join("；"),
  };
}

function bulkAdd() {
  if (!guardEditable()) {
    return;
  }
  const lines = els.bulkInput.value.split(/\r?\n/).map(splitImportLine).filter(Boolean);
  if (!lines.length) {
    showToast("没有识别到单词");
    return;
  }
  const now = new Date().toISOString();
  const existing = new Set(state.words.map((word) => word.term.toLowerCase()));
  const created = lines
    .filter((item) => item.term && !existing.has(item.term.toLowerCase()))
    .map((item) => normalizeWord({
      id: createId(),
      term: item.term,
      meaning: item.meaning,
      phrase: item.phrase,
      source: els.bulkSourceInput.value,
      forms: item.forms,
      note: item.note,
      tag: "导入",
      status: "new",
      stage: -1,
      createdAt: now,
      updatedAt: now,
    }));
  state.words = dedupeRuntimeWords([...created, ...state.words]);
  saveWords();
  els.bulkInput.value = "";
  setStudyMode("new");
  setActiveId(created[0]?.id || state.activeId);
  state.answerVisible = false;
  render();
  showToast(`已加入 ${created.length} 个词条`);
}

function finishPosQuiz(word, correct, answerLabel, kind, selected) {
  const completedAt = new Date();
  const mode = state.practiceMode;
  if (!correct) {
    word.important = true;
    word.errorReason = {
      pos: "词性混淆",
      noun: "可数性不清楚",
      verb: "动词及物性不清楚",
      family: "词形变化混淆",
      context: "语境判断错误",
    }[kind] || "语法判断错误";
  }
  rememberReviewUndo(word, correct ? "remember" : "forgot");
  scheduleNext(word, modeProgress(word, mode).stage < 0 && correct ? "new" : (correct ? "remember" : "forgot"), { silent: true });
  recordModeHistory(word, {
    time: completedAt.toISOString(),
    result: correct ? `${kind}-correct` : `${kind}-wrong`,
    nextReviewAt: modeProgress(word, mode).nextReviewAt || "",
    detail: `${kind}:${selected}`,
  }, mode);
  word.updatedAt = completedAt.toISOString();
  state.posQuizResult = { step: "done", kind, selected, correct, answerLabel, wordId: word.id };
  saveWords();
  renderActiveCard();
  showToast(correct ? "回答正确" : `回答错误：${answerLabel}`);
  window.setTimeout(() => {
    if (!GRAMMAR_PRACTICE_MODES.has(state.practiceMode) || state.posQuizResult?.wordId !== word.id) return;
    state.posQuizResult = null;
    state.answerVisible = false;
    chooseActiveWord(true);
    render();
  }, correct ? 700 : 1800);
}

function answerPosClassification(word, selected) {
  if (!guardEditable() || state.posQuizResult) return;
  const correctPos = primaryTargetPos(word);
  finishPosQuiz(word, selected === correctPos, POS_CLASSIFY_LABELS[correctPos] || "词性未标注", "pos", selected);
}

function answerNounCountability(word, selected) {
  if (!guardEditable() || state.posQuizResult) return;
  const correctValue = nounCountability(word);
  finishPosQuiz(word, selected === correctValue, NOUN_COUNT_LABELS[correctValue], "noun", selected);
}

function answerVerbTransitivity(word, selected) {
  if (!guardEditable() || state.posQuizResult) return;
  const correctValue = verbTransitivity(word);
  finishPosQuiz(word, selected === correctValue, VERB_TRANSITIVITY_LABELS[correctValue] || "动词类型未标注", "verb", selected);
}

function answerWordFamily(word, selectedId) {
  if (!guardEditable() || state.posQuizResult) return;
  finishPosQuiz(word, selectedId === word.id, word.term, "family", selectedId);
}

function answerPosContext(word, selected) {
  if (!guardEditable() || state.posQuizResult) return;
  const correctPos = primaryTargetPos(word);
  finishPosQuiz(word, selected === correctPos, POS_CLASSIFY_LABELS[correctPos] || "词性未标注", "context", selected);
}

function skipPosQuiz(word) {
  const queue = getQueue();
  const currentIndex = queue.findIndex((item) => item.id === word.id);
  const next = queue.length > 1 ? queue[(currentIndex + 1) % queue.length] : null;
  state.posQuizResult = null;
  state.answerVisible = false;
  state.contextIndex = 0;
  if (next && next.id !== word.id) setActiveId(next.id);
  render();
}

function handleCardAction(action) {
  if (action === "new-mode") {
    setMode("new");
    return;
  }
  if (action === "undo-review") {
    undoLastReview();
    return;
  }
  if (action.startsWith("studyword:")) {
    if (!guardEditable()) return;
    const [, id, result] = action.split(":");
    const targetWord = state.words.find((item) => item.id === id);
    if (!targetWord || !["remember", "fuzzy", "forgot"].includes(result)) return;
    state.activeId = targetWord.id;
    rememberReviewUndo(targetWord, result);
    scheduleNext(targetWord, modeProgress(targetWord).stage < 0 && result === "remember" ? "new" : result, { silent: true });
    saveWords();
    state.answerVisible = false;
    resetTypingState();
    render();
    showToast(result === "remember" ? "已记完" : (result === "fuzzy" ? "已加入模糊复习" : "已加入重点复习"));
    return;
  }
  const word = activeWord();
  if (!word) {
    return;
  }
  if (action === "context-toggle") {
    const current = currentContextView(word);
    if (!current?.policy?.showSentence) {
      showToast("完成当前答题后再展开语境");
      return;
    }
    state.contextExpanded = !state.contextExpanded;
    if (state.contextExpanded) recordContextReview(word, current.view);
    renderActiveCard();
    return;
  }
  if (action === "context-mark") {
    const current = currentContextView(word);
    if (current) {
      const marked = toggleContextSentenceMark(word, current.view);
      showToast(marked ? "句子已标记，后续可重点复习" : "已取消句子标记");
      renderActiveCard();
    }
    return;
  }
  if (action === "context-prev" || action === "context-next") {
    const presenter = window.WordContextPresenter;
    const count = presenter?.contextsFor(word)?.records?.length || 0;
    if (count > 1) {
      const offset = action === "context-next" ? 1 : -1;
      state.contextIndex = presenter.normalizeIndex(state.contextIndex + offset, count);
      const current = currentContextView(word);
      if (current) recordContextReview(word, current.view);
      renderActiveCard();
    }
    return;
  }
  if (action.startsWith("pos-choice:")) {
    answerPosClassification(word, action.slice("pos-choice:".length));
    return;
  }
  if (action.startsWith("noun-choice:")) {
    answerNounCountability(word, action.slice("noun-choice:".length));
    return;
  }
  if (action.startsWith("verb-choice:")) {
    answerVerbTransitivity(word, action.slice("verb-choice:".length));
    return;
  }
  if (action.startsWith("family-choice:")) {
    answerWordFamily(word, action.slice("family-choice:".length));
    return;
  }
  if (action.startsWith("context-choice:")) {
    answerPosContext(word, action.slice("context-choice:".length));
    return;
  }
  if (action === "pos-skip") {
    skipPosQuiz(word);
    return;
  }
  if (action === "pos-speak") {
    speakTerm(word.term, { accent: "us" });
    return;
  }
  if (action === "speak") {
    speakTerm(word.term, { accent: "us" });
    return;
  }
  if (action === "next-reveal") {
    state.revealStep = Math.min(2, Number(state.revealStep || 0) + 1);
    renderActiveCard();
    return;
  }
  if (action === "reset-reveal") {
    state.revealStep = 0;
    state.answerVisible = false;
    renderActiveCard();
    return;
  }
  if (action.startsWith("set-error-reason:")) {
    if (!guardEditable()) return;
    word.errorReason = action.slice("set-error-reason:".length);
    word.important = true;
    word.updatedAt = new Date().toISOString();
    saveWords();
    renderActiveCard();
    showToast(`已标记原因：${word.errorReason}`);
    return;
  }
  if (action.startsWith("set-mastery:")) {
    if (!guardEditable()) {
      return;
    }
    setMastery(word, action.slice("set-mastery:".length));
    return;
  }
  if (action.startsWith("choice:")) {
    if (!guardEditable()) {
      return;
    }
    answerChoice(word, decodeURIComponent(action.slice("choice:".length)));
    return;
  }
  if (action === "speak-uk") {
    speakTerm(word.term, { accent: "uk" });
    return;
  }
  if (["check-spelling", "check-forms", "toggle-important", "remember", "fuzzy", "forgot"].includes(action) && !guardEditable()) {
    return;
  }
  if (action === "check-spelling") {
    const correct = isSpellingCorrect(state.spellingDraft, word);
    const completedAt = new Date().toISOString();
    state.spellingResult = { correct };
    state.answerVisible = true;
    recordMemoryMetric(word, "spelling", correct);
    state.pendingRatingMeta = { wordId: word.id, skipMetric: true, mode: "spelling" };
    recordModeHistory(word, {
      time: completedAt,
      result: correct ? (["dictation", "dictationWeak"].includes(state.practiceMode) ? "dictation-correct" : "spell-correct") : (["dictation", "dictationWeak"].includes(state.practiceMode) ? "dictation-wrong" : "spell-wrong"),
      nextReviewAt: modeProgress(word).nextReviewAt || "",
    });
    if (!correct) {
      word.important = true;
    }
    word.updatedAt = completedAt;
    saveWords();
    renderActiveCard();
    focusTypingInputSoon();
    scheduleBackgroundRender();
    showToast(correct ? "拼对了，再按 Enter 直接记住" : "拼错了，再按 Enter 记为忘了");
    return;
  }
  if (action === "check-forms") {
    const correct = isVerbFormsCorrect(state.formDrafts, word);
    const completedAt = new Date().toISOString();
    state.formResult = { correct };
    state.answerVisible = true;
    recordMemoryMetric(word, "spelling", correct);
    state.pendingRatingMeta = { wordId: word.id, skipMetric: true, mode: "spelling" };
    recordModeHistory(word, {
      time: completedAt,
      result: correct ? "forms-correct" : "forms-wrong",
      nextReviewAt: modeProgress(word).nextReviewAt || "",
    });
    if (!correct) {
      word.important = true;
    }
    word.updatedAt = completedAt;
    saveWords();
    renderActiveCard();
    focusTypingInputSoon();
    scheduleBackgroundRender();
    showToast(correct ? "变形拼对了，再按 Enter 直接记住" : "变形有错，再按 Enter 记为忘了");
    return;
  }
  if (action === "clear-spelling") {
    resetTypingState();
    state.answerVisible = false;
    renderActiveCard();
    return;
  }
  if (action === "show") {
    state.answerVisible = !state.answerVisible;
    renderActiveCard();
    return;
  }
  if (action === "toggle-important") {
    word.important = !word.important;
    word.updatedAt = new Date().toISOString();
    saveWords();
    render();
    showToast(word.important ? "已加入重点词" : "已取消重点");
    return;
  }
  if (["remember", "fuzzy", "forgot"].includes(action)) {
    const progress = activeModeProgress(word);
    rememberReviewUndo(word, action);
    scheduleNext(word, progress.stage < 0 && action === "remember" ? "new" : action);
    if (state.sprint.active) {
      state.sprint.completed += 1;
    }
    saveWords();
    state.answerVisible = false;
    resetTypingState();
    chooseActiveWord(true);
    renderStudyTransition();
    focusTypingInputSoon();
  }
}

function setMode(mode) {
  setStudyMode(mode);
  state.answerVisible = false;
  resetTypingState();
  state.lastAutoSpokenId = null;
  render();
}

function startSprint() {
  if (state.sprint.active) {
    endSprint();
    render();
    return;
  }
  const now = nowDate();
  state.sprint = {
    active: true,
    startedAt: now.toISOString(),
    endsAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
    completed: 0,
  };
  setStudyMode("all");
  state.answerVisible = false;
  resetTypingState();
  state.lastAutoSpokenId = null;
  render();
  showToast("15分钟冲刺开始：到期 → 重点 → 新词");
}

function startNewWords() {
  const newWords = state.words.filter((word) => statusOf(word) === "new" && wordMatchesActiveGroup(word));
  if (!newWords.length) {
    showToast("没有新词了");
    return;
  }
  setMode("new");
}

function batchLearnNewWords() {
  if (!guardEditable()) {
    return;
  }
  const visibleNew = filteredWords().filter((word) => statusOf(word) === "new");
  const words = visibleNew.length ? visibleNew : state.words.filter((word) => statusOf(word) === "new" && wordMatchesActiveGroup(word));
  if (!words.length) {
    showToast("没有新词需要安排");
    return;
  }

  const scope = visibleNew.length === words.length && (state.query || state.filter !== "all") ? "当前筛选的新词" : "所有新词";
  if (!confirm(`把${scope}（${words.length} 个）全部标为已记完，并从现在开始安排 20 分钟后的第一次复习？`)) {
    return;
  }

  const completedAt = nowDate();
  words.forEach((word) => scheduleNext(word, "new", { completedAt, silent: true }));
  saveWords();
  setStudyMode("due");
  state.answerVisible = false;
  render();
  showToast(`已安排 ${words.length} 个新词：${formatDateTime(activeModeProgress(words[0]).nextReviewAt)} 复习`);
}

function deleteWord(id) {
  if (!guardEditable()) {
    return;
  }
  const word = state.words.find((item) => item.id === id);
  if (!word) {
    return;
  }
  if (!confirm(`删除「${word.term}」？`)) {
    return;
  }
  state.words = state.words.filter((item) => item.id !== id);
  saveWords();
  if (state.activeId === id) {
    setActiveId(null);
  }
  render();
  showToast("已删除");
}

function exportWords() {
  const payload = {
    app: "专升本单词记忆",
    version: 1,
    reviewSteps: REVIEW_STEPS.map((step) => step.label),
    exportedAt: new Date().toISOString(),
    studyTime: state.studyTime,
    studySession: captureStudySessionSnapshot(),
    dailyCompleted: normalizeDailyCompletedStore(dailyCompletedStore),
    contextStudy: normalizeContextStudyStore(contextStudyStore),
    memoryLab: normalizeMemoryLabStore(memoryLabStore),
    words: state.words,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `专升本单词本机备份-${todayKey()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function isDictationWordRecord(word) {
  const id = normalizeText(word?.id || "");
  const groups = Array.isArray(word?.groups) ? word.groups : [];
  return /^dictation-[1-4]-/.test(id) || groups.some((group) => /^第[一二三四]次听写内容$/.test(normalizeText(group)));
}

function dictationImportKey(word) {
  const group = (Array.isArray(word?.groups) ? word.groups : [])
    .map(normalizeText)
    .find((item) => /^第[一二三四]次听写内容$/.test(item)) || "听写内容";
  return `${group}|${normalizeText(word?.term || "").toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ")}`;
}

function mergeImportedProgressOnly(target, incoming) {
  if (!target || !incoming) return target;
  target.important = Boolean(target.important || incoming.important);
  if ((incoming.mastery || "未学") !== "未学") target.mastery = incoming.mastery;
  target.progress = normalizeModeProgress(target);
  const incomingProgress = normalizeModeProgress(incoming);
  PROGRESS_MODES.forEach((mode) => {
    target.progress[mode] = mergeProgressRecord(target.progress[mode] || {}, incomingProgress[mode] || {});
  });
  const legacy = mergeProgressRecord(
    { status: target.status, stage: target.stage, nextReviewAt: target.nextReviewAt, lastStudiedAt: target.lastStudiedAt, history: target.history || [] },
    { status: incoming.status, stage: incoming.stage, nextReviewAt: incoming.nextReviewAt, lastStudiedAt: incoming.lastStudiedAt, history: incoming.history || [] }
  );
  // 备份中的顶层状态和 card 进度可能不一致。card 才是卡片学习的真实进度，
  // 导入后必须同步回顶层，否则听写分组会显示成未学。
  const mergedCard = target.progress.card || legacy;
  const finalCard = mergeProgressRecord(legacy, mergedCard);
  target.progress.card = finalCard;
  target.status = finalCard.status;
  target.stage = finalCard.stage;
  target.nextReviewAt = finalCard.nextReviewAt;
  target.lastStudiedAt = finalCard.lastStudiedAt;
  target.history = finalCard.history;
  if (incoming.updatedAt && (!target.updatedAt || incoming.updatedAt > target.updatedAt)) target.updatedAt = incoming.updatedAt;
  return target;
}

async function importWords(event) {
  if (!guardEditable()) {
    event.target.value = "";
    return;
  }
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const incoming = Array.isArray(parsed) ? parsed : parsed.words;
    if (!Array.isArray(incoming)) throw new Error("Invalid file");

    const records = incoming.map(normalizeWord).filter((word) => word.term);
    const byId = new Map(state.words.map((word) => [normalizeText(word.id), word]));
    const byTerm = new Map();
    const byDictation = new Map();
    state.words.forEach((word) => {
      if (isDictationWordRecord(word)) byDictation.set(dictationImportKey(word), word);
      else {
        const key = normalizeText(word.term).toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ");
        if (key && !byTerm.has(key)) byTerm.set(key, word);
      }
    });

    let restored = 0;
    let added = 0;
    const seenIds = new Set();
    const seenTerms = new Set();
    records.forEach((word) => {
      const id = normalizeText(word.id);
      const termKey = normalizeText(word.term).toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ");
      const dictation = isDictationWordRecord(word);
      const uniqueKey = dictation ? `id:${id || dictationImportKey(word)}` : `term:${termKey}`;
      const seenSet = dictation ? seenIds : seenTerms;
      if (seenSet.has(uniqueKey)) return;
      seenSet.add(uniqueKey);

      let target = id ? byId.get(id) : null;
      if (!target && dictation) target = byDictation.get(dictationImportKey(word));
      if (!target && !dictation) target = byTerm.get(termKey);

      if (target) {
        if (dictation || isDictationWordRecord(target)) {
          mergeImportedProgressOnly(target, word);
        } else {
          mergeRuntimeWord(target, word);
        }
        restored += 1;
      } else {
        state.words.push(word);
        byId.set(id, word);
        if (dictation) byDictation.set(dictationImportKey(word), word);
        else byTerm.set(termKey, word);
        added += 1;
      }
    });

    if (parsed.studyTime) {
      state.studyTime = normalizeStudyTime(parsed.studyTime);
      saveStudyTime();
    }
    if (parsed.dailyCompleted) {
      dailyCompletedStore = mergeDailyCompletedStores(dailyCompletedStore, parsed.dailyCompleted);
      saveDailyCompletedStore();
    }
    if (parsed.contextStudy) {
      contextStudyStore = mergeContextStudyStores(contextStudyStore, parsed.contextStudy);
      saveContextStudyStore();
    }
    if (parsed.memoryLab) {
      memoryLabStore = mergeMemoryLabStores(memoryLabStore, parsed.memoryLab);
      saveMemoryLabStore();
    }
    syncTodayCompletedFromHistories();
    if (parsed.studySession) applyStudySessionSnapshot(parsed.studySession);
    else setActiveId(null);
    saveWords({ immediate: true });
    render();
    showToast(`备份恢复完成：恢复进度 ${restored} 条，新增 ${added} 条；当前卡片位置也已恢复`);
  } catch (error) {
    console.error("Import failed", error);
    showToast("导入失败，请选择正确的词库备份文件");
  } finally {
    event.target.value = "";
  }
}

function planText() {
  const items = state.words
    .filter(wordMatchesActiveGroup)
    .filter(isTodayReview)
    .sort((a, b) => activeModeProgress(a).nextReviewAt.localeCompare(activeModeProgress(b).nextReviewAt));
  if (!items.length) {
    return "今天暂无单词复习安排。";
  }
  return items.map((word) => `${formatTime(activeModeProgress(word).nextReviewAt)}  ${word.term}  ${word.meaning || word.phrase || ""}`).join("\n");
}

async function copyPlan() {
  const text = planText();
  try {
    await navigator.clipboard.writeText(text);
    showToast("今日计划已复制");
  } catch {
    showToast(text);
  }
}


function fingerActionLabel(action) {
  const labels = {
    remember: "记完",
    fuzzy: "模糊",
    forgot: "忘了",
    "undo-review": "撤回上一个",
    show: state.answerVisible ? "隐藏释义" : "显示释义",
  };
  return labels[action] || action;
}

function setFingerStatus(message, tone = "") {
  if (els.gazeStatus) els.gazeStatus.textContent = message;
  if (els.gazePanel) els.gazePanel.dataset.tone = tone;
}

function startFingerControl() {
  showToast("手指翻词已关闭：当前版本优先保证按钮稳定和显示词义。");
  return;
  const control = state.fingerControl;
  if (control.enabled) {
    stopFingerControl();
    return;
  }
  try { stopGazeControl(""); } catch (error) {}
  control.enabled = true;
  control.pointerId = null;
  control.pendingAction = "";
  control.pendingLabel = "";
  control.pendingUntil = 0;
  if (els.gazePanel) els.gazePanel.hidden = false;
  if (els.gazeGuide) els.gazeGuide.hidden = true;
  setFingerStatus("手指翻词已开启：轻点卡片空白处显示释义；右滑两次记完，左滑两次忘了，上滑两次模糊，下滑两次撤回。", "ok");
  updateGazeButton();
  showToast("手指翻词已开启，不需要摄像头");
}

function stopFingerControl(message = "已关闭手指翻词") {
  const control = state.fingerControl;
  if (!control) return;
  control.enabled = false;
  control.pointerId = null;
  control.pendingAction = "";
  control.pendingLabel = "";
  control.pendingUntil = 0;
  document.querySelectorAll(".finger-armed").forEach((node) => node.classList.remove("finger-armed"));
  if (els.gazePanel) els.gazePanel.hidden = true;
  updateGazeButton();
  if (message) showToast(message);
}

function isFingerIgnoredTarget(target) {
  return Boolean(target?.closest?.("button, input, textarea, select, a, [contenteditable='true'], [data-card-action], [data-row-action]"));
}

function clearFingerArmed() {
  document.querySelectorAll(".finger-armed").forEach((node) => node.classList.remove("finger-armed"));
}

function armFingerAction(action, label, directionText) {
  const control = state.fingerControl;
  const now = Date.now();
  const samePending = control.pendingAction === action && now < control.pendingUntil;
  const button = els.activeCard?.querySelector(`[data-card-action="${action}"]`);
  clearFingerArmed();
  if (samePending) {
    control.pendingAction = "";
    control.pendingLabel = "";
    control.pendingUntil = 0;
    handleCardAction(action);
    setFingerStatus(`已执行：${label}`, "ok");
    return;
  }
  control.pendingAction = action;
  control.pendingLabel = label;
  control.pendingUntil = now + 3800;
  button?.classList.add("finger-armed");
  setFingerStatus(`${directionText}已锁定：${label}。3.8 秒内再滑一次同方向才执行。`, "warn");
  showToast(`再${directionText}一次确认：${label}`);
}

function handleFingerGesture(action, directionText) {
  if (!action) return;
  if (action === "show") {
    handleCardAction("show");
    setFingerStatus(`${fingerActionLabel("show")}已执行。`, "ok");
    return;
  }
  armFingerAction(action, fingerActionLabel(action), directionText);
}

function onFingerPointerDown(event) {
  const control = state.fingerControl;
  if (!control?.enabled || !els.activeCard?.contains(event.target)) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (isFingerIgnoredTarget(event.target)) return;
  control.pointerId = event.pointerId;
  control.startX = event.clientX;
  control.startY = event.clientY;
  control.startedAt = Date.now();
}

function onFingerPointerUp(event) {
  const control = state.fingerControl;
  if (!control?.enabled || control.pointerId !== event.pointerId) return;
  const dx = event.clientX - control.startX;
  const dy = event.clientY - control.startY;
  const elapsed = Date.now() - control.startedAt;
  control.pointerId = null;
  if (elapsed > 1600) return;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const minSwipe = 72;
  if (Math.max(absX, absY) < 28) {
    handleFingerGesture("show", "轻点");
    return;
  }
  if (Math.max(absX, absY) < minSwipe) return;
  if (absX > absY * 1.25) {
    if (dx > 0) handleFingerGesture("remember", "右滑");
    else handleFingerGesture("forgot", "左滑");
    return;
  }
  if (absY > absX * 1.25) {
    if (dy < 0) handleFingerGesture("fuzzy", "上滑");
    else handleFingerGesture("undo-review", "下滑");
  }
}

function onFingerPointerCancel(event) {
  const control = state.fingerControl;
  if (!control?.enabled) return;
  if (control.pointerId === event.pointerId) control.pointerId = null;
}

function wireEvents() {
  els.wordForm.addEventListener("submit", addWord);
  els.clearFormButton.addEventListener("click", clearForm);
  els.bulkAddButton.addEventListener("click", bulkAdd);
  els.clearBulkButton.addEventListener("click", () => {
    els.bulkInput.value = "";
    els.bulkInput.focus();
  });
  els.gazeControlButton?.addEventListener("click", startFingerControl);
  els.gazeStopButton?.addEventListener("click", () => stopFingerControl());
  window.addEventListener("resize", () => updateGazeGuidePosition());
  window.addEventListener("scroll", () => {
    if (state.gazeControl?.enabled || state.gazeControl?.starting) updateGazeGuidePosition();
  }, { passive: true });
  els.activeCard.addEventListener("pointerdown", onFingerPointerDown, { passive: true });
  els.activeCard.addEventListener("pointerup", onFingerPointerUp, { passive: true });
  els.activeCard.addEventListener("pointercancel", onFingerPointerCancel, { passive: true });
  els.activeCard.addEventListener("pointerleave", onFingerPointerCancel, { passive: true });
  els.activeCard.addEventListener("click", (event) => {
    const button = event.target.closest("[data-card-action]");
    if (button) {
      handleCardAction(button.dataset.cardAction);
    }
  });
  els.activeCard.addEventListener("input", (event) => {
    if (event.target.matches("[data-spell-input]")) {
      state.spellingDraft = event.target.value;
      state.spellingResult = null;
    }
    if (event.target.matches("[data-form-input]")) {
      state.formDrafts[event.target.dataset.formInput] = event.target.value;
      state.formResult = null;
    }
  });
  els.activeCard.addEventListener("keydown", (event) => {
    if (event.target.matches("[data-spell-input]") && event.key === "Enter") {
      event.preventDefault();
      if (state.spellingResult) {
        handleCardAction(state.spellingResult.correct ? "remember" : "forgot");
      } else {
        handleCardAction("check-spelling");
      }
    }
    if (event.target.matches("[data-form-input]") && event.key === "Enter") {
      event.preventDefault();
      if (state.formResult) {
        handleCardAction(state.formResult.correct ? "remember" : "forgot");
      } else {
        handleCardAction("check-forms");
      }
    }
  });
  els.wordList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-row-action]");
    if (!button) {
      return;
    }
    if (button.dataset.rowAction === "load-more") {
      state.wordListLimit = Math.min((state.wordListLimit || 40) + 40, filteredWords().length);
      renderWordList();
      return;
    }
    const row = button.closest("[data-id]");
    if (!row) {
      return;
    }
    if (button.dataset.rowAction === "study") {
      setStudyMode("all");
      setActiveId(row.dataset.id);
      state.answerVisible = false;
      resetTypingState();
      state.lastAutoSpokenId = null;
      render();
    }
    if (button.dataset.rowAction === "important") {
      if (!guardEditable()) {
        return;
      }
      const word = state.words.find((item) => item.id === row.dataset.id);
      if (word) {
        word.important = !word.important;
        word.updatedAt = new Date().toISOString();
        saveWords();
        render();
      }
    }
    if (button.dataset.rowAction === "delete") {
      deleteWord(row.dataset.id);
    }
  });
  els.groupProgress.addEventListener("click", (event) => {
    const filterBtn = event.target.closest('[data-progress-filter]');
    if (filterBtn) {
      progressGroupFilter = filterBtn.dataset.progressFilter || "全部";
      renderGroupProgress();
      return;
    }
    const card = event.target.closest('[data-group-action="study"]');
    if (!card) {
      return;
    }
    const picked = card.dataset.group || "all";
    if (picked.startsWith("__root__")) {
      state.activeGroup = picked.replace("__root__", "");
    } else {
      state.activeGroup = picked;
    }
    state.wordListLimit = 40;
    state.mode = "all";
    state.practiceMode = "card";
    ensurePracticeSession("card");
    setActiveId(null);
    state.answerVisible = false;
    resetTypingState();
    state.lastAutoSpokenId = null;
    chooseActiveWord(true);
    render();
    activateModuleFromApp("study");
    showToast(state.activeGroup === "all" ? "已切回全部词库，已进入卡片" : `只背 ${state.activeGroup}，已进入卡片`);
  });
  els.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    state.wordListLimit = 40;
    renderWordList();
  });
  els.statusFilter.addEventListener("change", (event) => {
    state.filter = event.target.value;
    state.wordListLimit = 40;
    renderWordList();
  });
  els.librarySourceFilter.addEventListener("change", (event) => {
    state.librarySourceFilter = event.target.value;
    state.wordListLimit = 40;
    renderWordList();
  });
  els.listMaskMode.addEventListener("change", (event) => {
    state.listMaskMode = LIST_MASK_MODES.includes(event.target.value) ? event.target.value : "show";
    renderWordList();
  });
  els.cloudSyncButton?.addEventListener("click", openCloudDialog);
  els.closeCloudButton?.addEventListener("click", closeCloudDialog);
  els.cancelCloudButton?.addEventListener("click", closeCloudDialog);
  els.cloudSlugInput?.addEventListener("blur", () => {
    els.cloudSlugInput.value = normalizeCloudSlug(els.cloudSlugInput.value);
  });
  els.supabaseUrlInput?.addEventListener("blur", () => {
    const normalized = normalizeSupabaseUrl(els.supabaseUrlInput.value);
    if (normalized) {
      els.supabaseUrlInput.value = normalized;
    }
    saveSupabaseSettingsFromDialog();
  });
  els.supabaseKeyInput?.addEventListener("blur", () => {
    els.supabaseKeyInput.value = normalizeText(els.supabaseKeyInput.value);
    saveSupabaseSettingsFromDialog();
  });
  els.shareBaseUrlInput?.addEventListener("blur", () => {
    els.shareBaseUrlInput.value = normalizeShareBaseUrl(els.shareBaseUrlInput.value);
    try {
      localStorage.setItem(SHARE_BASE_URL_KEY, els.shareBaseUrlInput.value);
    } catch {
      // The link can still be copied even if the browser refuses storage.
    }
  });
  els.cloudForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const config = readCloudFormConfig();
    if (EDITOR_VIEW_SLUG && !state.cloud.canEdit) {
      await connectSharedEditCloud();
      return;
    }
    saveLocalCloudSettingsOnly(config, { silent: true, closeDialog: false });
    setCloudStatus("正在保存到云端……本机记录已先保存。", "");
    const ok = await saveCloudNow({ config: { ...config, autoSync: true } });
    if (ok) {
      closeCloudDialog();
    }
  });
  els.localSaveButton?.addEventListener("click", () => {
    const config = readCloudFormConfig();
    saveLocalCloudSettingsOnly(config);
  });
  els.tryCloudSaveButton?.addEventListener("click", async () => {
    const config = readCloudFormConfig();
    saveLocalCloudSettingsOnly(config, { silent: true, closeDialog: false });
    setCloudStatus("正在检查并保存到云端……本机记录已先保存。", "");
    const ok = await saveCloudNow({ config: { ...config, autoSync: true } });
    if (ok) {
      closeCloudDialog();
    }
  });
  els.loadCloudButton?.addEventListener("click", async () => {
    const config = readCloudFormConfig();
    await loadCloudToLocal({ slug: config.slug, pin: config.pin });
  });
  els.copyPublicLinkButton?.addEventListener("click", copyPublicLink);
  els.copyEditLinkButton?.addEventListener("click", copyEditLink);
  els.importButton.addEventListener("click", () => els.importInput.click());
  els.importInput.addEventListener("change", importWords);
  els.exportButton.addEventListener("click", exportWords);
  els.copyPlanButton.addEventListener("click", copyPlan);
  els.examDateInput.addEventListener("change", (event) => {
    state.settings.examDate = event.target.value || defaultExamDate();
    saveSettings();
    renderDashboard();
  });
  els.dictationOrderSelect?.addEventListener("change", (event) => {
    state.dictationOrder = event.target.value;
    setActiveId(null);
    state.answerVisible = false;
    resetTypingState();
    state.lastAutoSpokenId = null;
    render();
  });
  document.querySelectorAll("[data-practice-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      switchPracticeMode(button.dataset.practiceMode);
    });
  });
  els.startNewButton.addEventListener("click", startNewWords);
  els.batchLearnButton.addEventListener("click", batchLearnNewWords);
  els.sprintButton.addEventListener("click", startSprint);
  els.weakOnlyButton?.addEventListener("click", () => setMode("weak"));
  els.focusDueButton.addEventListener("click", () => setMode("due"));
  els.dueModeButton.addEventListener("click", () => setMode("due"));
  els.newModeButton.addEventListener("click", () => setMode("new"));
  els.allModeButton.addEventListener("click", () => setMode("all"));
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {
        // Offline support is progressive; a registration failure must not block study.
      });
    }, { once: true });
  }
}

function resetWordLearningProgressForBrowseQuiz(id, options = {}) {
  const word = state.words.find((item) => String(item.id) === String(id));
  if (!word) return { ok: false, reason: "not-found" };
  if (!guardEditable()) return { ok: false, reason: "read-only" };
  const resetAt = new Date().toISOString();
  word.mastery = "未学";
  word.status = "new";
  word.stage = -1;
  word.nextReviewAt = "";
  word.lastStudiedAt = resetAt;
  word.updatedAt = resetAt;
  word.history = [];
  word.progress = normalizeModeProgress(word);
  PROGRESS_MODES.forEach((mode) => {
    word.progress[mode] = {
      status: "new",
      stage: -1,
      nextReviewAt: "",
      lastStudiedAt: resetAt,
      resetAt,
      history: [],
    };
  });
  memoryLabStore.metrics[word.id] = {
    recognition: normalizeAbilityStat(),
    spelling: normalizeAbilityStat(),
    confusedWith: {},
    resetAt,
    updatedAt: resetAt,
  };
  if (Array.isArray(memoryLabStore.flow?.recentIds)) {
    memoryLabStore.flow.recentIds = memoryLabStore.flow.recentIds.filter((wordId) => String(wordId) !== String(word.id));
  }
  saveMemoryLabStore();
  reconcileDailyCompletedWord(word);
  saveDailyCompletedStore();
  saveWords({ immediate: true });
  return { ok: true, id: word.id, resetAt, reason: normalizeText(options.reason || "browse-quiz-wrong") };
}

window.WordMemoryApp = {
  getWords: () => state.words,
  getWord: (id) => state.words.find((word) => word.id === id) || null,
  getMemoryLab: () => normalizeMemoryLabStore(memoryLabStore),
  getAbility: (id) => wordAbilitySummary(state.words.find((word) => word.id === id) || { id }),
  getQuickSession: quickSessionSnapshot,
  getTodayWrongIds: todayWrongWordIds,
  startQuickSession,
  stopQuickSession: () => finishQuickSession("manual"),
  tickQuickSession,
  openMobileFocus: (mode = "recall") => {
    if (!mobileFocusController) initializeMobileFocus();
    mobileFocusController?.open?.();
    mobileFocusController?.setMode?.(["recall", "choice", "spelling"].includes(mode) ? mode : "recall");
  },
  setMiniRecapEnabled: (enabled) => {
    memoryLabStore.flow.autoMiniRecap = Boolean(enabled);
    saveMemoryLabStore();
    saveWords();
    notifyMemoryLab();
  },
  openWord: (id) => {
    const word = state.words.find((item) => item.id === id);
    if (!word) return false;
    state.quickSession.active = false;
    state.practiceMode = "card";
    state.mode = "all";
    state.activeGroup = "all";
    setActiveId(id);
    state.answerVisible = false;
    resetTypingState();
    render();
    try { history.replaceState(null, "", "#study"); } catch { location.hash = "study"; }
    document.querySelector('[data-module-target="study"]')?.click?.();
    return true;
  },
  speakWord: (id) => { const word = state.words.find((item) => item.id === id); if (word) speakTerm(word.term, { accent: "us" }); },
  wordSources,
  wordGroupNames,
  wordFamilyStem,
  statusOf,
  weakScore,
  priorityOf,
  meaningSegments,
  escapeHTML,
  save: () => saveWords({ immediate: true }),
  resetWordLearningProgress: (id, options = {}) => resetWordLearningProgressForBrowseQuiz(id, options),
};

// 打开页面默认使用卡片模式；同时恢复上次保存的卡片筛选、分组和当前位置。
state.practiceMode = "card";
ensurePracticeSession("card").mode = state.mode;
ensurePracticeSession("card").activeId = state.activeId;

wireEvents();
initializeMobileFocus();
registerServiceWorker();
installStudyTimeTracker();
render();
hydrateWordsFromMobileDatabase();
initializeCloudFromUrl();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && mobileDbHydrated) {
    saveWords({ skipCloud: true, immediate: true });
  }
});
window.addEventListener("pagehide", () => {
  if (mobileDbHydrated) saveWords({ skipCloud: true, immediate: true });
});
window.addEventListener("beforeunload", () => {
  if (mobileDbHydrated) flushBufferedWordSave({ skipCloud: true, force: true });
});
let periodicHeavyRefreshTicks = 0;
setInterval(() => {
  tickStudyTime();
  tickQuickSession();
  renderClock();
  renderSprintStatus();
  periodicHeavyRefreshTicks += 1;
  // 长列表和分组统计不再每30秒强制重绘；每2分钟在空闲时刷新一次。
  if (periodicHeavyRefreshTicks >= 4) {
    periodicHeavyRefreshTicks = 0;
    scheduleBackgroundRender();
  }
}, 30 * 1000);
