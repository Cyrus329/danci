(function (root, factory) {
  const api = factory(root && root.WordContextEngine, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WordContextPresenter = api;
})(typeof window !== 'undefined' ? window : globalThis, function (engine, root) {
  'use strict';

  const POS_LABELS = {
    noun: '名词',
    verb: '动词',
    adjective: '形容词',
    adverb: '副词',
    numeral: '数词',
    phrase: '短语',
    other: '其他',
  };
  const LEVEL_LABELS = {
    basic: '基础',
    intermediate: '进阶',
    advanced: '高阶',
  };

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character]);
  }

  function contextsFor(wordOrTerm, options = {}) {
    const word = wordOrTerm && typeof wordOrTerm === 'object'
      ? wordOrTerm
      : { term: wordOrTerm };
    const optionShape = options && typeof options === 'object'
      && ('library' in options || 'idLibrary' in options || 'index' in options || 'concealed' in options);
    const legacyLibrary = !optionShape
      && options
      && typeof options === 'object'
      && Object.keys(options).length
      ? options
      : null;
    const termSource = optionShape
      ? options.library
      : legacyLibrary;
    const termLibrary = termSource && typeof termSource === 'object'
      ? termSource
      : (root && root.WORD_MEMORY_CONTEXTS);
    const idLibrary = optionShape && options.idLibrary && typeof options.idLibrary === 'object'
      ? options.idLibrary
      : (root && root.WORD_MEMORY_CONTEXTS_BY_ID);
    if (!engine) return { records: [] };
    const found = typeof engine.getContextsForWord === 'function'
      ? engine.getContextsForWord(word, idLibrary, termLibrary)
      : engine.getContexts(word.term, termLibrary);
    return found ? { records: [found.primary, ...found.extra] } : { records: [] };
  }

  function sentenceParts(record, concealed = false) {
    if (!engine || typeof engine.splitTarget !== 'function') return null;
    const value = record && typeof record === 'object' ? record : {};
    const split = engine.splitTarget(value.sentence, value.target);
    if (!split) return null;
    return {
      before: escapeHTML(split.before),
      target: escapeHTML(concealed ? engine.clozeTarget(value.target) : split.match),
      after: escapeHTML(split.after),
      concealed: Boolean(concealed),
    };
  }

  function labels(record) {
    const value = record && typeof record === 'object' ? record : {};
    return {
      pos: POS_LABELS[String(value.pos || '').trim()] || '词条',
      level: LEVEL_LABELS[String(value.level || '').trim()] || '原词库',
    };
  }

  function normalizeIndex(index, count) {
    if (!count) return 0;
    const number = Number.isFinite(Number(index)) ? Math.trunc(Number(index)) : 0;
    return ((number % count) + count) % count;
  }

  function contextPolicy(mode, answerVisible = false, revealStep = 0) {
    const name = String(mode || 'card');
    const answered = Boolean(answerVisible);
    if (name === 'threeStep') {
      const revealed = Number(revealStep) >= 2;
      return {
        showSentence: revealed,
        concealed: false,
        showTranslation: revealed,
      };
    }
    if (name === 'dictation' || name === 'dictationWeak') {
      return {
        showSentence: answered,
        concealed: false,
        showTranslation: answered,
      };
    }
    const concealed = !answered && [
      'zhToEn',
      'choiceZhToEn',
      'phrase',
      'spell',
      'spellingWeak',
    ].includes(name);
    const clueMode = ['zhToEn', 'choiceZhToEn', 'phrase', 'spell', 'spellingWeak'].includes(name);
    return {
      showSentence: true,
      concealed,
      showTranslation: answered || clueMode,
    };
  }

  function viewFor(wordOrTerm, options = {}) {
    const found = contextsFor(wordOrTerm, options);
    const word = wordOrTerm && typeof wordOrTerm === 'object' ? wordOrTerm : null;
    const count = found.records.length;
    if (!count) return { available: false, index: 0, count: 0 };
    const index = normalizeIndex(options.index, count);
    const record = found.records[index];
    const parts = sentenceParts(record, options.concealed);
    if (!parts) return { available: false, index: 0, count: 0 };
    const displayLabels = labels(record);
    return {
      available: true,
      index,
      count,
      sentence: parts,
      sentenceText: String(record.sentence || ""),
      legacySentenceText: String(record.legacySentence || ""),
      targetText: String(record.target || ""),
      contextId: String(
        record.contextId
        || (word && word.id ? `${word.id}:${index === 0 ? 'primary' : `extra-${index}`}` : ''),
      ),
      translationText: String(record.translation || ""),
      translation: escapeHTML(record.translation),
      sense: escapeHTML(record.sense),
      pos: String(record.pos || ''),
      level: String(record.level || ''),
      posLabel: displayLabels.pos,
      levelLabel: displayLabels.level,
      source: escapeHTML(record.source),
      contextKind: escapeHTML(record.contextKind),
    };
  }

  return {
    escapeHTML,
    contextsFor,
    sentenceParts,
    labels,
    normalizeIndex,
    contextPolicy,
    viewFor,
  };
});
