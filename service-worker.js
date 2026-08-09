const CACHE_NAME = "word-memory-v70-b039-storage-repair-20260809";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./word-data.js?v=70b038vocabimport20260809",
  "./library-folder-data.js?v=70b038vocabimport20260809",
  "./context-engine.js?v=70b038vocabimport20260809",
  "./context-data.js?v=70b038vocabimport20260809",
  "./context-id-data.js?v=70b038vocabimport20260809",
  "./context-presenter.js?v=70b038vocabimport20260809",
  "./context-study-engine.js?v=70b038vocabimport20260809",
  "./mobile-focus.js?v=70b038vocabimport20260809",
  "./app.js?v=70b039storagefix20260809",
  "./memory-lab.js?v=70b038vocabimport20260809",
  "./browse-quiz.js?v=70b038vocabimport20260809",
  "./folder-view.js?v=70b038vocabimport20260809",
  "./smart-vocab.js?v=70b038vocabimport20260809",
  "./styles.css?v=70b038vocabimport20260809",
  "./supabase-word-memory-repair.sql",
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

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
