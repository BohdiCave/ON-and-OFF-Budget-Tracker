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
  
const CACHE_V1 = "cache-v1";

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_V1).then(cache => cache.addAll(FILES_TO_CACHE)));
  self.skipWaiting();
});
  
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(keyList.map(key => {
        if (key !== CACHE_V1) {
          console.log("Removing old cache data", key);
          return caches.delete(key);
        }  
      }));
    })
  );
  self.clients.claim();
});
  
self.addEventListener("fetch", event => {
  const req = event.request;  
  // handle runtime requests for data from /api routes
  if (req.url.includes("/api/transaction")) {
    // make network request and fallback to cache if network request fails (offline)
    event.respondWith(
      caches.open(CACHE_V1).then(cache => {
        return fetch(req).then(res => {
          cache.put(req, res.clone());
          return res;
        }).catch(() => {
          if (req.method === "GET") {
            caches.match(event.request);
          } else {
            //open IndexedDB and save the transaction
            saveRecord(req.body);
          }
          return;
        });
      })
    )
  }
  
  // use cache first for all other requests for performance
  event.respondWith(
    caches.match(req).then(cachedResponse => {
      if (cachedResponse) { return cachedResponse; }
      // request is not in cache. make network request and cache the response
      return caches.open(CACHE_V1).then(cache => fetch(req)
      .then(
        res => cache.put( req, res.clone())
      ).then(
        () => res 
      ));
    })
  );
});

self.addEventListener("sync", event => {
  if (event.tag == "syncAgain") {
    event.waitUntil(
      getTransactions().then(transactions => {
        return fetch("/api/transaction/bulk", {
          method: 'POST',
          body: JSON.stringify(transactions),
          headers: { 'Content-Type': 'application/json' }
        })
        .then(() => console.log("Database updated!"))
        .catch(err => console.log(err));
      })  
    );
  }
});

const saveRecord = record => {
  const openReq = indexedDB.open("offTransactions");
  openReq.onsuccess = e => {
    const db = e.target.result;
    const trans = db.transaction("offTransactions", "readwrite");
    const offTrans = trans.objectStore("offTransactions");
    if (!offTrans) {
      const objectStore = db.createObjectStore("offTransactions", {keyPath: "name"});
      objectStore.createIndex("name", "name", {unique: false});
      objectStore.createIndex("amount", "amount", {unique: false});
      objectStore.createIndex("date", "date", {unique: false});
    }
    const trans = {
      name: record.name,
      amount: record.value,
      date: record.date
    };
    const storeReq = offTrans.add(trans);
    storeReq.onsuccess = evt => {
      const transAdded = evt.target.result;
      console.log("Offline transaction added!", transAdded);
    };              
  };
}