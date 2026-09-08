(function () {
  'use strict';
  // v70 B081：B077 只作为历史恢复来源，不再自动覆盖当前浏览练习记录。
  // 旧脚本曾在新的 file:// 文件夹中直接把 wordMemoryBrowseQuizWordsV1 写回 B077 快照，
  // 会把用户后来刷到更高位置的三模式进度压回旧值。B081 改为由 browse-quiz.js 做“只增不减”的合并。
  const payload = window.WORD_MEMORY_BROWSE_USER_SAVE_B077;
  if (!payload?.browseQuiz || payload.kind !== 'word') return;
  try {
    localStorage.setItem('wordMemoryBrowseUserSaveB077AvailableV1', payload.exportedAt || 'available');
  } catch {
    // 标记失败不影响主存档与练习。
  }
}());
