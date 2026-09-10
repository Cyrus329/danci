/* B148: one transient spelling gate; no independent learning store. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TranslationSpelling = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  function normalize(value) {
    return String(value || '').normalize('NFKC').toLowerCase().replace(/[’‘`]/g, "'")
      .replace(/\b(sb|sth)\s*\./g, '$1').replace(/[^a-z0-9'\s-]/g, ' ')
      .replace(/\b(somebody|someone)\b/g, 'sb').replace(/\bsomething\b/g, 'sth')
      .replace(/\s+/g, ' ').trim();
  }
  function createAttempt(answers) {
    const accepted = new Set(answers.map(normalize).filter(Boolean));
    let phase = 'typing';
    return {
      check(value) {
        if (phase !== 'typing') return false;
        const correct = accepted.has(normalize(value));
        phase = correct ? 'passed' : 'feedback';
        return correct;
      },
      retry() { if (phase === 'feedback') phase = 'typing'; },
      phase: () => phase,
    };
  }
  let active = null;
  function request(options) {
    if (active) return Promise.resolve(false);
    const doc = root.document;
    if (!doc?.createElement) return Promise.resolve(false);
    return new Promise(resolve => {
      const dialog = doc.createElement('dialog');
      dialog.className = 'translation-spelling-dialog';
      dialog.setAttribute('aria-labelledby', 'translationSpellingTitle');
      dialog.innerHTML = `<form novalidate>
        <p class="translation-spelling-kicker">四级翻译 · 必过拼写</p>
        <h2 id="translationSpellingTitle">拼对，才记完</h2>
        <p class="translation-spelling-meaning"></p>
        <p class="translation-spelling-tip">请拼出刚才的英文。拼写通过后，才完成这次复习。</p>
        <label for="translationSpellingInput">英文单词／短语</label>
        <input id="translationSpellingInput" type="text" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="done">
        <p class="translation-spelling-feedback" role="status" aria-live="polite"></p>
        <div class="translation-spelling-buttons"><button class="primary-button" type="submit">检查拼写</button><button class="secondary-button" type="button" data-cancel>暂不记完</button></div>
      </form>`;
      const form = dialog.querySelector('form'), input = dialog.querySelector('input');
      const feedback = dialog.querySelector('.translation-spelling-feedback'), submit = dialog.querySelector('[type="submit"]');
      dialog.querySelector('.translation-spelling-meaning').textContent = options.meaning || '请回想刚才的词义';
      const attempt = createAttempt(options.answers || [options.term]);
      const previousFocus = doc.activeElement;
      const background = Array.from(doc.body.children).filter(el => !['SCRIPT','STYLE','LINK'].includes(el.tagName))
        .map(el => ({el, inert:el.inert}));
      let finished = false;
      const finish = passed => {
        if (finished) return;
        finished = true;
        active = null;
        dialog.close?.(); dialog.remove();
        background.forEach(({el,inert}) => { el.inert = inert; });
        doc.body.classList.remove('translation-spelling-open');
        previousFocus?.focus?.({preventScroll:true});
        resolve(passed);
      };
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (event.isComposing || attempt.phase() === 'passed') return;
        if (attempt.phase() === 'feedback') {
          attempt.retry(); input.disabled = false; input.value = ''; feedback.textContent = '';
          submit.textContent = '检查拼写'; input.focus(); return;
        }
        if (!input.value.trim()) { feedback.textContent = '请先输入英文。'; input.focus(); return; }
        if (attempt.check(input.value)) { finish(true); return; }
        input.disabled = true;
        feedback.textContent = `还没有拼对。正确写法：${options.term}`;
        submit.textContent = '收起答案，重新拼写'; submit.focus();
      });
      dialog.querySelector('[data-cancel]').addEventListener('click', () => finish(false));
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
      dialog.addEventListener('close', () => finish(false));
      // Keep modal keys out of the main card / one-word keyboard shortcuts.
      dialog.addEventListener('keydown', event => { if (event.key === 'Enter' && event.isComposing) event.preventDefault(); event.stopPropagation(); });
      dialog.addEventListener('keyup', event => event.stopPropagation());
      doc.body.append(dialog); active = {cancel:() => finish(false)};
      background.forEach(({el}) => { el.inert = true; });
      doc.body.classList.add('translation-spelling-open');
      try { dialog.showModal(); input.focus(); } catch { finish(false); }
    });
  }
  return {normalize, createAttempt, request, isOpen:() => Boolean(active), cancel:() => active?.cancel()};
});
