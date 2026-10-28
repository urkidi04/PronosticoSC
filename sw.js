// Service worker de Pronóstico SC: guarda la "cáscara" de la app para que abra rápido e instalable.
// Los datos (Supabase) siempre van a la red; nunca se guardan aquí.
const VERSION = "pronostico-sc-v9";
const SHELL = ["./", "./index.html", "./config.js", "./manifest.webmanifest", "./teams.js", "./pwa.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/favicon-32.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, CDN y fuentes van directo a la red
  // Red primero (siempre la versión más nueva); caché solo si no hay conexión
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === "navigate" ? caches.match("./index.html") : undefined)))
  );
});
