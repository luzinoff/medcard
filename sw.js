/* Service worker Медкарты: даёт установку как приложение и запуск без сети.
   Устроен так же, как в Дневнике. Страница — «сначала сеть»: при связи всегда
   приходит свежая версия с GitHub Pages, копия в кэше обновляется. Нет ответа
   за 4 с или сети нет совсем — открывается последняя сохранённая копия.
   Медицинские данные здесь не хранятся и не проходят: они в localStorage
   и на Google Диске. Чужие адреса (Google, Gemini, DeepSeek) не трогаем. */
const CACHE = 'medcard-v1';
const SCOPE = self.registration.scope;               // …/medcard/
const PAGE = SCOPE;                                   // ключ кэша для страницы
const STATIC = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'icon-maskable-512.png', 'apple-touch-icon.png'].map(f => new URL(f, SCOPE).href);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll([PAGE, ...STATIC])));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('medcard-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || !r.url.startsWith(SCOPE)) return;
  const u = new URL(r.url);
  const isPage = r.mode === 'navigate' || u.pathname.endsWith('/') || u.pathname.endsWith('/index.html');
  if (isPage) { e.respondWith(page(r, e)); return; }
  if (STATIC.includes(u.origin + u.pathname)) {
    e.respondWith(caches.match(u.origin + u.pathname).then(m => m || fetch(r)));
  }
});

function page(r, e) {
  /* по адресу, а не самим запросом: запрос перехода (mode navigate)
     с дополнительными параметрами fetch() не принимает */
  let save = Promise.resolve();
  const net = fetch(r.url, {cache: 'no-cache', credentials: 'same-origin'}).then(res => {
    if (res.ok && res.type === 'basic' && !res.redirected) {
      const copy = res.clone();
      save = caches.open(CACHE).then(c => c.put(PAGE, copy));
    }
    return res;
  });
  e.waitUntil(net.then(() => save).catch(() => {}));
  const cached = () => caches.match(PAGE);
  const slow = new Promise(ok => setTimeout(ok, 4000)).then(cached);
  return Promise.race([net.catch(cached), slow.then(m => m || net)])
    .then(res => res || net)
    .catch(() => cached().then(m => m || Response.error()));
}
