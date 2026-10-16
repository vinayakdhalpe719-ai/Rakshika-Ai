/**
 * Local-First IndexedDB Caching & Offline Synchronization Layer
 * Rakshika AI Women's Safety & Guardian Ecosystem
 *
 * Provides persistent offline resilience for:
 * 1. Emergency Incidents & SOS Logs
 * 2. Telemetry, Audit Trail & Safety Events
 * 3. Emergency Medical Profiles, Blood Groups, Allergies & Emergency Contacts
 * 4. Last-known Safe GPS Locations
 * 5. Offline Queue for SOS Triggers & Actions created when cellular signal is dead
 */

import { EmergencyIncident, SafetyEvent, LocationUpdate, UserProfile, VoiceClip } from '../types/safety';

const DB_NAME = 'rakshika_safety_offline_db';
const DB_VERSION = 2;

export interface QueuedOfflineAction {
  id: string;
  type: 'create_sos' | 'resolve_sos' | 'log_event' | 'update_location' | 'update_profile' | 'upload_voice_clip';
  payload: any;
  createdAt: string;
  attempts: number;
}

export interface CacheStats {
  incidentsCount: number;
  eventsCount: number;
  hasProfile: boolean;
  hasLocation: boolean;
  pendingQueueCount: number;
  voiceClipsCount?: number;
  lastCachedAt: string | null;
  storageSizeBytes?: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Initializes and returns the IndexedDB instance
 */
export function getOfflineDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported in this browser environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Incidents store
      if (!db.objectStoreNames.contains('incidents')) {
        const store = db.createObjectStore('incidents', { keyPath: 'id' });
        store.createIndex('by_userPhone', 'userPhone', { unique: false });
        store.createIndex('by_createdAt', 'createdAt', { unique: false });
        store.createIndex('by_status', 'status', { unique: false });
      }

      // 2. Safety telemetry events store
      if (!db.objectStoreNames.contains('safety_events')) {
        const store = db.createObjectStore('safety_events', { keyPath: 'id' });
        store.createIndex('by_userPhone', 'userPhone', { unique: false });
        store.createIndex('by_createdAt', 'createdAt', { unique: false });
        store.createIndex('by_eventType', 'eventType', { unique: false });
      }

      // 3. User & Medical Profiles
      if (!db.objectStoreNames.contains('profiles')) {
        db.createObjectStore('profiles', { keyPath: 'phone' });
      }

      // 4. Locations store
      if (!db.objectStoreNames.contains('locations')) {
        db.createObjectStore('locations', { keyPath: 'userPhone' });
      }

      // 5. Offline sync queue
      if (!db.objectStoreNames.contains('sync_queue')) {
        const queueStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
        queueStore.createIndex('by_createdAt', 'createdAt', { unique: false });
      }

      // 6. Metadata (last sync, app cache config)
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' });
      }

      // 7. Voice Clips store
      if (!db.objectStoreNames.contains('voice_clips')) {
        const voiceStore = db.createObjectStore('voice_clips', { keyPath: 'id' });
        voiceStore.createIndex('by_userPhone', 'userPhone', { unique: false });
        voiceStore.createIndex('by_createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('Failed to open IndexedDB'));
    };

    request.onblocked = () => {
      console.warn('IndexedDB upgrade blocked: please close other tabs of this app.');
    };
  });

  return dbPromise;
}

/**
 * Generic helper for executing a transaction
 */
async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => Promise<T> | T
): Promise<T> {
  const db = await getOfflineDb();
  return new Promise<T>((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);

      tx.onerror = () => reject(tx.error || new Error(`Transaction error on ${storeName}`));
      tx.onabort = () => reject(new Error(`Transaction aborted on ${storeName}`));

      const result = callback(store);
      if (result instanceof Promise) {
        result.then(resolve).catch(reject);
      } else {
        tx.oncomplete = () => resolve(result);
      }
    } catch (err) {
      reject(err);
    }
  });
}

// -------------------------------------------------------------
// INCIDENTS CACHING
// -------------------------------------------------------------

export async function cacheIncidents(incidents: EmergencyIncident[]): Promise<void> {
  if (!incidents || incidents.length === 0) return;
  const db = await getOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['incidents', 'metadata'], 'readwrite');
    const store = tx.objectStore('incidents');
    const meta = tx.objectStore('metadata');

    for (const inc of incidents) {
      if (inc && inc.id) {
        store.put(inc);
      }
    }

    meta.put({ key: 'last_incidents_cache', value: new Date().toISOString() });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function cacheSingleIncident(incident: EmergencyIncident): Promise<void> {
  if (!incident || !incident.id) return;
  return withStore('incidents', 'readwrite', (store) => {
    store.put(incident);
  });
}

