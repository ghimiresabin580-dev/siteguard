// Photos are shrunk on the phone and kept in IndexedDB, so they do not fill up localStorage.

const DB_NAME = 'siteguard-photos';
let dbPromise = null;
const memory = new Map();   // fallback when IndexedDB is blocked (private windows)
const urls = new Map();

function open() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  dbPromise ||= new Promise(resolve => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('photos');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

async function shrink(file, max = 1400) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(b => r(b || file), 'image/jpeg', 0.78));
  } catch {
    return file;
  }
}

export async function savePhoto(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Choose a photo (JPG, PNG or HEIC).');
  const blob = await shrink(file);
  const id = 'ph-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36));
  const db = await open();
  if (db) {
    await new Promise((res, rej) => {
      const tx = db.transaction('photos', 'readwrite');
      tx.objectStore('photos').put(blob, id);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } else memory.set(id, blob);
  return id;
}

export async function photoUrl(id) {
  if (!id) return null;
  if (urls.has(id)) return urls.get(id);
  let blob = memory.get(id);
  if (!blob) {
    const db = await open();
    if (db) blob = await new Promise(res => {
      const req = db.transaction('photos').objectStore('photos').get(id);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => res(null);
    });
  }
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return url;
}

export async function deletePhoto(id) {
  memory.delete(id);
  const db = await open();
  if (db) db.transaction('photos', 'readwrite').objectStore('photos').delete(id);
}

// Fills in every <img data-photo="id"> inside root
export function hydratePhotos(root = document) {
  root.querySelectorAll('img[data-photo]:not([src])').forEach(async img => {
    const url = await photoUrl(img.dataset.photo);
    if (url) img.src = url;
    else img.replaceWith(Object.assign(document.createElement('span'), { className: 'photo-missing', textContent: 'Photo not on this device' }));
  });
}
