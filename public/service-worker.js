const FILES_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.webmanifest',
    '/style.css',
    '/index.js',
    '/assets/images/icons/icon-192x192.png',
    '/assets/images/icons/icon-512x512.png',
    'https://cdn.jsdelivr.net/npm/chart.js@2.8.0',
    'https://stackpath.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css'
  ];
  
  const STATIC_CACHE = "static-cache-v1";
  const RUNTIME_CACHE = "runtime-cache";

  self.addEventListener("install", event => {
    event.waitUntil(
      caches
        .open(STATIC_CACHE)
        .then(cache => cache.addAll(FILES_TO_CACHE))
        .then(() => self.skipWaiting())
    );
  });
  
  // The activate handler takes care of cleaning up old caches.
  self.addEventListener("activate", event => {
    const currentCaches = [STATIC_CACHE, RUNTIME_CACHE];
    event.waitUntil(
      caches
        .keys()
        .then(keyList => {
          // return array of cache names that are old to delete
          return Promise.all(
            keyList.map(key => {
              if(key !== STATIC_CACHE && key !== RUNTIME_CACHE) {
                console.log("Removing old cache data", key);
                return caches.delete(key);
              }  
            })
          )
        })
    );
    self.clients.claim();
  });
  
  self.addEventListener("fetch", event => {  
    // handle runtime requests for data from /api routes
    if (event.request.url.includes("/api/transaction")) {
      // make network request and fallback to cache if network request fails (offline)
      event.respondWith(
        caches.open(RUNTIME_CACHE).then(cache => {
          return fetch(event.request)
            .then(response => {
              cache.put(event.request, response.clone());
              return response;
            })
            .catch(() => caches.match(event.request));
        })
      );
      return;
    }
  
    // use cache first for all other requests for performance
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
  
        // request is not in cache. make network request and cache the response
        return caches.open(RUNTIME_CACHE).then(cache => {
          return fetch(event.request).then(response => {
            return cache.put(event.request, response.clone()).then(() => {
              return response;
            });
          });
        });
      })
    );
  });
  