export async function getCachedIncidents(userPhone?: string): Promise<EmergencyIncident[]> {
  const db = await getOfflineDb();
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('incidents', 'readonly');
      const store = tx.objectStore('incidents');
      const req = store.getAll();

      req.onsuccess = () => {
        let list: EmergencyIncident[] = req.result || [];
        if (userPhone) {
          list = list.filter((i) => i.userPhone === userPhone);
        }
        // Sort descending by createdAt
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        resolve(list);
      };

      req.onerror = () => {
        resolve([]);
      };
    } catch {
      resolve([]);
    }
  });
}

export async function updateCachedIncidentStatus(incidentId: string, status: 'RESOLVED' | 'ACTIVE', notes?: string): Promise<void> {
  return withStore('incidents', 'readwrite', async (store) => {
    return new Promise((resolve) => {
      const req = store.get(incidentId);
      req.onsuccess = () => {
        const item = req.result;
        if (item) {
          item.status = status;
          if (status === 'RESOLVED') {
            item.resolvedAt = new Date().toISOString();
          }
          if (notes) {
            item.notes = (item.notes || '') + ` [${notes}]`;
          }
          store.put(item);
        }
        resolve();
      };
      req.onerror = () => resolve();
    });
  });
}

// -------------------------------------------------------------
// SAFETY EVENTS CACHING
// -------------------------------------------------------------

export async function cacheSafetyEvents(events: SafetyEvent[]): Promise<void> {
  if (!events || events.length === 0) return;
  const db = await getOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['safety_events', 'metadata'], 'readwrite');
    const store = tx.objectStore('safety_events');
    const meta = tx.objectStore('metadata');

    for (const evt of events) {
      if (evt && evt.id) {
        store.put(evt);
      }
    }

    meta.put({ key: 'last_events_cache', value: new Date().toISOString() });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function cacheSingleSafetyEvent(evt: SafetyEvent): Promise<void> {
  if (!evt || !evt.id) return;
  return withStore('safety_events', 'readwrite', (store) => {
    store.put(evt);
  });
}

export async function getCachedSafetyEvents(userPhone?: string): Promise<SafetyEvent[]> {
  const db = await getOfflineDb();
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('safety_events', 'readonly');
      const store = tx.objectStore('safety_events');
      const req = store.getAll();

      req.onsuccess = () => {
        let list: SafetyEvent[] = req.result || [];
        if (userPhone) {
          list = list.filter((e) => e.userPhone === userPhone);
        }
        // Sort descending by createdAt
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        resolve(list);
      };

      req.onerror = () => {
        resolve([]);
      };
    } catch {
      resolve([]);
    }
  });
}

// -------------------------------------------------------------
// USER & MEDICAL PROFILE CACHING
// -------------------------------------------------------------

export async function cacheUserProfile(profile: Partial<UserProfile> & { phone: string }): Promise<void> {
  if (!profile || !profile.phone) return;
  return withStore('profiles', 'readwrite', (store) => {
    const data = {
      ...profile,
      _cachedAt: new Date().toISOString(),
    };
    store.put(data);
  });
}

