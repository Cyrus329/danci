// B145: 常规印刷字体与发音失败恢复；词库、存档键保持不变。
// v70 B144 2026-09-08：主单词改为书本印刷体；保留B143界面与B142词库、学习进度。
// v70 B131 2026-08-31：新增四级核心Unit8-10、Unit8 Lesson2与蓝色森林58；保留B130听力4、快速30词与Peppa。
// v70 B129 2026-08-30：新增四级翻译5《中国结》词库/资料夹缓存；保留B128快速30词与Peppa。
// v70 B128 2026-08-30：快速30词词性标签 + Unit7/今日词导入；保留B127 Peppa。
// v70 B127 2026-08-30：Peppa 句子测试效应、S1E02 与逐句知识点离线资源。
// v70 B126 2026-08-30：刷新安全去重与30词快速复盘资源；Peppa与主学习进度不变。
// v70 B122 2026-08-29：刷新词典式 IPA 显示样式缓存；词库与学习进度不变。
// v70 B121 2026-08-29：刷新第一集完整台词、默写与裸听训练资源。
// v70 B120 2026-08-28：刷新小猪佩奇英音发音检测与学习内容迁移资源。
// v70 B119 2026-08-28：新增小猪佩奇英语专区离线资源。
// v70 B118 2026-08-28：刷新四级听力3词库/资料夹缓存；保持B117去重迁移。
// v70 B117 2026-08-28：刷新全词库去重归并、旧ID别名迁移与运行时安全去重资源缓存。
// v70 B116 2026-08-28：刷新四级翻译 3「冬至」词库/资料夹资源缓存。
// v70 B113 2026-08-27：刷新四级听力2词库/分组/排序资源缓存。
// v70 B112 2026-08-27：刷新全量缺失音标补齐资源缓存。
// v70 B109 2026-08-27：仅刷新词库资源缓存版本；训练逻辑不变。
const CACHE_NAME = "word-memory-v70-b150-light-mobile";
const SCENE_ASSETS_101_180 = `a-piece-of-news newspaper message leave-a-message text-message ball skate skill special-skill social-skill professional-skill able be-able-to-do-sth ability disable unable enjoy enjoy-doing-sth enjoyable grass afraid be-afraid-of water old elder young youth youngster junior senior live live-up-to live-on lively livelihood alive lovely life wildlife lifestyle style animal mammal insect pet bite diary keep-a-diary dairy borrow lend lend-sth-to-sb vegetable sweep mainly topic title entitle underline stop cancel call-off cancellation cancer start star begin to-begin-with in-the-beginning beginning beginner renew outset end in-the-end at-the-end-of endless ending cease over`
  .split(" ")
  .map((slug) => `./assets/word-scenes/${slug}.webp`);
const SCENE_ASSETS_181_260 = `over-again all-over under above above-all pause halt ago before after now right-now just-now now-that from-now-on nowadays future in-the-future recent recently current currently currency then by-then from-then-on now-and-then only only-to-do-sth mere merely quarter a-quarter half internet website surf surf-the-internet net network site construction-site cite way all-the-way by-the-way get-in-the-way-of method means by-means-of by-no-means avenue mode via strategy solve settle tackle handle deal-with do-with cope-with solution brain wise wisdom clever smart bright brightness brilliant intelligent intelligence intellectual stupid fool foolish silly dull to`
  .split(" ")
  .map((slug) => `./assets/word-scenes/${slug}.webp`);
const SCENE_ASSETS_261_280 = `emphasis collective cell-phone punctual with hazard two yours dinner dioxide april defy shoulder january pop summer sun vocation september wet`
  .split(" ")
  .map((slug) => `./assets/word-scenes/${slug}.webp`);
