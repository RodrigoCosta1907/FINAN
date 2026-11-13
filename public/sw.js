// Service worker mínimo: existe só para o navegador permitir "instalar" o app.
// Não guarda cache — cada navegação continua indo para a rede (dados sempre atuais).
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // passthrough: nenhuma estratégia de cache
});
