(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MobileFocus = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_GESTURE_ELAPSED_MS = 1400;
  const MIN_HORIZONTAL_SWIPE_PX = 64;
  const HORIZONTAL_DOMINANCE_RATIO = 1.25;
  const MEDIUM_TERM_LENGTH_THRESHOLD = 11;
  const LONG_TERM_LENGTH_THRESHOLD = 18;

  function classifyGesture({ dx, dy, elapsed }) {
    const horizontalDistance = Math.abs(dx);
    const verticalDistance = Math.abs(dy);

    if (
      elapsed > MAX_GESTURE_ELAPSED_MS
      || horizontalDistance < MIN_HORIZONTAL_SWIPE_PX
      || horizontalDistance <= verticalDistance * HORIZONTAL_DOMINANCE_RATIO
    ) {
      return 'none';
    }

    return dx < 0 ? 'next' : 'previous';
  }

  function termSizeClass(term) {
    const length = String(term || '').length;

    if (length > LONG_TERM_LENGTH_THRESHOLD) return 'long';
    if (length > MEDIUM_TERM_LENGTH_THRESHOLD) return 'medium';
    return 'normal';
  }

  function moveIndex(index, delta, total) {
    if (total <= 0) return 0;
    return Math.min(Math.max(index + delta, 0), total - 1);
  }

  function createController(adapter = {}) {
    const elements = adapter.elements || {};
    const environment = adapter.env || {};
    const windowObject = environment.window
      || (typeof window !== 'undefined' ? window : null);
    const documentObject = environment.document
      || (typeof document !== 'undefined' ? document : null);
    const historyObject = environment.history
      || windowObject?.history
      || (typeof history !== 'undefined' ? history : null);
    const timers = environment.timers || windowObject || globalThis;
    const now = typeof environment.now === 'function' ? environment.now : Date.now;
    const session = {
      active: false,
      ids: [],
      index: 0,
      revealed: false,
      locked: false,
      pointer: null,
      suppressClickUntil: 0,
      previous: null,
      mode: 'recall',
      spellingDraft: '',
      spellingResult: null,
      choiceOptions: [],
      choiceResult: null,
      choiceWordId: null,
    };
    let historyPushed = false;
    let bound = false;
    let pendingAdvanceTimer = null;
    let sessionGeneration = 0;

    function listen(element, type, listener) {
      element?.addEventListener?.(type, listener);
    }

    function setRatingLocked(locked) {
      session.locked = Boolean(locked);
      elements.ratingButtons?.forEach?.((button) => { button.disabled = session.locked; });
      elements.choiceButtons?.forEach?.((button) => {
        button.disabled = session.locked || Boolean(session.choiceResult);
      });
    }

    function cancelPendingAdvance() {
      sessionGeneration += 1;
      if (pendingAdvanceTimer !== null) {
        timers.clearTimeout?.(pendingAdvanceTimer);
        pendingAdvanceTimer = null;
      }
      setRatingLocked(false);
    }

    function currentId() {
      return session.ids[session.index] || null;
    }

    function currentWord() {
      while (session.index < session.ids.length) {
        const id = currentId();
        const word = id && typeof adapter.getWord === 'function' ? adapter.getWord(id) : null;
        if (word) return word;
        session.index += 1;
      }
      return null;
    }

    function refreshQueue(preferredId = null) {
      const oldId = currentId();
      const queued = typeof adapter.queue === 'function' ? adapter.queue() : [];
      session.ids = Array.isArray(queued)
        ? queued.map((item) => (typeof item === 'string' ? item : item?.id)).filter(Boolean)
        : [];
      const targetId = preferredId || (typeof adapter.activeId === 'function' ? adapter.activeId() : null) || oldId;
      const targetIndex = targetId ? session.ids.indexOf(targetId) : -1;
      session.index = targetIndex >= 0
        ? targetIndex
        : Math.min(Math.max(session.index, 0), Math.max(0, session.ids.length - 1));
      const selectedId = currentId();
      if (selectedId && typeof adapter.select === 'function') adapter.select(selectedId);
      return selectedId;
    }

    function resetSpellingState(options = {}) {
      session.spellingDraft = '';
      session.spellingResult = null;
      if (elements.spellingInput) elements.spellingInput.value = '';
      if (elements.spellingFeedback) {
        elements.spellingFeedback.textContent = '';
        elements.spellingFeedback.classList?.remove?.('is-correct', 'is-wrong');
      }
      if (!options.keepReveal) setExpanded(false);
    }

    function resetChoiceState() {
      session.choiceOptions = [];
      session.choiceResult = null;
      session.choiceWordId = null;
      if (elements.choiceFeedback) {
        elements.choiceFeedback.textContent = '';
        elements.choiceFeedback.classList?.remove?.('is-correct', 'is-wrong');
      }
      elements.choiceButtons?.forEach?.((button) => {
        button.disabled = false;
        button.textContent = '';
        button.classList?.remove?.('is-correct', 'is-wrong', 'is-selected');
      });
    }

    function resetQuestionState(options = {}) {
      resetSpellingState(options);
      resetChoiceState();
    }

    function setMode(mode) {
      if (session.locked) return;
      const nextMode = ['recall', 'choice', 'spelling'].includes(mode) ? mode : 'recall';
      if (session.mode === nextMode) return;
      session.mode = nextMode;
      resetQuestionState();
      render();
      if (session.mode === 'spelling' && currentWord()) {
        timers.setTimeout?.(() => elements.spellingInput?.focus?.(), 0);
      } else if (session.mode === 'choice' && currentWord()) {
        timers.setTimeout?.(() => elements.choiceButtons?.[0]?.focus?.(), 0);
      } else {
        elements.card?.focus?.();
      }
    }

    function normalizedSpelling(value) {
      return String(value || '')
        .toLowerCase()
        .replace(/[’‘`]/g, "'")
        .replace(/[^a-z0-9'\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function checkSpelling() {
      if (!session.active || session.locked || session.mode !== 'spelling') return;
      const word = currentWord();
      if (!word) return;
      const input = elements.spellingInput?.value ?? session.spellingDraft;
      session.spellingDraft = String(input || '');
      const correct = typeof adapter.checkSpelling === 'function'
        ? Boolean(adapter.checkSpelling(session.spellingDraft, word))
        : normalizedSpelling(session.spellingDraft) === normalizedSpelling(word.term);
      session.spellingResult = { correct };
      setExpanded(true);
      render();
      elements.spellingInput?.focus?.();
    }

    function normalizedMeaning(value) {
      return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function ensureChoiceOptions(word, chineseMeaning) {
      if (session.choiceWordId === word.id && session.choiceOptions.length === 4) return session.choiceOptions;
      const supplied = typeof adapter.choiceOptions === 'function' ? adapter.choiceOptions(word) : [];
      const unique = [];
      const seen = new Set();
      [...(Array.isArray(supplied) ? supplied : []), chineseMeaning].forEach((item) => {
        const text = String(item || '').trim();
        const key = normalizedMeaning(text);
        if (!text || seen.has(key)) return;
        seen.add(key);
        unique.push(text);
      });
      const fillers = ['未掌握该词义', '与本词无关的释义', '暂无对应释义'];
      fillers.forEach((item) => {
        if (unique.length < 4 && !seen.has(normalizedMeaning(item))) {
          seen.add(normalizedMeaning(item));
          unique.push(item);
        }
      });
      session.choiceOptions = unique.slice(0, 4);
      session.choiceWordId = word.id;
      session.choiceResult = null;
      return session.choiceOptions;
    }

    function selectChoice(index) {
      if (!session.active || session.locked || session.mode !== 'choice' || session.choiceResult) return;
      const word = currentWord();
      if (!word) return;
      const view = typeof adapter.view === 'function' ? (adapter.view(word) || {}) : word;
      const correctMeaning = String(view.answer || word.meaning || '未填中文');
      const options = ensureChoiceOptions(word, correctMeaning);
      const selectedIndex = Number(index);
      if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= options.length) return;
      const correctIndex = options.findIndex((item) => normalizedMeaning(item) === normalizedMeaning(correctMeaning));
      const correct = selectedIndex === correctIndex;
      session.choiceResult = { selectedIndex, correctIndex, correct };
      setExpanded(true);
      setRatingLocked(true);
      render();

      const generation = sessionGeneration;
      pendingAdvanceTimer = timers.setTimeout(() => {
        if (!session.active || generation !== sessionGeneration) return;
        pendingAdvanceTimer = null;
        setRatingLocked(false);
        rate(correct ? 'remember' : 'forgot');
      }, 650);
    }

    function setExpanded(revealed) {
      session.revealed = Boolean(revealed);
      if (elements.answer) elements.answer.hidden = !session.revealed;
      elements.card?.setAttribute?.('aria-expanded', String(session.revealed));
    }

    function setProgress(current, total) {
      const percent = total > 0 ? Math.round((current / total) * 100) : 0;
      if (elements.count) elements.count.textContent = `${current} / ${total}`;
      elements.progress?.setAttribute?.('aria-valuemin', '0');
      elements.progress?.setAttribute?.('aria-valuemax', '100');
      elements.progress?.setAttribute?.('aria-valuenow', String(percent));
      if (elements.progressFill?.style) elements.progressFill.style.width = `${percent}%`;
    }

    function renderPrevious() {
      const previous = session.previous;
      if (!previous) {
        if (elements.previous) elements.previous.hidden = true;
        if (elements.previousTerm) elements.previousTerm.textContent = '';
        if (elements.previousMeaning) elements.previousMeaning.textContent = '';
        return;
      }

      if (elements.previousTerm) elements.previousTerm.textContent = previous.term;
      if (elements.previousMeaning) elements.previousMeaning.textContent = previous.meaning;
      if (elements.previous) elements.previous.hidden = false;
    }

    function renderEmpty(total) {
      const completed = total > 0 ? total : 0;
      setProgress(completed, total);
      if (elements.card) elements.card.hidden = true;
      if (elements.actions) elements.actions.hidden = true;
      if (elements.empty) elements.empty.hidden = false;
      if (elements.spelling) elements.spelling.hidden = true;
      if (elements.choice) elements.choice.hidden = true;
      setExpanded(false);
    }

    function render() {
      const total = session.ids.length;
      const word = currentWord();

      if (elements.title && typeof adapter.title === 'function') {
        elements.title.textContent = String(adapter.title() || '');
      }
      if (elements.source && typeof adapter.source === 'function') {
        elements.source.textContent = String(adapter.source() || '');
      }
      renderPrevious();

      if (!word) {
        renderEmpty(total);
        return;
      }

      const view = typeof adapter.view === 'function' ? (adapter.view(word) || {}) : word;
      if (elements.card) elements.card.hidden = false;
      if (elements.actions) elements.actions.hidden = false;
      if (elements.empty) elements.empty.hidden = true;
      setProgress(session.index + 1, total);

      const englishTerm = String(view.term || word.term || '');
      const chineseMeaning = String(view.answer || word.meaning || '未填中文');
      const spellingMode = session.mode === 'spelling';
      const choiceMode = session.mode === 'choice';
      const displayTerm = spellingMode ? chineseMeaning : englishTerm;

      elements.modeButtons?.forEach?.((button) => {
        const active = button.dataset?.mobileFocusMode === session.mode;
        button.classList?.toggle?.('is-active', active);
        button.setAttribute?.('aria-pressed', String(active));
      });
      if (elements.kicker) {
        elements.kicker.textContent = spellingMode
          ? '看中文，拼写英文'
          : (choiceMode ? '看英文，选择中文' : '看英文，回想中文');
      }
      if (elements.tip) {
        elements.tip.textContent = spellingMode
          ? '第一次 Enter 检查；拼对后再按一次记住，拼错后再按一次忘了'
          : (choiceMode
            ? '选择答案后自动判定：选对记住，选错忘了；按 1—4 或 A—D 也可作答'
            : '点击卡片看答案 · 手机滑动切换 · 电脑可直接点击按钮');
      }

      if (elements.term) {
        elements.term.textContent = displayTerm;
        elements.term.classList?.remove?.('normal', 'medium', 'long', 'is-chinese-prompt');
        elements.term.classList?.add?.(termSizeClass(displayTerm));
        if (spellingMode) elements.term.classList?.add?.('is-chinese-prompt');
      }
      if (elements.phonetic) {
        elements.phonetic.hidden = spellingMode && !session.spellingResult;
        elements.phonetic.textContent = String(view.phonetic || '点击发音按钮听读');
      }
      if (elements.audio) {
        elements.audio.hidden = spellingMode && !session.spellingResult;
      }
      if (elements.spelling) {
        elements.spelling.hidden = !spellingMode;
      }
      if (elements.choice) {
        elements.choice.hidden = !choiceMode;
      }
      if (elements.spellingInput && spellingMode && elements.spellingInput.value !== session.spellingDraft) {
        elements.spellingInput.value = session.spellingDraft;
      }

      if (spellingMode) {
        const result = session.spellingResult;
        if (elements.spellingFeedback) {
          elements.spellingFeedback.classList?.remove?.('is-correct', 'is-wrong');
          if (!result) {
            elements.spellingFeedback.textContent = '';
          } else if (result.correct) {
            elements.spellingFeedback.textContent = '拼写正确。再按一次 Enter，直接记住并进入下一个。';
            elements.spellingFeedback.classList?.add?.('is-correct');
          } else {
            elements.spellingFeedback.textContent = `拼写错误。正确答案：${englishTerm}。再按一次 Enter，记为忘了。`;
            elements.spellingFeedback.classList?.add?.('is-wrong');
          }
        }
        if (elements.meaning) {
          elements.meaning.textContent = session.spellingResult ? `正确拼写：${englishTerm}` : '';
        }
        if (elements.detail) {
          elements.detail.textContent = session.spellingResult
            ? [view.phonetic, view.example].filter(Boolean).join(' · ')
            : '';
        }
        setExpanded(Boolean(session.spellingResult));
      } else if (choiceMode) {
        const options = ensureChoiceOptions(word, chineseMeaning);
        const result = session.choiceResult;
        elements.choiceButtons?.forEach?.((button, index) => {
          const option = options[index] || '';
          button.textContent = option ? `${String.fromCharCode(65 + index)}. ${option}` : '';
          button.hidden = !option;
          button.disabled = session.locked || Boolean(result);
          button.classList?.remove?.('is-correct', 'is-wrong', 'is-selected');
          if (result && index === result.correctIndex) button.classList?.add?.('is-correct');
          if (result && index === result.selectedIndex) {
            button.classList?.add?.('is-selected');
            if (!result.correct) button.classList?.add?.('is-wrong');
          }
        });
        if (elements.choiceFeedback) {
          elements.choiceFeedback.classList?.remove?.('is-correct', 'is-wrong');
          if (!result) {
            elements.choiceFeedback.textContent = '';
          } else if (result.correct) {
            elements.choiceFeedback.textContent = '选择正确，按“记住”写入同一学习进度。';
            elements.choiceFeedback.classList?.add?.('is-correct');
          } else {
            elements.choiceFeedback.textContent = `选择错误，正确答案：${chineseMeaning}；按“忘了”写入同一学习进度。`;
            elements.choiceFeedback.classList?.add?.('is-wrong');
          }
        }
        if (elements.meaning) elements.meaning.textContent = result ? `正确释义：${chineseMeaning}` : '';
        if (elements.detail) elements.detail.textContent = result ? String(view.example || '') : '';
        setExpanded(Boolean(result));
      } else {
        if (typeof adapter.renderAnswer === 'function') {
          adapter.renderAnswer(view, {
            answer: elements.answer,
            meaning: elements.meaning,
            detail: elements.detail,
          }, word);
        } else {
          if (elements.meaning) elements.meaning.textContent = chineseMeaning;
          if (elements.detail) elements.detail.textContent = String(view.example || '');
        }
        setExpanded(session.revealed);
      }
    }

    function toggleReveal() {
      if (!session.active || !currentWord() || session.locked || session.mode !== 'recall') return;
      setExpanded(!session.revealed);
    }

    function move(delta) {
      if (!session.active || session.locked || !session.ids.length) return;
      session.index = moveIndex(session.index, delta, session.ids.length);
      if (currentId() && typeof adapter.select === 'function') adapter.select(currentId());
      resetQuestionState();
      setExpanded(false);
      render();
    }

    function rate(result) {
      if (
        !session.active
        || session.locked
        || !['forgot', 'fuzzy', 'remember'].includes(result)
      ) return;
      const id = currentId();
      const word = currentWord();
      if (!id || !word) return;

      const view = typeof adapter.view === 'function' ? (adapter.view(word) || {}) : word;
      session.previous = {
        id,
        term: String(view.term || word.term || ''),
        meaning: String(view.answer || word.meaning || '未填释义'),
      };
      renderPrevious();

      setRatingLocked(true);
      try {
        adapter.rate?.(id, result);
      } catch (error) {
        setRatingLocked(false);
        throw error;
      }

      const generation = sessionGeneration;
      resetSpellingState({ keepReveal: true });
      pendingAdvanceTimer = timers.setTimeout(() => {
        if (!session.active || generation !== sessionGeneration) return;
        pendingAdvanceTimer = null;
        const sharedActiveId = typeof adapter.activeId === 'function' ? adapter.activeId() : null;
        if (sharedActiveId) refreshQueue(sharedActiveId);
        else session.index = Math.min(session.index + 1, session.ids.length);
        setRatingLocked(false);
        resetQuestionState();
        setExpanded(false);
        render();
      }, 220);
    }

    function open() {
      if (session.active) return;
      cancelPendingAdvance();
      session.active = true;
      session.index = 0;
      refreshQueue(typeof adapter.activeId === 'function' ? adapter.activeId() : null);
      session.pointer = null;
      session.suppressClickUntil = 0;
      session.previous = null;
      session.mode = 'recall';
      resetQuestionState();
      renderPrevious();
      setExpanded(false);
      if (elements.root) elements.root.hidden = false;
      documentObject?.body?.classList?.add?.('mobile-focus-active');
      try {
        historyObject?.pushState?.({ mobileFocus: true }, '', '#mobile-focus');
        historyPushed = Boolean(historyObject?.pushState);
      } catch {
        historyPushed = false;
      }
      render();
      if (currentWord()) {
        elements.card?.focus?.();
      } else {
        elements.exit?.focus?.();
      }
    }

    function close(options = {}) {
      const fromPopState = Boolean(options.fromPopState);
      if (!session.active) return;
      cancelPendingAdvance();
      if (currentId() && typeof adapter.select === 'function') adapter.select(currentId());
      session.active = false;
      session.pointer = null;
      resetQuestionState();
      setExpanded(false);
      if (elements.root) elements.root.hidden = true;
      documentObject?.body?.classList?.remove?.('mobile-focus-active');
      if (historyPushed && !fromPopState) {
        historyPushed = false;
        historyObject?.back?.();
      } else if (fromPopState) {
        historyPushed = false;
      }
      elements.entry?.focus?.();
    }

    function bind() {
      if (bound) return;
      bound = true;
      listen(elements.entry, 'click', open);
      listen(elements.exit, 'click', () => close());
      listen(elements.card, 'click', (event) => {
        if (session.mode !== 'recall' || event?.target === elements.audio || now() <= session.suppressClickUntil) return;
        toggleReveal();
      });
      listen(elements.card, 'keydown', (event) => {
        if (event?.target && event.target !== elements.card) return;
        if (event?.key !== 'Enter' && event?.key !== ' ') return;
        event.preventDefault?.();
        toggleReveal();
      });
      listen(elements.audio, 'click', (event) => {
        event.stopPropagation?.();
        const word = currentWord();
        if (session.active && word) adapter.speak?.(word);
      });
      elements.ratingButtons?.forEach?.((button) => {
        listen(button, 'click', (event) => {
          event.stopPropagation?.();
          rate(button.dataset?.mobileFocusRate);
        });
      });
      elements.modeButtons?.forEach?.((button) => {
        listen(button, 'click', () => setMode(button.dataset?.mobileFocusMode));
      });
      elements.choiceButtons?.forEach?.((button, index) => {
        listen(button, 'click', (event) => {
          event.stopPropagation?.();
          selectChoice(index);
        });
      });
      listen(elements.spellingInput, 'input', (event) => {
        session.spellingDraft = String(event?.target?.value || '');
        if (session.spellingResult) {
          session.spellingResult = null;
          setExpanded(false);
          render();
          elements.spellingInput?.focus?.();
        }
      });
      listen(elements.spellingInput, 'keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault?.();
        if (session.spellingResult) {
          rate(session.spellingResult.correct ? 'remember' : 'forgot');
        } else {
          checkSpelling();
        }
      });
      listen(elements.spellingCheck, 'click', (event) => {
        event.stopPropagation?.();
        checkSpelling();
      });
      listen(elements.spellingClear, 'click', (event) => {
        event.stopPropagation?.();
        resetSpellingState();
        render();
        elements.spellingInput?.focus?.();
      });
      listen(elements.card, 'pointerdown', (event) => {
        if (
          !session.active
          || session.locked
          || (elements.spellingInput && event.target === elements.spellingInput)
          || (elements.spellingCheck && event.target === elements.spellingCheck)
          || (elements.spellingClear && event.target === elements.spellingClear)
          || elements.choiceButtons?.includes?.(event.target)
          || (event.button != null && event.button !== 0)
        ) return;
        session.pointer = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          time: now(),
        };
      });
      listen(elements.card, 'pointerup', (event) => {
        const pointer = session.pointer;
        session.pointer = null;
        if (!pointer || (event.pointerId != null && pointer.id !== event.pointerId)) return;
        const gesture = classifyGesture({
          dx: event.clientX - pointer.x,
          dy: event.clientY - pointer.y,
          elapsed: now() - pointer.time,
        });
        if (gesture === 'none') return;
        session.suppressClickUntil = now() + 400;
        move(gesture === 'next' ? 1 : -1);
      });
      listen(elements.card, 'pointercancel', () => { session.pointer = null; });
      listen(windowObject, 'keydown', (event) => {
        if (!session.active || session.locked) return;
        const typingSpelling = session.mode === 'spelling' && event.target === elements.spellingInput;
        if (event.key === 'Escape') {
          event.preventDefault?.();
          close();
          return;
        }
        if (session.mode === 'choice' && !session.choiceResult) {
          const key = String(event.key || '').toUpperCase();
          const choiceIndex = ['1', '2', '3', '4'].indexOf(key) >= 0
            ? Number(key) - 1
            : ['A', 'B', 'C', 'D'].indexOf(key);
          if (choiceIndex >= 0) {
            event.preventDefault?.();
            selectChoice(choiceIndex);
            return;
          }
        }
        if (event.key === 'Shift' && !typingSpelling) {
          event.preventDefault?.();
          toggleReveal();
          return;
        }
        if (event.key === 'ArrowLeft' && !typingSpelling) {
          event.preventDefault?.();
          rate('remember');
          return;
        }
        if (event.key === 'ArrowRight' && !typingSpelling) {
          event.preventDefault?.();
          rate('forgot');
        }
      });
      listen(windowObject, 'popstate', () => close({ fromPopState: true }));
    }

    bind();

    return {
      open,
      close,
      render,
      rate,
      move,
      toggleReveal,
      setMode,
      checkSpelling,
      selectChoice,
      session,
    };
  }

  return {
    classifyGesture,
    termSizeClass,
    moveIndex,
    createController,
  };
}));
