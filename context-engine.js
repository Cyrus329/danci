(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WordContextEngine = api;
})(typeof window !== 'undefined' ? window : undefined, function () {
  const POS_VALUES = new Set(['noun', 'verb', 'adjective', 'adverb', 'numeral', 'phrase', 'other']);
  const HTML_PATTERN = /<[^>]*>/;
  const ITEM_CHARACTERS = "A-Za-z0-9_'’\\-‐‑–—";

  function normalizeContextKey(value) {
    return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function findExactTarget(sentence, target) {
    const source = String(sentence == null ? '' : sentence);
    const needle = String(target == null ? '' : target).trim();
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    if (!escaped) return null;
    const result = new RegExp('(^|[^' + ITEM_CHARACTERS + '])(' + escaped + ')(?=$|[^' + ITEM_CHARACTERS + '])', 'i').exec(source);
    if (!result) return null;
    const index = result.index + result[1].length;
    return {
      before: source.slice(0, index),
      match: result[2],
      after: source.slice(index + result[2].length),
    };
  }

  function splitTarget(sentence, target) {
    return findExactTarget(sentence, target);
  }

  function clozeTarget(target) {
    return normalizeContextKey(target).split(' ').filter(Boolean).map((word) => '_'.repeat(word.length)).join(' ');
  }

  function hasExactTarget(sentence, target) {
    return Boolean(findExactTarget(sentence, target));
  }

  function validateContextRecord(record) {
    const errors = [];
    const value = record && typeof record === 'object' ? record : {};
    const fields = ['sentence', 'target', 'translation', 'sense', 'pos'];
    fields.forEach((field) => {
      if (typeof value[field] !== 'string' || !value[field].trim()) errors.push(field + ' is required');
    });

    if (typeof value.sentence === 'string' && HTML_PATTERN.test(value.sentence)) errors.push('sentence must not contain HTML');
    if (typeof value.translation === 'string' && HTML_PATTERN.test(value.translation)) errors.push('translation must not contain HTML');
    if (typeof value.pos === 'string' && value.pos.trim() && !POS_VALUES.has(value.pos.trim())) errors.push('pos is not supported');
    if (typeof value.sentence === 'string' && typeof value.target === 'string' && value.sentence.trim() && value.target.trim() && !hasExactTarget(value.sentence, value.target)) {
      errors.push('target must appear as a complete item in sentence');
    }

    return { valid: errors.length === 0, errors };
  }

  function studyMode(mastery) {
    return Number(mastery) < 0 ? 'learn' : 'review';
  }

  function contextEntry(entry) {
    if (!entry || typeof entry !== 'object' || !validateContextRecord(entry.primary).valid) return null;
    const extra = Array.isArray(entry.extra) ? entry.extra.filter((record) => validateContextRecord(record).valid) : [];
    return { primary: entry.primary, extra };
  }

  function getContexts(term, library) {
    const key = normalizeContextKey(term);
    const collection = library && typeof library === 'object' ? library : {};
    const entryKey = Object.keys(collection).find((candidate) => normalizeContextKey(candidate) === key);
    return contextEntry(entryKey ? collection[entryKey] : null);
  }

  function getContextsForWord(word, idLibrary, termLibrary) {
    const value = word && typeof word === 'object' ? word : { term: word };
    const id = String(value.id == null ? '' : value.id).trim();
    const byId = idLibrary && typeof idLibrary === 'object' ? idLibrary : {};
    const fromId = id ? contextEntry(byId[id]) : null;
    if (fromId) return fromId;
    const term = String(value.term == null ? '' : value.term).trim();
    return term ? getContexts(term, termLibrary) : null;
  }

  return {
    normalizeContextKey,
    splitTarget,
    clozeTarget,
    validateContextRecord,
    studyMode,
    getContexts,
    getContextsForWord,
  };
});
