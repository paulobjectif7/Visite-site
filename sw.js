// Service Worker — Visite OBJECTIF7
// Permet le fonctionnement hors-ligne complet sur tablette Android lors des visites
// (mode avion, zone blanche). À uploader à la racine du repo à côté de index.html.

const CACHE = 'visite-objectif7-v2';

// Ressources à précacher dès l'installation.
// Tout est inline dans index.html (CSS, JS, icône en base64),
// donc on n'a besoin que de la page principale pour fonctionner hors-ligne.
const PRECACHE_URLS = [
  './',
  './index.html',
];

self.addEventListener('install', event => {
  // Précache immédiat des ressources critiques
  event.waitUntil(
    caches.open(CACHE).then(cache => {
      // Cache "tolérant" : on tente d'ajouter chaque URL, sans bloquer si une seule échoue
      return Promise.all(
        PRECACHE_URLS.map(url =>
          cache.add(new Request(url, { cache: 'reload' })).catch(err =>
            console.warn('[SW] precache failed for', url, err)
          )
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  // Nettoyer les vieux caches d'anciennes versions
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Stratégie cache-first universelle pour les Google Fonts.
  // Une fois en cache, elles sont disponibles hors-ligne.
  const isGoogleFont = url.hostname === 'fonts.googleapis.com'
                    || url.hostname === 'fonts.gstatic.com';

  // On ne traite que : même origine OU Google Fonts. Le reste passe direct.
  if (url.origin !== self.location.origin && !isGoogleFont) return;

  event.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(event.request, { ignoreSearch: false }).then(cached => {
        // Stratégie cache-first : si on a en cache, on renvoie immédiatement
        // ET on tente en arrière-plan de mettre à jour le cache (stale-while-revalidate)
        const fetchAndUpdate = fetch(event.request)
          .then(response => {
            // On cache aussi les réponses cross-origin (Google Fonts → response.type === 'cors')
            if (response && response.status === 200) {
              cache.put(event.request, response.clone()).catch(() => {});
            }
            return response;
          })
          .catch(() => {
            // En cas d'échec réseau (mode avion) :
            // - si on a déjà trouvé une réponse cachée, on l'utilise
            // - sinon, pour les navigations (HTML), on retombe sur index.html du cache
            if (cached) return cached;
            if (event.request.mode === 'navigate' || event.request.destination === 'document') {
              return cache.match('./index.html').then(idx => idx || cache.match('./'));
            }
            return new Response('Hors ligne', { status: 503, statusText: 'Service Unavailable' });
          });

        return cached || fetchAndUpdate;
      })
    )
  );
});
