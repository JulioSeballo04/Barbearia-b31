// Service worker mínimo: só existe pra satisfazer o critério de
// instalabilidade do PWA (Chrome/Android exige um SW com fetch handler pra
// oferecer "Instalar app") e dar uma resiliência básica offline. Estratégia
// é network-first — sempre tenta a rede primeiro, e só usa o cache se a
// rede falhar — pra nunca prender alguém numa versão antiga do app depois
// de um deploy. Não intercepta nada fora da própria origem (Firebase Auth,
// Firestore, CDN do Firebase SDK): essas chamadas sempre vão direto pra
// rede, sem cache.
var CACHE_NAME = "b31-shell-v1";
var APP_SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./manifest.json"
];

self.addEventListener("install", function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){ return cache.addAll(APP_SHELL); })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function(event){
  event.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(
        names.filter(function(n){ return n !== CACHE_NAME; })
          .map(function(n){ return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function(event){
  var url = new URL(event.request.url);
  if(url.origin !== self.location.origin) return; // deixa Firebase/CDN em paz
  if(event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then(function(res){
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, copy); });
        return res;
      })
      .catch(function(){ return caches.match(event.request); })
  );
});
