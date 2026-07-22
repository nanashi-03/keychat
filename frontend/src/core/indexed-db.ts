import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';

class IndexedDbService {
  private dbPromise: Promise<IDBPDatabase>;

  constructor() {
    this.dbPromise = openDB('keychat-react-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('keys')) {
          db.createObjectStore('keys');
        }
        if (!db.objectStoreNames.contains('decrypted_cache')) {
          db.createObjectStore('decrypted_cache');
        }
      }
    });
  }

  async cacheDecryptedMessage(messageId: string, plainText: string): Promise<void> {
    const db = await this.dbPromise;
    await db.put('decrypted_cache', plainText, messageId);
  }

  async getCachedMessage(messageId: string): Promise<string | undefined> {
    const db = await this.dbPromise;
    return db.get('decrypted_cache', messageId);
  }

  async clear(): Promise<void> {
    const db = await this.dbPromise;
    await db.clear('keys');
    await db.clear('decrypted_cache');
  }
}

export const idbService = new IndexedDbService();
