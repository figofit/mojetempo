/** Local-only IndexedDB storage. Photos remain on this device as Blobs. */
const DATABASE_NAME = 'moje-tempo';
const DATABASE_VERSION = 1;
let databasePromise;

function storageError(error) {
  const reason = error?.name === 'QuotaExceededError'
    ? 'Úložiště je plné. Uvolni místo nebo zvol menší fotografii.'
    : 'Data se nepodařilo uložit nebo načíst v tomto prohlížeči. Zkontroluj povolení místního úložiště.';
  return new Error(reason, { cause: error });
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('Tento prohlížeč nepodporuje místní úložiště IndexedDB.'));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let blocked = false;
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('kv')) database.createObjectStore('kv');
      if (!database.objectStoreNames.contains('photos')) database.createObjectStore('photos');
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) {
        database.close();
        return;
      }
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      database.onclose = () => { databasePromise = undefined; };
      resolve(database);
    };
    request.onerror = () => reject(storageError(request.error));
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Dokončení změny úložiště blokuje jiná karta. Zavři ostatní karty aplikace a zkus to znovu.'));
    };
  }).catch((error) => {
    databasePromise = undefined;
    throw error;
  });
  return databasePromise;
}

async function transaction(storeName, mode, operation) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = database.transaction(storeName, mode);
      const request = operation(tx.objectStore(storeName));
      let result;
      request.onsuccess = () => { result = request.result; };
      // Resolve after commit, not merely after the individual request succeeds.
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(storageError(tx.error || request.error));
      tx.onabort = () => reject(storageError(tx.error || request.error));
    } catch (error) {
      try { tx?.abort(); } catch { /* Already completed. */ }
      reject(storageError(error));
    }
  });
}

export async function loadState() {
  return (await transaction('kv', 'readonly', (store) => store.get('state'))) ?? null;
}

export async function saveState(state) {
  if (!state || typeof state !== 'object' || !Array.isArray(state.entries)) throw new TypeError('Deník musí obsahovat seznam záznamů.');
  await transaction('kv', 'readwrite', (store) => store.put(state, 'state'));
}

/**
 * Atomic read–modify–write. IndexedDB serializes readwrite transactions for kv,
 * including transactions opened by other tabs on the same origin. The mutator
 * must be synchronous: async work would let the IDB transaction become inactive.
 * Resolves with the committed next state, never before transaction completion.
 */
export async function updateState(mutator) {
  if (typeof mutator !== 'function') throw new TypeError('Aktualizace deníku potřebuje funkci.');
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    let tx;
    let next;
    let mutationError;
    try {
      tx = database.transaction('kv', 'readwrite');
      const store = tx.objectStore('kv');
      const request = store.get('state');
      request.onsuccess = () => {
        try {
          next = mutator(request.result ?? null);
          if (next && typeof next.then === 'function') throw new TypeError('Aktualizace deníku musí být synchronní.');
          if (!next || typeof next !== 'object' || !Array.isArray(next.entries)) throw new TypeError('Deník musí obsahovat seznam záznamů.');
          store.put(next, 'state');
        } catch (error) {
          mutationError = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(next);
      tx.onerror = () => reject(mutationError || storageError(tx.error || request.error));
      tx.onabort = () => reject(mutationError || storageError(tx.error || request.error));
    } catch (error) {
      try { tx?.abort(); } catch { /* Already completed. */ }
      reject(storageError(error));
    }
  });
}

export async function savePhoto(id, blob) {
  if (typeof id !== 'string' || !id || !(blob instanceof Blob)) throw new TypeError('Fotografie potřebuje identifikátor a platný soubor.');
  await transaction('photos', 'readwrite', (store) => store.put(blob, id));
}

export async function getPhoto(id) {
  return (await transaction('photos', 'readonly', (store) => store.get(id))) ?? null;
}

export async function deletePhoto(id) {
  await transaction('photos', 'readwrite', (store) => store.delete(id));
}

export async function getValue(key) {
  return (await transaction('kv','readonly',store=>store.get(key))) ?? null;
}
export async function setValue(key,value) {
  await transaction('kv','readwrite',store=>store.put(value,key));
}
/** Shared by all tabs, including the sync worker. No async operations inside a transaction. */
export async function mutateValue(key,mutator) {
  const database=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=database.transaction('kv','readwrite'),store=tx.objectStore('kv'),request=store.get(key);let next,mutationError;
    request.onsuccess=()=>{try{next=mutator(request.result??null);store.put(next,key);}catch(error){mutationError=error;tx.abort();}};
    tx.oncomplete=()=>resolve(next);
    tx.onerror=tx.onabort=()=>reject(mutationError||storageError(tx.error||request.error));
  });
}