export async function getCachedUserProfile(phone: string): Promise<any | null> {
  if (!phone) return null;
  return withStore('profiles', 'readonly', (store) => {
    return new Promise((resolve) => {
      const req = store.get(phone);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  });
}

// -------------------------------------------------------------
// LOCATION CACHING
// -------------------------------------------------------------

export async function cacheLocation(location: LocationUpdate): Promise<void> {
  if (!location || !location.userPhone) return;
  return withStore('locations', 'readwrite', (store) => {
    store.put({
      ...location,
      _cachedAt: new Date().toISOString(),
    });
  });
}

export async function getCachedLocation(userPhone: string): Promise<LocationUpdate | null> {
  if (!userPhone) return null;
  return withStore('locations', 'readonly', (store) => {
    return new Promise((resolve) => {
      const req = store.get(userPhone);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  });
}

// -------------------------------------------------------------
// OFFLINE QUEUE (WHEN CELLULAR CONNECTIVITY IS LOST)
// -------------------------------------------------------------

export async function enqueueOfflineAction(action: Omit<QueuedOfflineAction, 'id' | 'createdAt' | 'attempts'>): Promise<QueuedOfflineAction> {
  const item: QueuedOfflineAction = {
    ...action,
    id: `queue-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };

  await withStore('sync_queue', 'readwrite', (store) => {
    store.put(item);
  });

  return item;
}

export async function getPendingOfflineActions(): Promise<QueuedOfflineAction[]> {
  return withStore('sync_queue', 'readonly', (store) => {
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const list: QueuedOfflineAction[] = req.result || [];
        list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        resolve(list);
      };
      req.onerror = () => resolve([]);
    });
  });
}

export async function removeOfflineAction(id: string): Promise<void> {
  return withStore('sync_queue', 'readwrite', (store) => {
    store.delete(id);
  });
}

export async function incrementOfflineActionAttempt(id: string): Promise<void> {
  return withStore('sync_queue', 'readwrite', (store) => {
    return new Promise((resolve) => {
      const req = store.get(id);
      req.onsuccess = () => {
        const item = req.result;
        if (item) {
          item.attempts = (item.attempts || 0) + 1;
          store.put(item);
        }
        resolve();
      };
      req.onerror = () => resolve();
    });
  });
}

// -------------------------------------------------------------
// CACHE DIAGNOSTICS & STATS
// -------------------------------------------------------------

export async function getOfflineCacheStats(userPhone?: string): Promise<CacheStats> {
  try {
    const db = await getOfflineDb();
    const availableStores = Array.from(db.objectStoreNames);
    if (availableStores.length === 0) {
      return {
        incidentsCount: 0,
        eventsCount: 0,
        hasProfile: false,
        hasLocation: false,
        pendingQueueCount: 0,
        voiceClipsCount: 0,
        lastCachedAt: null,
      };
    }

    return new Promise((resolve) => {
      const tx = db.transaction(availableStores, 'readonly');

      let incidentsCount = 0;
      let eventsCount = 0;
      let hasProfile = false;
      let hasLocation = false;
      let pendingQueueCount = 0;
      let voiceClipsCount = 0;
      let lastCachedAt: string | null = null;

      if (availableStores.includes('incidents')) {
        const incReq = tx.objectStore('incidents').count();
        incReq.onsuccess = () => { incidentsCount = incReq.result; };
      }

      if (availableStores.includes('safety_events')) {
        const evReq = tx.objectStore('safety_events').count();
        evReq.onsuccess = () => { eventsCount = evReq.result; };
      }

      if (availableStores.includes('sync_queue')) {
        const queueReq = tx.objectStore('sync_queue').count();
        queueReq.onsuccess = () => { pendingQueueCount = queueReq.result; };
      }

      if (availableStores.includes('voice_clips')) {
        const vReq = tx.objectStore('voice_clips').count();
        vReq.onsuccess = () => { voiceClipsCount = vReq.result; };
      }

      if (availableStores.includes('metadata')) {
        const metaReq = tx.objectStore('metadata').get('last_incidents_cache');
        metaReq.onsuccess = () => {
          if (metaReq.result) {
            lastCachedAt = metaReq.result.value;
          }
        };
      }

      if (availableStores.includes('profiles')) {
        if (userPhone) {
          const pReq = tx.objectStore('profiles').get(userPhone);
          pReq.onsuccess = () => { hasProfile = !!pReq.result; };
        } else {
          const pReq = tx.objectStore('profiles').count();
          pReq.onsuccess = () => { hasProfile = pReq.result > 0; };
        }
      }

      if (availableStores.includes('locations')) {
        if (userPhone) {
          const lReq = tx.objectStore('locations').get(userPhone);
          lReq.onsuccess = () => { hasLocation = !!lReq.result; };
        } else {
          const lReq = tx.objectStore('locations').count();
          lReq.onsuccess = () => { hasLocation = lReq.result > 0; };
        }
      }

      tx.oncomplete = () => {
        resolve({
          incidentsCount,
          eventsCount,
          hasProfile,
          hasLocation,
          pendingQueueCount,
          voiceClipsCount,
          lastCachedAt,
        });
      };

      tx.onerror = () => {
        resolve({
          incidentsCount: 0,
          eventsCount: 0,
          hasProfile: false,
          hasLocation: false,
          pendingQueueCount: 0,
          voiceClipsCount: 0,
          lastCachedAt: null,
        });
      };
    });
  } catch {
    return {
      incidentsCount: 0,
      eventsCount: 0,
      hasProfile: false,
      hasLocation: false,
      pendingQueueCount: 0,
      voiceClipsCount: 0,
      lastCachedAt: null,
    };
  }
}

/**
 * Completely purges offline caches (for testing, vault reset, or privacy)
 */
export async function clearAllOfflineCache(): Promise<{ success: boolean; clearedStores: string[] }> {
  try {
    const db = await getOfflineDb();
    const availableStores = Array.from(db.objectStoreNames);
    if (availableStores.length === 0) {
      return { success: true, clearedStores: [] };
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(availableStores, 'readwrite');
        for (const storeName of availableStores) {
          tx.objectStore(storeName).clear();
        }

        tx.oncomplete = () => {
          resolve({ success: true, clearedStores: availableStores });
        };

        tx.onerror = () => {
          reject(tx.error || new Error('Transaction error while clearing IndexedDB stores'));
        };

        tx.onabort = () => {
          reject(new Error('Transaction aborted while clearing IndexedDB stores'));
        };
      } catch (err) {
        // Fallback: clear individually if batch transaction fails
        let completed = 0;
        let errored = false;
        for (const storeName of availableStores) {
          try {
            const singleTx = db.transaction(storeName, 'readwrite');
            singleTx.objectStore(storeName).clear();
            singleTx.oncomplete = () => {
              completed++;
              if (completed === availableStores.length && !errored) {
                resolve({ success: true, clearedStores: availableStores });
              }
            };
            singleTx.onerror = () => {
              completed++;
              if (completed === availableStores.length && !errored) {
                resolve({ success: true, clearedStores: availableStores });
              }
            };
          } catch {
            completed++;
            if (completed === availableStores.length && !errored) {
              resolve({ success: true, clearedStores: availableStores });
            }
          }
        }
      }
    });
  } catch (err) {
    console.error('Failed to clear offline cache:', err);
    throw err;
  }
}

/**
 * Replays all pending offline actions to the backend when connectivity returns
 */
export async function flushOfflineSyncQueue(): Promise<{ syncedCount: number; errors: any[] }> {
  const pending = await getPendingOfflineActions();
  if (pending.length === 0) return { syncedCount: 0, errors: [] };

  let syncedCount = 0;
  const errors: any[] = [];

  for (const item of pending) {
    try {
      if (item.type === 'create_sos') {
        const res = await fetch('/api/sos-incident', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        });
        if (res.ok) {
          await removeOfflineAction(item.id);
          syncedCount++;
        } else {
          await incrementOfflineActionAttempt(item.id);
          errors.push({ id: item.id, status: res.status });
        }
      } else if (item.type === 'resolve_sos') {
        const incidentId = item.payload.incidentId;
        const res = await fetch(`/api/incidents/resolve/${encodeURIComponent(incidentId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        });
        if (res.ok) {
          await removeOfflineAction(item.id);
          syncedCount++;
        } else {
          await incrementOfflineActionAttempt(item.id);
          errors.push({ id: item.id, status: res.status });
        }
      } else if (item.type === 'log_event') {
        const res = await fetch('/api/safety-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        });
        if (res.ok) {
          await removeOfflineAction(item.id);
          syncedCount++;
        } else {
          await incrementOfflineActionAttempt(item.id);
          errors.push({ id: item.id, status: res.status });
        }
      } else if (item.type === 'update_location') {
        const res = await fetch('/api/location/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        });
        if (res.ok) {
          await removeOfflineAction(item.id);
          syncedCount++;
        } else {
          await incrementOfflineActionAttempt(item.id);
          errors.push({ id: item.id, status: res.status });
        }
      } else if (item.type === 'upload_voice_clip') {
        const res = await fetch('/api/voice-clips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        });
        if (res.ok) {
          await removeOfflineAction(item.id);
          syncedCount++;
        } else {
          await incrementOfflineActionAttempt(item.id);
          errors.push({ id: item.id, status: res.status });
        }
      }
    } catch (err) {
      await incrementOfflineActionAttempt(item.id);
      errors.push({ id: item.id, error: err });
    }
  }

  return { syncedCount, errors };
}

/**
 * Cache an array of voice clips for a user phone
 */
export async function cacheVoiceClips(userPhone: string, clips: VoiceClip[]): Promise<void> {
  const db = await getOfflineDb();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('voice_clips', 'readwrite');
      const store = tx.objectStore('voice_clips');
      clips.forEach((clip) => {
        store.put({ ...clip, userPhone });
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Retrieve cached voice clips for a user phone
 */
export async function getCachedVoiceClips(userPhone: string): Promise<VoiceClip[]> {
  const db = await getOfflineDb();
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('voice_clips', 'readonly');
      const store = tx.objectStore('voice_clips');
      const index = store.index('by_userPhone');
      const request = index.getAll(userPhone);
      request.onsuccess = () => {
        const results = (request.result || []) as VoiceClip[];
        results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        resolve(results);
      };
      request.onerror = () => resolve([]);
    } catch (err) {
      resolve([]);
    }
  });
}

/**
 * Cache a single voice clip
 */
export async function cacheSingleVoiceClip(clip: VoiceClip): Promise<void> {
  const db = await getOfflineDb();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('voice_clips', 'readwrite');
      const store = tx.objectStore('voice_clips');
      store.put(clip);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    } catch (err) {
      reject(err);
    }
  });
}
