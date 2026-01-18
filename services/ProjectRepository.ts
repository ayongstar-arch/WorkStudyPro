
import { ProjectData } from '../types';

const DB_NAME = 'WorkStudyProDB';
const STORE_NAME = 'projects';
const PROJECT_KEY = 'current_project';

// Simple IndexedDB wrapper
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject('IndexedDB Error');
    };
  });
};

export const ProjectRepository = {
  async save(data: Partial<ProjectData>): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      // We merge with existing data to prevent overwriting with partials if not careful,
      // but for this simple implementation, we assume 'data' contains the full state we want to persist
      // or we fetch first. Here we assume full save for simplicity in App logic.
      const request = store.put({ ...data, updatedAt: Date.now() }, PROJECT_KEY);

      request.onsuccess = () => resolve();
      request.onerror = () => reject('Save failed');
    });
  },

  async load(): Promise<ProjectData | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(PROJECT_KEY);

      request.onsuccess = () => {
        resolve(request.result as ProjectData || null);
      };
      request.onerror = () => reject('Load failed');
    });
  },

  async clear(): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(PROJECT_KEY);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject('Clear failed');
    });
  }
};
