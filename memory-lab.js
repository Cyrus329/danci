(function () {
  'use strict';

  const api = window.WordMemoryApp;
  if (!api) return;

  const byId = (id) => document.getElementById(id);
  const escapeHTML = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, ' ');

  const els = {
    panel: byId('memoryLabPanel'),
    miniToggle: byId('miniRecapToggle'),
    todayErrorCount: byId('todayErrorCount'),
    sessionStatus: byId('quickSessionStatus'),
    ability: byId('abilityOverviewContent'),
    recent: byId('recentTenContent'),
    confusion: byId('confusionGroups'),
    families: byId('wordFamilyGroups'),
    report: byId('memoryLabReport'),
    sprintSource: byId('examSprintSource'),
    browsePanel: byId('quickBrowserPanel'),
    browseTotal: byId('quickBrowserTotal'),
    browseSearch: byId('quickBrowseSearch'),
    browseSource: byId('quickBrowseSource'),
    browseStatus: byId('quickBrowseStatus'),
    browseSort: byId('quickBrowseSort'),
    browseMask: byId('quickBrowseMask'),
    browsePageSize: byId('quickBrowsePageSize'),
    browseAlphabet: byId('quickBrowseAlphabet'),
    browseSummary: byId('quickBrowserSummary'),
    browseList: byId('quickBrowserList'),
    browsePagination: byId('quickBrowserPagination'),
  };

  const browseState = {
    query: '',
    source: 'all',
    status: 'all',
    sort: 'original',
    mask: 'show',
    pageSize: 200,
    page: 1,
    letter: 'all',
  };


  function resetBrowserScroll() {
    if (els.browseList) els.browseList.scrollTop = 0;
  }

  function allWords() {
    return Array.isArray(api.getWords()) ? api.getWords() : [];
  }

  function wordSourcesAndGroups(word) {
    return [...new Set([
      ...(api.wordSources?.(word) || []),
      ...(api.wordGroupNames?.(word) || []),
    ].map((item) => String(item || '').trim()).filter(Boolean))];
  }

  function cardProgress(word) {
    return word?.progress?.card || word || {};
  }

  function isDue(word) {
    const at = cardProgress(word).nextReviewAt;
    return Boolean(at && Date.parse(at) <= Date.now());
  }

  function lastStudiedMs(word) {
    const progress = cardProgress(word);
    return Date.parse(progress.lastStudiedAt || word.lastStudiedAt || '') || 0;
  }

  function abilityFor(word) {
    return api.getAbility?.(word.id) || {
      recognition: { score: 0, correct: 0, wrong: 0, slow: 0 },
      spelling: { score: 0, correct: 0, wrong: 0, slow: 0 },
      recognitionLabel: '薄弱',
      spellingLabel: '薄弱',
    };
  }

  function selectionRank(word) {
    const ability = abilityFor(word);
    const recognitionWeakness = 100 - Number(ability.recognition.score || 0);
    const spellingWeakness = 100 - Number(ability.spelling.score || 0);
    const staleDays = lastStudiedMs(word) ? Math.min(30, (Date.now() - lastStudiedMs(word)) / 86400000) : 30;
    return Number(api.weakScore?.(word) || 0)
      + (word.important ? 45 : 0)
      + (isDue(word) ? 35 : 0)
      + recognitionWeakness * 0.35
      + spellingWeakness * 0.25
      + staleDays;
  }

  function sourceMatches(word, source) {
    if (!source || source === 'all') return true;
    return wordSourcesAndGroups(word).some((item) => item === source || item.startsWith(`${source} `));
  }

  function rapidCandidates(count, source = 'all') {
    return allWords()
      .filter((word) => sourceMatches(word, source))
      .sort((a, b) => selectionRank(b) - selectionRank(a) || normalize(a.term).localeCompare(normalize(b.term)))
      .slice(0, count);
  }

  function startSession(config) {
    const ok = api.startQuickSession(config);
    if (ok) render();
  }

  function startRapid(minutes) {
    const count = Math.max(12, minutes * 6);
    const words = rapidCandidates(count);
    startSession({
      type: `rapid-${minutes}`,
      label: `${minutes}分钟极速复习`,
      ids: words.map((word) => word.id),
      durationSeconds: minutes * 60,
      questionModes: ['choice'],
    });
  }

  function startSprint(count) {
    const source = els.sprintSource?.value || 'all';
    const words = rapidCandidates(count, source);
    startSession({
      type: `exam-sprint-${count}`,
      label: `${count}词临考冲刺`,
      ids: words.map((word) => word.id),
      questionModes: ['choice', 'spelling', 'recall'],
      emptyMessage: '当前范围没有可冲刺的词条',
    });
  }

  function startTodayErrors() {
    const ids = api.getTodayWrongIds?.() || [];
    startSession({
      type: 'today-errors',
      label: '今日错词回炉',
      ids,
      questionModes: ['choice', 'spelling'],
      emptyMessage: '今天暂时没有错词或模糊词',
    });
  }

  function startRecentTen() {
    const store = api.getMemoryLab();
    const ids = (store.flow?.recentIds || []).filter((id) => api.getWord?.(id));
    startSession({
      type: 'recent-ten',
      label: '最近10词复盘',
      ids,
      questionModes: ['choice', 'spelling', 'choice'],
      emptyMessage: '还没有足够的最近学习记录',
    });
  }

  function startExtreme30() {
    const words = rapidCandidates(24);
    startSession({
      type: 'speed-30',
      label: '30秒极限识词',
      ids: words.map((word) => word.id),
      durationSeconds: 30,
      questionModes: ['choice'],
    });
  }

  function handleMemoryAction(action) {
    if (action === 'today-errors') return startTodayErrors();
    if (action === 'rapid-3') return startRapid(3);
    if (action === 'rapid-5') return startRapid(5);
    if (action === 'rapid-10') return startRapid(10);
    if (action === 'speed-30') return startExtreme30();
    if (action === 'recent-10') return startRecentTen();
    if (action === 'stop-session') return api.stopQuickSession?.();
    if (action.startsWith('sprint-')) return startSprint(Number(action.split('-')[1]) || 50);
  }

  function renderSessionStatus() {
    if (!els.sessionStatus) return;
    const session = api.getQuickSession();
    if (!session.active && !session.ending) {
      els.sessionStatus.innerHTML = '<div class="quick-session-idle"><strong>当前没有快速复习任务</strong><span>从上方选择错词回炉、极速复习或临考冲刺。</span></div>';
      return;
    }
    const endMs = Date.parse(session.endsAt || '');
    const remainingSeconds = endMs ? Math.max(0, Math.ceil((endMs - Date.now()) / 1000)) : null;
    const totalAnswered = session.correct + session.wrong;
    const rate = totalAnswered ? Math.round((session.correct / totalAnswered) * 100) : 0;
    els.sessionStatus.innerHTML = `
      <div class="quick-session-live">
        <div><span>正在进行</span><strong>${escapeHTML(session.label)}</strong><small>${escapeHTML(session.questionMode === 'spelling' ? '看中文拼英文' : (session.questionMode === 'choice' ? '看英文选中文' : '看英文想中文'))}</small></div>
        <div><span>剩余</span><strong>${session.remaining}</strong><small>词</small></div>
        <div><span>已完成</span><strong>${session.completed}</strong><small>正确率 ${rate}%</small></div>
        ${remainingSeconds == null ? '' : `<div><span>倒计时</span><strong>${remainingSeconds}s</strong><small>到时自动结束</small></div>`}
        <button type="button" data-memory-action="stop-session">结束本轮</button>
      </div>`;
  }

  function renderAbilityOverview() {
    if (!els.ability) return;
    const words = allWords();
    const summaries = words.map(abilityFor);
    const testedRecognition = summaries.filter((item) => item.recognition.correct + item.recognition.wrong > 0);
    const testedSpelling = summaries.filter((item) => item.spelling.correct + item.spelling.wrong > 0);
    const avg = (items, key) => items.length ? Math.round(items.reduce((sum, item) => sum + Number(item[key].score || 0), 0) / items.length) : 0;
    const recognitionAverage = avg(testedRecognition, 'recognition');
    const spellingAverage = avg(testedSpelling, 'spelling');
    const recognitionWeak = testedRecognition.filter((item) => item.recognition.score < 55).length;
    const spellingWeak = testedSpelling.filter((item) => item.spelling.score < 55).length;
    els.ability.innerHTML = `
      <div class="ability-overview-bars">
        <article><div><span>认识度平均</span><strong>${recognitionAverage}</strong></div><i style="--ability:${recognitionAverage}%"></i><p>已测试 ${testedRecognition.length} 词 · 薄弱 ${recognitionWeak} 词</p></article>
        <article><div><span>拼写度平均</span><strong>${spellingAverage}</strong></div><i style="--ability:${spellingAverage}%"></i><p>已测试 ${testedSpelling.length} 词 · 薄弱 ${spellingWeak} 词</p></article>
      </div>
      <p class="ability-explain">四选一和回想提升认识度；看中文拼英文提升拼写度。两项分别记录，但仍属于同一词条和同一学习进度。</p>`;
  }

  function renderRecentTen() {
    if (!els.recent) return;
    const store = api.getMemoryLab();
    const words = (store.flow?.recentIds || []).map((id) => api.getWord?.(id)).filter(Boolean).slice(-10).reverse();
    if (!words.length) {
      els.recent.innerHTML = '<p class="empty-inline">完成学习动作后，这里会显示最近10个词。</p>';
      return;
    }
    els.recent.innerHTML = `<div class="recent-word-chips">${words.map((word) => {
      const ability = abilityFor(word);
      return `<button type="button" data-open-word="${escapeHTML(word.id)}"><b>${escapeHTML(word.term)}</b><span>识${ability.recognition.score} / 拼${ability.spelling.score}</span></button>`;
    }).join('')}</div>`;
  }

  const fixedConfusionSets = [
    ['adapt', 'adopt'],
    ['affect', 'effect'],
    ['rise', 'raise', 'arise'],
    ['quiet', 'quite'],
    ['beside', 'besides'],
    ['economic', 'economical'],
    ['dominate', 'dominant', 'dominance', 'domination'],
    ['apparent', 'apparently', 'obvious', 'obviously'],
    ['propose', 'proposal', 'proposition'],
    ['position', 'opposition', 'opponent', 'opposite'],
    ['mature', 'maturity'],
    ['compose', 'composer', 'composition', 'component'],
    ['transparent', 'transparency', 'apparent', 'apparently'],
    ['surround', 'surroundings', 'surface'],
  ];

  function renderComparisonGroup(words, type, index) {
    const ids = words.map((word) => word.id).join(',');
    return `<article class="comparison-group">
      <div>${words.map((word) => `<p><b>${escapeHTML(word.term)}</b><span>${escapeHTML(api.meaningSegments?.(word.meaning)?.[0] || word.meaning || '未填释义')}</span></p>`).join('')}</div>
      <button type="button" data-start-group="${escapeHTML(ids)}" data-group-type="${escapeHTML(type)}">连续复习</button>
    </article>`;
  }

  function renderConfusions() {
    if (!els.confusion) return;
    const termMap = new Map(allWords().map((word) => [normalize(word.term), word]));
    const groups = fixedConfusionSets
      .map((set) => set.map((term) => termMap.get(term)).filter(Boolean))
      .filter((group) => group.length >= 2)
      .slice(0, 8);
    if (!groups.length) {
      els.confusion.innerHTML = '<p class="empty-inline">当前词库暂未匹配到预设易混词组。</p>';
      return;
    }
    els.confusion.innerHTML = groups.map((group, index) => renderComparisonGroup(group, `confusion-${index}`, index)).join('');
  }

  function renderFamilies() {
    if (!els.families) return;
    const groups = new Map();
    allWords().forEach((word) => {
      const stem = api.wordFamilyStem?.(word) || '';
      if (!stem || stem.length < 4 || /\s/.test(word.term || '')) return;
      if (!groups.has(stem)) groups.set(stem, []);
      const list = groups.get(stem);
      if (!list.some((item) => normalize(item.term) === normalize(word.term))) list.push(word);
    });
    const families = [...groups.entries()]
      .filter(([, words]) => words.length >= 3)
      .sort((a, b) => {
        const aWeak = a[1].reduce((sum, word) => sum + selectionRank(word), 0);
        const bWeak = b[1].reduce((sum, word) => sum + selectionRank(word), 0);
        return bWeak - aWeak || b[1].length - a[1].length;
      })
      .slice(0, 8)
      .map(([, words]) => words.slice(0, 6));
    if (!families.length) {
      els.families.innerHTML = '<p class="empty-inline">词族数据不足，后续导入同词根词后会自动出现。</p>';
      return;
    }
    els.families.innerHTML = families.map((group, index) => renderComparisonGroup(group, `family-${index}`, index)).join('');
  }

  function renderReport() {
    if (!els.report) return;
    const store = api.getMemoryLab();
    const report = (store.reports || []).slice(-1)[0];
    if (!report) {
      els.report.innerHTML = '<p class="empty-inline">完成一次快速复习后，这里会显示正确、错误、用时和需要再复习的词。</p>';
      return;
    }
    const total = report.correct + report.wrong;
    const rate = total ? Math.round((report.correct / total) * 100) : 0;
    const weakWords = (report.weakIds || []).map((id) => api.getWord?.(id)).filter(Boolean);
    els.report.innerHTML = `
      <div class="memory-report-grid">
        <article><span>模式</span><strong>${escapeHTML(report.label || report.type)}</strong></article>
        <article><span>完成</span><strong>${report.completed}</strong><small>词</small></article>
        <article><span>正确率</span><strong>${rate}%</strong><small>${report.correct}对 / ${report.wrong}错</small></article>
        <article><span>用时</span><strong>${Math.floor(report.durationSeconds / 60)}:${String(report.durationSeconds % 60).padStart(2, '0')}</strong></article>
      </div>
      <div class="report-weak-words"><b>建议再次复习</b>${weakWords.length ? weakWords.map((word) => `<button type="button" data-open-word="${escapeHTML(word.id)}">${escapeHTML(word.term)}</button>`).join('') : '<span>本轮没有错词</span>'}</div>`;
  }

  function renderMemoryLab() {
    const store = api.getMemoryLab();
    if (els.miniToggle) els.miniToggle.checked = store.flow?.autoMiniRecap !== false;
    if (els.todayErrorCount) els.todayErrorCount.textContent = String((api.getTodayWrongIds?.() || []).length);
    renderSessionStatus();
    renderAbilityOverview();
    renderRecentTen();
    renderConfusions();
    renderFamilies();
    renderReport();
  }

  function maskText(text, kind) {
    if (browseState.mask === 'hideChinese' && kind === 'chinese') return '<span class="quick-mask">点击查看</span>';
    if (browseState.mask === 'hideEnglish' && kind === 'english') return '<span class="quick-mask">点击查看</span>';
    return escapeHTML(text || '');
  }

  function browserWords() {
    const query = normalize(browseState.query);
    const letter = browseState.letter;
    // allWords() 已按用户资料的原始导入顺序排列。默认浏览时直接保留该顺序，
    // 只有用户主动选择 A-Z、薄弱优先等排序时才重新排序。
    const filtered = allWords().filter((word) => {
      const sources = wordSourcesAndGroups(word);
      const ability = abilityFor(word);
      const blob = normalize([word.term, word.meaning, word.phrase, word.note, word.tag, ...sources].join(' '));
      if (query && !blob.includes(query)) return false;
      if (browseState.source !== 'all' && !sourceMatches(word, browseState.source)) return false;
      const status = api.statusOf?.(word) || 'new';
      if (browseState.status === 'important' && !word.important) return false;
      if (browseState.status === 'weak' && Math.min(ability.recognition.score, ability.spelling.score) >= 55 && !word.important && Number(api.weakScore?.(word) || 0) < 30) return false;
      if (!['all', 'weak', 'important'].includes(browseState.status) && status !== browseState.status) return false;
      const first = normalize(word.term).charAt(0).toUpperCase();
      if (letter !== 'all') {
        if (letter === '#' && /^[A-Z]$/.test(first)) return false;
        if (letter !== '#' && first !== letter) return false;
      }
      return true;
    });

    if (browseState.sort === 'original') return filtered;

    return filtered.slice().sort((a, b) => {
      if (browseState.sort === 'za') return normalize(b.term).localeCompare(normalize(a.term), 'en');
      if (browseState.sort === 'weak') return selectionRank(b) - selectionRank(a) || normalize(a.term).localeCompare(normalize(b.term), 'en');
      if (browseState.sort === 'recent') return lastStudiedMs(b) - lastStudiedMs(a) || normalize(a.term).localeCompare(normalize(b.term), 'en');
      if (browseState.sort === 'source') return wordSourcesAndGroups(a).join('/').localeCompare(wordSourcesAndGroups(b).join('/'), 'zh-CN') || normalize(a.term).localeCompare(normalize(b.term), 'en');
      return normalize(a.term).localeCompare(normalize(b.term), 'en');
    });
  }

  function renderAlphabet() {
    if (!els.browseAlphabet) return;
    const letters = ['all', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), '#'];
    els.browseAlphabet.innerHTML = letters.map((letter) => `<button type="button" data-browse-letter="${letter}" class="${browseState.letter === letter ? 'active' : ''}">${letter === 'all' ? '全部' : letter}</button>`).join('');
  }

  function renderBrowser() {
    if (!els.browseList) return;
    const words = browserWords();
    const pages = Math.max(1, Math.ceil(words.length / browseState.pageSize));
    browseState.page = Math.min(Math.max(1, browseState.page), pages);
    const start = (browseState.page - 1) * browseState.pageSize;
    const visible = words.slice(start, start + browseState.pageSize);
    if (els.browseTotal) els.browseTotal.textContent = `${allWords().length}词`;
    if (els.browseSummary) els.browseSummary.innerHTML = `<strong>匹配 ${words.length} 词</strong><span>第 ${browseState.page}/${pages} 页 · 当前显示 ${visible.length} 词</span>`;
    renderAlphabet();
    if (!visible.length) {
      els.browseList.innerHTML = '<div class="empty-card"><div><h3>没有匹配的词</h3><p>调整搜索、来源、状态或字母筛选。</p></div></div>';
    } else {
      els.browseList.innerHTML = visible.map((word, index) => {
        const ability = abilityFor(word);
        const sources = wordSourcesAndGroups(word).slice(0, 3);
        const status = api.statusOf?.(word) || 'new';
        return `<article class="quick-browser-row" data-word-id="${escapeHTML(word.id)}">
          <span class="quick-browser-index">${start + index + 1}</span>
          <div class="quick-browser-term"><b>${maskText(word.term, 'english')}</b><small>${escapeHTML(word.phonetic || word.ipa || '')}</small></div>
          <div class="quick-browser-meaning"><p>${maskText(api.meaningSegments?.(word.meaning)?.[0] || word.meaning || '未填中文', 'chinese')}</p><small>${escapeHTML(word.phrase || '')}</small></div>
          <div class="quick-browser-tags">${sources.map((source) => `<span>${escapeHTML(source)}</span>`).join('')}<em>${escapeHTML(status === 'mature' ? '稳定' : (status === 'learning' ? '学习中' : '新词'))}</em></div>
          <div class="quick-browser-ability"><span>识 <b>${ability.recognition.score}</b></span><i style="--ability:${ability.recognition.score}%"></i><span>拼 <b>${ability.spelling.score}</b></span><i style="--ability:${ability.spelling.score}%"></i></div>
          <div class="quick-browser-actions"><button type="button" data-open-word="${escapeHTML(word.id)}">打开</button><button type="button" data-speak-word="${escapeHTML(word.id)}">发音</button></div>
        </article>`;
      }).join('');
    }
    if (els.browsePagination) {
      els.browsePagination.innerHTML = `
        <button type="button" data-browse-page="first" ${browseState.page <= 1 ? 'disabled' : ''}>首页</button>
        <button type="button" data-browse-page="prev" ${browseState.page <= 1 ? 'disabled' : ''}>上一页</button>
        <span>第 ${browseState.page} / ${pages} 页</span>
        <button type="button" data-browse-page="next" ${browseState.page >= pages ? 'disabled' : ''}>下一页</button>
        <button type="button" data-browse-page="last" ${browseState.page >= pages ? 'disabled' : ''}>末页</button>`;
    }
  }

  function render() {
    renderMemoryLab();
    renderBrowser();
  }

  document.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-memory-action]');
    if (actionButton) {
      handleMemoryAction(actionButton.dataset.memoryAction || '');
      return;
    }
    const groupButton = event.target.closest('[data-start-group]');
    if (groupButton) {
      const ids = String(groupButton.dataset.startGroup || '').split(',').filter(Boolean);
      const family = String(groupButton.dataset.groupType || '').startsWith('family');
      startSession({
        type: family ? 'word-family' : 'confusion',
        label: family ? '词族连续复习' : '易混词对比复习',
        ids,
        questionModes: family ? ['choice', 'spelling', 'choice'] : ['choice', 'choice', 'spelling'],
      });
      return;
    }
    const browseQuizButton = event.target.closest('[data-browse-quiz-start]');
    if (browseQuizButton) {
      const words = browserWords();
      const sourceLabel = browseState.source === 'all' ? '全部来源' : browseState.source;
      const statusLabel = browseState.status === 'all' ? '全部状态' : browseState.status;
      const label = `${sourceLabel} · ${statusLabel} · 当前筛选${words.length}词`;
      window.BrowseQuizApp?.open?.(words.map((word) => word.id), { label });
      return;
    }
    const openButton = event.target.closest('[data-open-word]');
    if (openButton) {
      api.openWord?.(openButton.dataset.openWord);
      return;
    }
    const speakButton = event.target.closest('[data-speak-word]');
    if (speakButton) {
      api.speakWord?.(speakButton.dataset.speakWord);
      return;
    }
    const letterButton = event.target.closest('[data-browse-letter]');
    if (letterButton) {
      browseState.letter = letterButton.dataset.browseLetter || 'all';
      browseState.page = 1;
      renderBrowser();
      resetBrowserScroll();
      return;
    }
    const pageButton = event.target.closest('[data-browse-page]');
    if (pageButton) {
      const words = browserWords();
      const pages = Math.max(1, Math.ceil(words.length / browseState.pageSize));
      const action = pageButton.dataset.browsePage;
      if (action === 'first') browseState.page = 1;
      if (action === 'prev') browseState.page = Math.max(1, browseState.page - 1);
      if (action === 'next') browseState.page = Math.min(pages, browseState.page + 1);
      if (action === 'last') browseState.page = pages;
      renderBrowser();
      resetBrowserScroll();
    }
  });

  els.miniToggle?.addEventListener('change', () => api.setMiniRecapEnabled?.(els.miniToggle.checked));
  els.browseSearch?.addEventListener('input', () => { browseState.query = els.browseSearch.value; browseState.page = 1; renderBrowser(); resetBrowserScroll(); });
  els.browseSource?.addEventListener('change', () => { browseState.source = els.browseSource.value; browseState.page = 1; renderBrowser(); resetBrowserScroll(); });
  els.browseStatus?.addEventListener('change', () => { browseState.status = els.browseStatus.value; browseState.page = 1; renderBrowser(); resetBrowserScroll(); });
  els.browseSort?.addEventListener('change', () => { browseState.sort = els.browseSort.value; browseState.page = 1; renderBrowser(); resetBrowserScroll(); });
  els.browseMask?.addEventListener('change', () => { browseState.mask = els.browseMask.value; renderBrowser(); });
  els.browsePageSize?.addEventListener('change', () => { browseState.pageSize = Number(els.browsePageSize.value) || 200; browseState.page = 1; renderBrowser(); resetBrowserScroll(); });

  window.WordMemoryLab = { render, renderSessionStatus, renderBrowser };
  render();
  window.setInterval(() => {
    api.tickQuickSession?.();
    renderSessionStatus();
    if (!api.getQuickSession().active) renderReport();
  }, 500);
}());
