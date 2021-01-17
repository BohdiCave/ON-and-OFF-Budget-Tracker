const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/style.css',
  '/index.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  'https://cdn.jsdelivr.net/npm/chart.js@2.8.0',
  'https://stackpath.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css'
];
  
const cacheName = "cache-v1";

self.addEventListener("install", event => {
  console.log("SW installed.");
  event.waitUntil(
    caches
    .open(cacheName)
    .then(cache => {
      console.log("SW caching.");
      cache.addAll(FILES_TO_CACHE);
    })
    .then(self.skipWaiting())
  );
});
  
self.addEventListener("activate", event => {
  console.log("SW activated");
  event.waitUntil(
    caches.keys()
    .then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== cacheName) {
            console.log("SW removing old cache", cache);
            return caches.delete(cache);
          }  
        })
      );
    })
  );
  self.clients.claim();
});


self.addEventListener("fetch", event => {
  console.log("SW fetching.");
  const req = event.request;  
  // handle runtime requests for data from /api routes
  if (req.url.includes("/api/transaction")) {
    // network first, fallback to cache
    event.respondWith(
      fetch(req)
      .then(res => {
        caches
        .open(cacheName)
        .then(
          cache => {
            cache.put(req, res.clone());
          });
        return res;     
      }).catch(
        err => {
          if (req.method === "GET") {
            console.log("GET from cache");
            caches.match(req);
          } else {
            console.log("POST to IDB")
            //save to IndexedDB
            saveRecord(req.body);
          }
          return err;
        }
      )
    )
  }
   
  // use cache first for all other requests for performance
  event.respondWith(
    caches.match(req)
    .then(
      cachedResponse => {
        if (cachedResponse) { return cachedResponse; }
        // request is not in cache. make network request and cache the response
        return caches
        .open(CACHE_V1)
        .then(
          cache => fetch(req)
          .then(res => cache.put(req, res.clone()))
          .then(() => res)
        );
      }
    )
  );
});

self.addEventListener("sync", event => {
  console.log("SW background syncing.");
  if (event.tag === "onlineSync") {
    event.waitUntil(
      saveRecord()
    );
  }
});

const saveRecord = record => {
  //access IDB 
  getTransactions()
  .then(transactions => {  
      return fetch("/api/transaction/bulk", {
        method: 'POST',
        body: JSON.stringify(transactions),
        headers: { 'Content-Type': 'application/json' }
      }).then(
        () => console.log("Database updated!")
      ).catch(
        err => console.log(err)
      );
  });

}