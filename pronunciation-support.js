(function () {
  'use strict';
  const clean = s => String(s || '').trim().toLowerCase();
  const local = term => window.WORD_MEMORY_LOCAL_IPA?.[clean(term)] || '';
  const processed = new WeakSet();
  function scan() {
    document.querySelectorAll('[data-ipa-term]').forEach(el => {
      if (processed.has(el)) return;
      processed.add(el);
      el.textContent = local(el.dataset.ipaTerm);
    });
  }
  window.PronunciationSupport = {local,lookup:async term=>local(term)};
  new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
  scan();
}());
