(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WordContextStudyEngine = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function normalizeText(value) {
    return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  }

  function legacyContextSentenceKey(term, sentence) {
    const source = `${normalizeText(term).toLowerCase()}|${normalizeText(sentence).toLowerCase()}`;
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `ctx-${(hash >>> 0).toString(36)}`;
  }

  function stableContextKey(view) {
    const contextId = normalizeText(view && view.contextId);
    return contextId ? `ctxid:${contextId}` : '';
  }

  function resolveContextStudyEntry(store, word, view) {
    const source = store && typeof store === 'object' ? store : {};
    const stableKey = stableContextKey(view);
    const sentences = [
      normalizeText(view && view.sentenceText),
      normalizeText(view && view.legacySentenceText),
    ].filter((sentence, index, all) => sentence && all.indexOf(sentence) === index);
    const legacyKeys = sentences.map((sentence) => (
      legacyContextSentenceKey(word && word.term, sentence)
    ));
    const matchedLegacyKey = legacyKeys.find((candidate) => source[candidate]) || legacyKeys[0] || '';
    const key = stableKey || matchedLegacyKey;
    let migrated = false;
    if (stableKey && !source[stableKey] && matchedLegacyKey && source[matchedLegacyKey]) {
      source[stableKey] = {
        ...source[matchedLegacyKey],
        contextId: normalizeText(view.contextId),
      };
      delete source[matchedLegacyKey];
      migrated = true;
    }
    return {
      key,
      legacyKey: matchedLegacyKey,
      value: source[key] || null,
      migrated,
    };
  }

  return {
    normalizeText,
    legacyContextSentenceKey,
    stableContextKey,
    resolveContextStudyEntry,
  };
});