const APP_ASSETS = [
  "./mobile-polish.css?v=70b150",
  "./translation-spelling-data.js?v=70b148",
  "./translation-spelling.js?v=70b148",
  "./translation-spelling.css?v=70b148",
  "./",
  "./index.html",
  "./review-ledger-bridge.html",
  "./word-data.js?v=70b149",
  "./library-folder-data.js?v=70b149",
  "./context-engine.js?v=70b038vocabimport20260809",
  "./context-data.js?v=70b056statsvocab20260820",
  "./context-id-data.js?v=70b056statsvocab20260820",
  "./context-presenter.js?v=70b038vocabimport20260809",
  "./context-study-engine.js?v=70b038vocabimport20260809",
  "./mobile-focus.js?v=70b148",
  "./image-memory.js?v=70b071images280checkpoint20260821",
  "./recovered-progress-b068.js?v=70b068userbackup20260821",
  "./assets/image-memory-pressure.png",
  "./assets/word-scenes/shop.webp",
  "./assets/word-scenes/go-shopping.webp",
  "./assets/word-scenes/store.webp",
  "./assets/word-scenes/convenience-store.webp",
  "./assets/word-scenes/restore.webp",
  "./assets/word-scenes/clerk.webp",
  "./assets/word-scenes/business.webp",
  "./assets/word-scenes/on-business.webp",
  "./assets/word-scenes/none-of-your-business.webp",
  "./assets/word-scenes/e-business.webp",
  "./assets/word-scenes/stock.webp",
  "./assets/word-scenes/in-stock.webp",
  "./assets/word-scenes/out-of-stock.webp",
  "./assets/word-scenes/price.webp",
  "./assets/word-scenes/at-any-price.webp",
  "./assets/word-scenes/price-list.webp",
  "./assets/word-scenes/priceless.webp",
  "./assets/word-scenes/discount.webp",
  "./assets/word-scenes/dollar.webp",
  "./assets/word-scenes/credit.webp",
  "./assets/word-scenes/credit-card.webp",
  "./assets/word-scenes/to-ones-credit.webp",
  "./assets/word-scenes/cash.webp",
  "./assets/word-scenes/in-cash.webp",
  "./assets/word-scenes/cheque.webp",
  "./assets/word-scenes/online.webp",
  "./assets/word-scenes/online-shopping.webp",
  "./assets/word-scenes/online-paying.webp",
  "./assets/word-scenes/offline.webp",
  "./assets/word-scenes/buy.webp",
  "./assets/word-scenes/sell.webp",
  "./assets/word-scenes/sale.webp",
  "./assets/word-scenes/for-sale.webp",
  "./assets/word-scenes/on-sale.webp",
  "./assets/word-scenes/salesman.webp",
  "./assets/word-scenes/consume.webp",
  "./assets/word-scenes/consumer.webp",
  "./assets/word-scenes/consumption.webp",
  "./assets/word-scenes/purchase.webp",
  "./assets/word-scenes/tradition.webp",
  "./assets/word-scenes/traditional.webp",
  "./assets/word-scenes/custom.webp",
  "./assets/word-scenes/customer.webp",
  "./assets/word-scenes/costume.webp",
  "./assets/word-scenes/bargain.webp",
  "./assets/word-scenes/cheap.webp",
  "./assets/word-scenes/expend.webp",
  "./assets/word-scenes/expense.webp",
  "./assets/word-scenes/at-the-expense-of.webp",
  "./assets/word-scenes/expensive.webp",
  "./assets/word-scenes/expenditure.webp",
  "./assets/word-scenes/dispensable.webp",
  "./assets/word-scenes/indispensable.webp",
  "./assets/word-scenes/spend.webp",
  "./assets/word-scenes/spend-on.webp",
  "./assets/word-scenes/spend-in-doing.webp",
  "./assets/word-scenes/cost.webp",
  "./assets/word-scenes/at-all-costs.webp",
  "./assets/word-scenes/at-the-cost-of.webp",
  "./assets/word-scenes/costly.webp",
  "./assets/word-scenes/take.webp",
  "./assets/word-scenes/it-takes-time-to-do.webp",
  "./assets/word-scenes/know.webp",
  "./assets/word-scenes/as-far-as-i-know.webp",
  "./assets/word-scenes/unknown.webp",
  "./assets/word-scenes/see.webp",
  "./assets/word-scenes/see-sb-off.webp",
  "./assets/word-scenes/feel.webp",
  "./assets/word-scenes/feel-at-home.webp",
  "./assets/word-scenes/feel-free-to-do.webp",
  "./assets/word-scenes/feeling.webp",
  "./assets/word-scenes/smell.webp",
  "./assets/word-scenes/taste.webp",
  "./assets/word-scenes/sound.webp",
  "./assets/word-scenes/listen.webp",
  "./assets/word-scenes/listen-to.webp",
  "./assets/word-scenes/hear.webp",
  "./assets/word-scenes/voice.webp",
  "./assets/word-scenes/speak.webp",
  "./assets/word-scenes/aloud.webp",
  "./assets/word-scenes/loudly.webp",
  "./assets/word-scenes/speech.webp",
  "./assets/word-scenes/lecture.webp",
  "./assets/word-scenes/give-a-lecture.webp",
  "./assets/word-scenes/talk.webp",
  "./assets/word-scenes/tell.webp",
  "./assets/word-scenes/tell-apart.webp",
  "./assets/word-scenes/retell.webp",
  "./assets/word-scenes/story.webp",
  "./assets/word-scenes/tell-a-story.webp",
  "./assets/word-scenes/read.webp",
  "./assets/word-scenes/reader.webp",
  "./assets/word-scenes/say.webp",
  "./assets/word-scenes/article.webp",
  "./assets/word-scenes/text.webp",
  "./assets/word-scenes/context.webp",
  "./assets/word-scenes/passage.webp",
  "./assets/word-scenes/chapter.webp",
  "./assets/word-scenes/paragraph.webp",
  "./assets/word-scenes/news.webp",
  "./assets/pronunciation-primer.wav?v=70b060fullstart20260820",
  "./browse-user-save-b077.js?v=70b077usersave20260821",
  "./apply-browse-user-save-b077.js?v=70b082exactprogress20260822",
  "./app.js?v=70b149",
  "./peppa-content-b127.js?v=70b127peppatesting20260830",
  "./peppa-zone.js?v=70b127peppatesting20260830",
  "./memory-lab.js?v=70b106cet4listen20260826",
  "./speed-review.js?v=70b128posquick3020260830",
  "./browse-quiz.js?v=70b118listening320260828",
  "./folder-view.js?v=70b143",
  "./ui-refresh.css?v=70b145",
  "./ui-refresh.js?v=70b144",
  "./smart-vocab.js?v=70b106cet4listen20260826",
  "./styles.css?v=70b128posquick3020260830",
  "./supabase-word-memory-repair.sql",
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
].concat(SCENE_ASSETS_101_180, SCENE_ASSETS_181_260, SCENE_ASSETS_261_280);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok && new URL(event.request.url).origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match("./index.html")))
  );
});
