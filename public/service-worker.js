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
      saveRecords()
    );
  }
});

async function saveRecords() {  
  const dbReq = await indexedDB.open("offTransactions");
  dbReq.onsuccess = e => {
    const db = e.target.result;
    //Transaction 1 - Get records from IDB and update remote DB
    const trans = db.transaction(["offTransactions"], "readonly").catch(err => console.log(err));
    const offTrans = trans.objectStore("offTransactions").catch(err => console.log(err));
    const getReq = offTrans.getAll();
    getReq.onsuccess = transactions => {
        return fetch("/api/transaction/bulk", {
          method: 'POST',
          body: JSON.stringify(transactions),
          headers: { 'Content-Type': 'application/json' }
        }).then(() => console.log("Transactions posted."))
        .catch(err => console.log(err));
      };
    getReq.onerror = err => console.log("Request failed.", err);
    trans.oncomplete = upd => console.log("Database updated", upd);
    //Transaction 2 - Clear IDB
    const trans2 = db.transaction(["offTransactions"], "readwrite").catch(err => console.log(err));
    const offTrans2 = trans2.objectStore("offTransactions").catch(err => console.log(err));
    const clrReq = offTrans2.clear();
    clrReq.onsuccess = evt => console.log("Request successful.", evt);
    clrReq.onerror = err => console.log("Request failed.", err);
    trans2.oncomplete = res => console.log("IDB cleared.", res);
  }
}