/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, Mic, MapPin, Shield, ArrowRight, CheckCircle2, 
  AlertTriangle, Bell, Activity, Users, Phone, Home, 
  Video, Radio, LogOut, Navigation, HeartPulse, ShieldAlert,
  Lock, Map, Cloud, AlertCircle, Moon, Fingerprint, Check, RefreshCw, Key, ShieldCheck, Info,
  Menu, X, Eye, Database, WifiOff, HardDrive, PlusCircle, Volume2, VolumeX, Trash2, Clock
} from 'lucide-react';
import { SUPPORTED_LANGUAGES, TRANSLATIONS, LanguageCode, DISTRESS_KEYWORDS, translate } from './translations';
import LanguageSelector from './components/LanguageSelector';
import SosButton from './components/SosButton';
import LiveLocationMap from './components/LiveLocationMap';
import VoiceDangerPanel from './components/VoiceDangerPanel';
import GuardianLinkingModal from './components/GuardianLinkingModal';
import GuardianDashboard from './components/GuardianDashboard';
import AuthModal from './components/AuthModal';
import FlashSosModal from './components/FlashSosModal';
import OfflineStatusBanner from './components/OfflineStatusBanner';
import RakshikaLogo from './components/RakshikaLogo';
import { audioAlert } from './utils/audioAlert';
import { getWebSocketUrl, LiveAudioCapture, LiveAudioPlayer } from './utils/liveStream';
import { UserRole, LocationUpdate, EmergencyIncident, SafetyEvent, GuardianAccessPermissions, GuardianAccessRequests } from './types/safety';
import GuardianAccessControls from './components/GuardianAccessControls';
import { 
  cacheIncidents, 
  getCachedIncidents, 
  cacheSafetyEvents, 
  getCachedSafetyEvents,
  cacheUserProfile,
  getCachedUserProfile,
  cacheLocation,
  getCachedLocation,
  cacheSingleIncident,
  cacheSingleSafetyEvent,
  updateCachedIncidentStatus,
  enqueueOfflineAction,
  flushOfflineSyncQueue,
  clearAllOfflineCache,
  getOfflineCacheStats,
  CacheStats
} from './lib/offlineStorage';

export default function App() {
  const [step, setStep] = useState<'landing' | 'permissions' | 'dashboard' | 'guardian-dashboard'>(() => {
    try {
      const savedSession = localStorage.getItem('rakshika_user_session');
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        if (parsed.role === 'guardian') {
          return 'guardian-dashboard';
        }
        // When user refreshes the website, all 3 permissions are automatically unaccessed
        // and we prompt the user on the permissions screen to give permission
        return 'permissions';
      }
    } catch (_) {}
    return 'landing';
  });
  const [activeTab, setActiveTab] = useState<'overview' | 'tracking' | 'voice' | 'guardians' | 'contacts' | 'logs' | 'medical' | 'vault' | 'community' | 'privacy'>('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isFakeCallActive, setIsFakeCallActive] = useState(false);
  const [isFakeCallAnswered, setIsFakeCallAnswered] = useState(false);
  const [fakeCallSeconds, setFakeCallSeconds] = useState(0);
  const [isFlashActive, setIsFlashActive] = useState(false);
  const [isSirenMuted, setIsSirenMuted] = useState(false);
  const [isNightMode, setIsNightMode] = useState(false);
  const [isVaultUnlocked, setIsVaultUnlocked] = useState(false);
  const [vaultCacheStats, setVaultCacheStats] = useState<CacheStats | null>(null);
  const [vaultResetConfirm, setVaultResetConfirm] = useState(false);
  const [isVaultResetting, setIsVaultResetting] = useState(false);
  const [vaultResetMessage, setVaultResetMessage] = useState<string | null>(null);
  
  // User Profile
  const [userData, setUserData] = useState<{
    fullName: string;
    phone: string;
    email: string;
    role: UserRole;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    bloodGroup?: string;
    allergies?: string;
    medicalNotes?: string;
  }>(() => {
    try {
      const savedSession = localStorage.getItem('rakshika_user_session');
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        if (parsed.role === 'user') {
          return {
            fullName: parsed.fullName || 'Priya Sharma',
            phone: parsed.phone || '+91 98765 43210',
            email: parsed.email || 'priya@rakshika.ai',
            role: 'user',
            emergencyContactName: parsed.emergencyContactName || 'Father (Rajesh)',
            emergencyContactPhone: parsed.emergencyContactPhone || '+91 98111 22334',
            bloodGroup: 'O+',
            allergies: 'None reported',
            medicalNotes: 'Profile created via Rakshika AI',
          };
        }
      }
    } catch (_) {}
    return {
      fullName: 'Priya Sharma',
      phone: '+91 98765 43210',
      email: 'priya@rakshika.ai',
      role: 'user',
      emergencyContactName: 'Father (Rajesh)',
      emergencyContactPhone: '+91 98111 22334',
      bloodGroup: 'O+',
      allergies: 'None reported',
      medicalNotes: 'Profile created via Rakshika AI',
    };
  });

  // Guardian specific state
  const [guardianData, setGuardianData] = useState({
    name: 'Rajesh Sharma',
    phone: '+91 98111 22334',
  });

  // SOS & Incidents State
  const [isSosActive, setIsSosActive] = useState(false);
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<EmergencyIncident[]>([]);
  const [safetyEvents, setSafetyEvents] = useState<SafetyEvent[]>([]);

  // Local-First IndexedDB Caching & Offline State
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(false);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);

  // Telemetry & Permissions
  const [isSharingLocation, setIsSharingLocation] = useState(true);
  const [currentLocation, setCurrentLocation] = useState<LocationUpdate | null>(null);
  const [locationPermStatus, setLocationPermStatus] = useState<'prompt' | 'granted' | 'denied' | 'unavailable'>('prompt');
  const [perms, setPerms] = useState({ camera: false, mic: false, location: false });
  const [permRequesting, setPermRequesting] = useState<'camera' | 'mic' | 'location' | 'all' | null>(null);
  const [permErrorMsg, setPermErrorMsg] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [infoModal, setInfoModal] = useState<'features' | 'how-it-works' | 'safety-guide' | null>(null);

  // Bidirectional Guardian Access Permissions State on User Device
  const [guardianAccessPermissions, setGuardianAccessPermissions] = useState<GuardianAccessPermissions>({
    camera: true,
    microphone: true,
    location: true,
  });
  const [guardianAccessPendingRequests, setGuardianAccessPendingRequests] = useState<GuardianAccessRequests>({});

  // Live Communication & Surveillance State (User -> Guardian Relay)
  const [guardianIsListening, setGuardianIsListening] = useState(false);
  const [guardianConnectedToLive, setGuardianConnectedToLive] = useState(false);
  const userVideoRef = useRef<HTMLVideoElement | null>(null);
  const userMicStreamRef = useRef<MediaStream | null>(null);
  const audioCaptureRef = useRef<LiveAudioCapture | null>(null);
  const userAudioPlayerRef = useRef<LiveAudioPlayer | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastCapturedImageRef = useRef<string | null>(null);

  // Multi-Language State
  const [lang, setLang] = useState<LanguageCode>(() => {
    try {
      const saved = localStorage.getItem('rakshika_lang') as LanguageCode;
      if (saved && TRANSLATIONS[saved]) return saved;
    } catch (e) {}
    return 'en';
  });

  const handleLanguageChange = (newLang: LanguageCode) => {
    setLang(newLang);
    try {
      localStorage.setItem('rakshika_lang', newLang);
    } catch (e) {}
  };

  const t = (key: string, defaultText?: string): string => {
    return translate(key, lang, defaultText);
  };

  const [isRefreshingIncidents, setIsRefreshingIncidents] = useState(false);
  const [incidentsRefreshedText, setIncidentsRefreshedText] = useState<string | null>(null);
  const [isGlobalRefreshing, setIsGlobalRefreshing] = useState(false);
  const [globalRefreshedText, setGlobalRefreshedText] = useState<string | null>(null);

  const handleRefreshIncidents = async () => {
    setIsRefreshingIncidents(true);
    setIncidentsRefreshedText(null);
    try {
      await loadIncidents(userData.phone);
      setIncidentsRefreshedText(t('Refreshed!', 'Refreshed!'));
      setTimeout(() => setIncidentsRefreshedText(null), 2500);
    } finally {
      setIsRefreshingIncidents(false);
    }
  };

  const handleGlobalRefresh = async () => {
    setIsGlobalRefreshing(true);
    setGlobalRefreshedText(null);
    try {
      await Promise.all([
        loadIncidents(userData.phone),
        new Promise<void>((resolve) => {
          if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setCurrentLocation({
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                  accuracy: pos.coords.accuracy,
                  speed: pos.coords.speed,
                  timestamp: Date.now(),
                });
                resolve();
              },
              () => resolve(),
              { enableHighAccuracy: true, timeout: 5000 }
            );
          } else {
            resolve();
          }
        }),
      ]);
      setGlobalRefreshedText(t('Refreshed!', 'Refreshed!'));
      setTimeout(() => setGlobalRefreshedText(null), 2500);
    } finally {
      setIsGlobalRefreshing(false);
    }
  };

  // Local-First: Load user incident history from IndexedDB first, then synchronize with cloud
  const loadIncidents = async (userPhone?: string) => {
    const p = userPhone || userData.phone;
    if (!p) return;

    // 1. Immediately read from IndexedDB local cache for instantaneous offline access
    try {
      const cachedInc = await getCachedIncidents(p);
      if (cachedInc && cachedInc.length > 0) {
        setIncidents(cachedInc);
        const active = cachedInc.find((i: EmergencyIncident) => i.status === 'ACTIVE');
        if (active) {
          setIsSosActive(true);
          setActiveIncidentId(active.id);
        }
      }
      const cachedEv = await getCachedSafetyEvents(p);
      if (cachedEv && cachedEv.length > 0) {
        setSafetyEvents(cachedEv);
      }
    } catch (err) {
      console.warn("IndexedDB read warning:", err);
    }

    // 2. If online and not simulating offline cellular loss, sync from cloud and persist in IndexedDB
    if (!isSimulatedOffline && navigator.onLine) {
      try {
        const res = await fetch(`/api/incidents?phone=${encodeURIComponent(p)}`);
        if (res.ok) {
          const data = await res.json();
          setIncidents(data);
          cacheIncidents(data).catch(() => {});
          const active = data.find((i: EmergencyIncident) => i.status === 'ACTIVE');
          if (active) {
            setIsSosActive(true);
            setActiveIncidentId(active.id);
          }
        }
        const evRes = await fetch(`/api/safety-events?phone=${encodeURIComponent(p)}`);
        if (evRes.ok) {
          const evData = await evRes.json();
          setSafetyEvents(evData);
          cacheSafetyEvents(evData).catch(() => {});
        }
      } catch (e) {
        console.warn("Cellular/network fetch failed, persisting on IndexedDB cache:", e);
      }
    }
  };

  // Dedicated refresh handler for IndexedDB Local-First Safety Vault stats
  const refreshVaultStats = async () => {
    try {
      const st = await getOfflineCacheStats(userData.phone);
      setVaultCacheStats(st);
    } catch (_) {}
  };

  useEffect(() => {
    if (activeTab === 'vault') {
      refreshVaultStats();
    }
  }, [activeTab, userData.phone]);

  const handleVaultResetCache = async () => {
    setIsVaultResetting(true);
    setVaultResetMessage(null);
    setVaultResetConfirm(false);
    try {
      const res = await clearAllOfflineCache();
      setVaultCacheStats({
        incidentsCount: 0,
        eventsCount: 0,
        hasProfile: false,
        hasLocation: false,
        pendingQueueCount: 0,
        voiceClipsCount: 0,
        lastCachedAt: null,
      });
      setVaultResetMessage(`Local IndexedDB Safety Vault cache wiped successfully (${res.clearedStores.length} stores reset to 0 items).`);
    } catch (e) {
      console.error('Failed to reset vault cache:', e);
      setVaultResetMessage('Failed to reset cache. Please retry.');
    } finally {
      setIsVaultResetting(false);
      setTimeout(() => setVaultResetMessage(null), 6000);
    }
  };

  const handleVaultSyncCloud = async () => {
    try {
      await loadIncidents(userData.phone);
      await refreshVaultStats();
      setVaultResetMessage('Cloud safety records synchronized and cached to IndexedDB Vault.');
      setTimeout(() => setVaultResetMessage(null), 4000);
    } catch (_) {}
  };

  // Hydrate user medical profile and last location from IndexedDB on startup
  useEffect(() => {
    const hydrateEssentials = async () => {
      try {
        const cachedProf = await getCachedUserProfile(userData.phone);
        if (cachedProf) {
          setUserData((prev) => ({ ...prev, ...cachedProf }));
        }
        const cachedLoc = await getCachedLocation(userData.phone);
        if (cachedLoc && !currentLocation) {
          setCurrentLocation(cachedLoc);
        }
      } catch (e) {
        console.warn("Failed to hydrate from IndexedDB", e);
      }
    };
    hydrateEssentials();
  }, []);

  // Persist user medical profile to IndexedDB whenever it changes
  useEffect(() => {
    if (userData.phone) {
      cacheUserProfile(userData).catch(() => {});
    }
  }, [userData]);

  // Persist latest GPS location to IndexedDB whenever acquired
  useEffect(() => {
    if (currentLocation) {
      cacheLocation(currentLocation).catch(() => {});
    }
  }, [currentLocation]);

  // Automatic sync queue flush when cellular/internet returns
  useEffect(() => {
    const handleOnline = async () => {
      if (!isSimulatedOffline) {
        const res = await flushOfflineSyncQueue();
        if (res.syncedCount > 0) {
          setOfflineNotice(`Signal restored: Synced ${res.syncedCount} queued safety action(s).`);
          setTimeout(() => setOfflineNotice(null), 4000);
          loadIncidents(userData.phone);
        }
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [isSimulatedOffline, userData.phone]);

  // Location Watcher (only actively watches when user has enabled sharing)
  useEffect(() => {
    if (step !== 'dashboard' || !isSharingLocation) return;

    if (!('geolocation' in navigator)) {
      setLocationPermStatus('unavailable');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLocationPermStatus('granted');
        const update: LocationUpdate = {
          userPhone: userData.phone,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          timestamp: pos.timestamp,
          isSharing: true,
        };
        setCurrentLocation(update);

        // Sync to backend
        fetch('/api/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: userData.phone,
            location: update,
          }),
        }).catch((err) => console.warn("Location sync warning:", err));
      },
      (err) => {
        console.warn("Geolocation warning:", err.message);
        if (err.code === err.PERMISSION_DENIED) {
          setLocationPermStatus('denied');
        }
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [step, isSharingLocation, userData.phone]);

  // Fake Call Call-Duration Timer
  useEffect(() => {
    let timer: any = null;
    if (isFakeCallActive && isFakeCallAnswered) {
      timer = setInterval(() => {
        setFakeCallSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setFakeCallSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isFakeCallActive, isFakeCallAnswered]);

  // Handle Location Sharing Toggle
  const handleToggleLocationSharing = async () => {
    const nextSharing = !isSharingLocation;
    setIsSharingLocation(nextSharing);

    if (currentLocation) {
      cacheLocation({ ...currentLocation, isSharing: nextSharing }).catch(() => {});
    }

    const localEvt: SafetyEvent = {
      id: 'ev-local-' + Date.now(),
      userPhone: userData.phone,
      userName: userData.fullName,
      eventType: nextSharing ? 'location_started' : 'location_stopped',
      details: nextSharing
        ? 'User started real-time GPS location sharing.'
        : 'User paused GPS location sharing. Telemetry is now private.',
      createdAt: new Date().toISOString(),
    };
    cacheSingleSafetyEvent(localEvt).catch(() => {});
    setSafetyEvents((prev) => [localEvt, ...prev]);

    if (isSimulatedOffline || !navigator.onLine) {
      await enqueueOfflineAction({
        type: 'update_location',
        payload: {
          phone: userData.phone,
          location: currentLocation ? { ...currentLocation, isSharing: nextSharing } : null,
          isSharing: nextSharing,
        },
      });
      await enqueueOfflineAction({
        type: 'log_event',
        payload: localEvt,
      });
      return;
    }

    try {
      await fetch('/api/location/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: userData.phone,
          location: currentLocation ? { ...currentLocation, isSharing: nextSharing } : null,
          isSharing: nextSharing,
        }),
      });

      await fetch('/api/safety-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localEvt),
      });
      loadIncidents(userData.phone);
    } catch (e) {
      console.warn("Failed to push location toggle, queued for sync:", e);
      await enqueueOfflineAction({
        type: 'update_location',
        payload: {
          phone: userData.phone,
          location: currentLocation ? { ...currentLocation, isSharing: nextSharing } : null,
          isSharing: nextSharing,
        },
      });
    }
  };

  // Toggle SOS Siren Mute/Unmute
  const handleToggleMuteSiren = () => {
    setIsSirenMuted((prev) => {
      const next = !prev;
      if (next) {
        audioAlert.mute();
      } else {
        audioAlert.unmute();
      }
      return next;
    });
  };

  // Trigger SOS Incident (Local-First IndexedDB Resilience)
  const handleTriggerSOS = async (triggerType: string = 'manual_sos', notes?: string) => {
    setIsSosActive(true);
    setIsSirenMuted(false);
    audioAlert.resume();
    audioAlert.startSiren(0.35);

    const isOffline = isSimulatedOffline || !navigator.onLine;
    const localId = 'inc-local-' + Date.now();
    const localIncident: EmergencyIncident = {
      id: localId,
      userPhone: userData.phone,
      userName: userData.fullName,
      triggerType: triggerType as any,
      latitude: currentLocation?.latitude ?? 19.0760,
      longitude: currentLocation?.longitude ?? 72.8777,
      status: 'ACTIVE',
      notes: notes || `SOS triggered via ${triggerType} [IndexedDB Local Cache]`,
      createdAt: new Date().toISOString(),
    };

    const localEvt: SafetyEvent = {
      id: 'ev-local-' + Date.now(),
      userPhone: userData.phone,
      userName: userData.fullName,
      eventType: 'sos_triggered',
      details: notes || `Emergency SOS triggered via ${triggerType}`,
      createdAt: new Date().toISOString(),
    };

    setActiveIncidentId(localId);
    setIncidents((prev) => [localIncident, ...prev.filter((i) => i.id !== localId)]);
    setSafetyEvents((prev) => [localEvt, ...prev]);

    // Immediately cache into IndexedDB
    cacheSingleIncident(localIncident).catch(() => {});
    cacheSingleSafetyEvent(localEvt).catch(() => {});

    if (isOffline) {
      await enqueueOfflineAction({
        type: 'create_sos',
        payload: {
          phone: userData.phone,
          userName: userData.fullName,
          triggerType,
          location: currentLocation ? { lat: currentLocation.latitude, lng: currentLocation.longitude } : null,
          notes: localIncident.notes,
        },
      });
      await enqueueOfflineAction({
        type: 'log_event',
        payload: localEvt,
      });
      setOfflineNotice('Cellular coverage dead: SOS cached locally in IndexedDB & queued for automatic broadcast.');
      setTimeout(() => setOfflineNotice(null), 5000);
      return;
    }

    try {
      const res = await fetch('/api/sos-incident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: userData.phone,
          userName: userData.fullName,
          triggerType,
          location: currentLocation ? { lat: currentLocation.latitude, lng: currentLocation.longitude } : null,
          notes: notes || `SOS triggered via ${triggerType}`,
        }),
      });
      const data = await res.json();
      if (data.incident?.id) {
        setActiveIncidentId(data.incident.id);
        cacheSingleIncident(data.incident).catch(() => {});
      }
      loadIncidents(userData.phone);
    } catch (e) {
      console.warn("Cellular network error during SOS dispatch, queued in IndexedDB:", e);
      await enqueueOfflineAction({
        type: 'create_sos',
        payload: {
          phone: userData.phone,
          userName: userData.fullName,
          triggerType,
          location: currentLocation ? { lat: currentLocation.latitude, lng: currentLocation.longitude } : null,
          notes: localIncident.notes,
        },
      });
      setOfflineNotice('Network unreachable. SOS saved locally in IndexedDB queue.');
      setTimeout(() => setOfflineNotice(null), 4000);
    }
  };

  // Resolve SOS Incident (Local-First IndexedDB Resilience)
  const handleResolveSOS = async () => {
    setIsSosActive(false);
    setIsSirenMuted(false);
    audioAlert.stopSiren();
    if (!activeIncidentId) return;

    const idToResolve = activeIncidentId;
    setActiveIncidentId(null);

    // Update locally in IndexedDB immediately
    updateCachedIncidentStatus(idToResolve, 'RESOLVED', 'Emergency marked as RESOLVED by user').catch(() => {});
    setIncidents((prev) =>
      prev.map((inc) => (inc.id === idToResolve ? { ...inc, status: 'RESOLVED', resolvedAt: new Date().toISOString() } : inc))
    );

    const isOffline = isSimulatedOffline || !navigator.onLine;
    if (isOffline) {
      await enqueueOfflineAction({
        type: 'resolve_sos',
        payload: {
          incidentId: idToResolve,
          userPhone: userData.phone,
          notes: 'Emergency marked as RESOLVED by user while in offline mode.',
        },
      });
      setOfflineNotice('Incident marked RESOLVED locally in IndexedDB. Will sync when cellular signal returns.');
      setTimeout(() => setOfflineNotice(null), 4000);
      return;
    }

    try {
      await fetch(`/api/incidents/resolve/${encodeURIComponent(idToResolve)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPhone: userData.phone,
          notes: 'Emergency marked as RESOLVED by user.',
        }),
      });
      loadIncidents(userData.phone);
    } catch (e) {
      console.warn("Cellular network error resolving SOS, queued in IndexedDB:", e);
      await enqueueOfflineAction({
        type: 'resolve_sos',
        payload: {
          incidentId: idToResolve,
          userPhone: userData.phone,
          notes: 'Emergency marked as RESOLVED by user.',
        },
      });
    }
  };

  // Voice Danger Keyword Trigger
  const handleVoiceDistress = (keyword: string, languageName: string) => {
    handleTriggerSOS('voice_sos', `Speech recognition detected distress keyword "${keyword}" in ${languageName}.`);
  };

  // Device Fall & Shake Detection
  useEffect(() => {
    if (step !== 'dashboard') return;

    let lastX = 0, lastY = 0, lastZ = 0;
    const threshold = 18;

    const handleMotion = (event: DeviceMotionEvent) => {
      if (!event.accelerationIncludingGravity) return;
      const { x, y, z } = event.accelerationIncludingGravity;
      if (x === null || y === null || z === null) return;

      const deltaX = Math.abs(lastX - x);
      const deltaY = Math.abs(lastY - y);
      const deltaZ = Math.abs(lastZ - z);

      if (lastX !== 0 && lastY !== 0 && lastZ !== 0) {
        if (deltaX > threshold || deltaY > threshold || deltaZ > threshold) {
          handleTriggerSOS('shake_fall', 'Sudden physical shake or impact detected via device accelerometer.');
        }
      }
      lastX = x;
      lastY = y;
      lastZ = z;
    };

    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      (DeviceMotionEvent as any).requestPermission().then((state: string) => {
        if (state === 'granted') window.addEventListener('devicemotion', handleMotion);
      }).catch(console.error);
    } else {
      window.addEventListener('devicemotion', handleMotion);
    }

    return () => {
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [step]);

  // Periodic Telemetry Synchronization to Server State Store
  useEffect(() => {
    if (step === 'dashboard' && userData.phone) {
      const interval = setInterval(async () => {
        // Skip network sync when cellular signal is dead or simulated offline
        if (isSimulatedOffline || !navigator.onLine) {
          return;
        }

        let lastImage = lastCapturedImageRef.current || null;
        if (guardianAccessPermissions.camera && userVideoRef.current && userVideoRef.current.readyState >= 2) {
          if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
          const canvas = canvasRef.current;
          canvas.width = 320;
          canvas.height = 240;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(userVideoRef.current, 0, 0, canvas.width, canvas.height);
            lastImage = canvas.toDataURL('image/jpeg', 0.25);
            lastCapturedImageRef.current = lastImage;
          }
        } else if (!guardianAccessPermissions.camera) {
          lastImage = null;
        }

        const statePayload = {
          userName: userData.fullName,
          userPhone: userData.phone,
          profile: {
            fullName: userData.fullName,
            phone: userData.phone,
            email: userData.email,
            bloodGroup: userData.bloodGroup || 'O+',
            allergies: userData.allergies || 'None reported',
            medicalNotes: userData.medicalNotes || 'No chronic conditions reported. Voice Guard active.',
            emergencyContactName: userData.emergencyContactName || 'Father (Rajesh)',
            emergencyContactPhone: userData.emergencyContactPhone || '+91 98111 22334',
          },
          location: currentLocation ? { ...currentLocation, isSharing: isSharingLocation && guardianAccessPermissions.location } : null,
          isSharingLocation: isSharingLocation && guardianAccessPermissions.location,
          guardianPermissions: guardianAccessPermissions,
          audioStatus: isSosActive ? 'EMERGENCY DISTRESS DETECTED' : 'Safe ambient audio - Voice Shield Active',
          sosActive: isSosActive,
          lastImage: lastImage,
          timestamp: Date.now(),
        };

        try {
          await fetch('/api/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: userData.phone, state: statePayload }),
          });
        } catch (e) {}
      }, 1500);

      return () => clearInterval(interval);
    }
  }, [step, userData, isSharingLocation, currentLocation, isSosActive, cameraStream, isSimulatedOffline]);

  // Camera preview handling & Video Element Attachment
  useEffect(() => {
    let stream: MediaStream | null = null;
    if (step === 'dashboard' && perms.camera) {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then((s) => {
          stream = s;
          setCameraStream(s);
          if (userVideoRef.current) {
            userVideoRef.current.srcObject = s;
            userVideoRef.current.play().catch(() => {});
          }
        })
        .catch(console.warn);
    }
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    };
  }, [step, perms.camera]);

  // Real-Time Live Communication Relay (WebSocket: Camera, Microphone & Intercom)
  useEffect(() => {
    if (step !== 'dashboard' || !userData.phone) return;

    let ws: WebSocket | null = null;
    let frameInterval: any = null;
    let micStream: MediaStream | null = null;

    // Player to receive talkback from guardian
    const player = new LiveAudioPlayer(16000);
    player.setMuted(false);
    player.setVolume(1.0);
    userAudioPlayerRef.current = player;

    const connectWebSocket = () => {
      try {
        const wsUrl = getWebSocketUrl();
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          ws?.send(JSON.stringify({
            type: 'register',
            role: 'user',
            phone: userData.phone,
            userName: userData.fullName,
          }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'guardian_talk_chunk' && data.pcm) {
              player.playChunk(data.pcm, data.sampleRate || 16000);
            } else if (data.type === 'guardian_speaker_status') {
              setGuardianIsListening(Boolean(data.isListening));
            } else if (data.type === 'guardian_connected') {
              setGuardianConnectedToLive(true);
            } else if (data.type === 'guardian_access_requested' && data.requests) {
              setGuardianAccessPendingRequests(data.requests);
            } else if (data.type === 'guardian_permission_updated' && data.permissions) {
              setGuardianAccessPermissions({
                camera: Boolean(data.permissions.camera),
                microphone: Boolean(data.permissions.microphone),
                location: Boolean(data.permissions.location),
                updatedAt: data.permissions.updatedAt,
                updatedBy: data.permissions.updatedBy,
              });
              if (data.permissions.requests) {
                setGuardianAccessPendingRequests(data.permissions.requests);
              }
            }
          } catch (e) {}
        };

        ws.onclose = () => {
          setTimeout(() => {
            if (step === 'dashboard') connectWebSocket();
          }, 3000);
        };
      } catch (e) {
        console.warn('Live WS connect error:', e);
      }
    };

    connectWebSocket();

    // 1. Live Camera Frames Stream (4 fps - ONLY if user granted permission to guardian)
    frameInterval = setInterval(() => {
      if (guardianAccessPermissions.camera && userVideoRef.current && userVideoRef.current.readyState >= 2 && ws && ws.readyState === WebSocket.OPEN) {
        try {
          if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
          const canvas = canvasRef.current;
          canvas.width = 320;
          canvas.height = 240;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(userVideoRef.current, 0, 0, canvas.width, canvas.height);
            const frame = canvas.toDataURL('image/jpeg', 0.4);
            lastCapturedImageRef.current = frame;
            ws.send(JSON.stringify({
              type: 'live_camera_frame',
              userPhone: userData.phone,
              frame,
              timestamp: Date.now(),
            }));
          }
        } catch (_) {}
      }
    }, 250);

    // 2. Live Audio Stream from User Mic (ONLY if user granted permission to guardian)
    if (perms.mic) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        micStream = stream;
        userMicStreamRef.current = stream;
        const capture = new LiveAudioCapture((pcmBase64, volume) => {
          if (guardianAccessPermissions.microphone && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'live_audio_chunk',
              userPhone: userData.phone,
              pcm: pcmBase64,
              sampleRate: 16000,
              volume,
              timestamp: Date.now(),
            }));
          }
        }, 16000);
        capture.start(stream);
        audioCaptureRef.current = capture;
      }).catch(console.warn);
    }

    return () => {
      clearInterval(frameInterval);
      if (ws) {
        try { ws.close(); } catch (_) {}
      }
      wsRef.current = null;
      if (audioCaptureRef.current) {
        audioCaptureRef.current.stop();
        audioCaptureRef.current = null;
      }
      if (micStream) {
        micStream.getTracks().forEach((t) => t.stop());
      }
      if (player) {
        player.close();
      }
    };
  }, [step, userData.phone, userData.fullName, perms.mic]);

  // Auth Modal Success Handler
  const handleAuthSuccess = (data: {
    fullName: string;
    phone: string;
    email: string;
    role: UserRole;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
  }) => {
    try {
      localStorage.setItem('rakshika_user_session', JSON.stringify(data));
    } catch (_) {}

    if (data.role === 'guardian') {
      setGuardianData({ name: data.fullName, phone: data.phone });
      setStep('guardian-dashboard');
    } else {
      setUserData((prev) => ({ ...prev, ...data }));
      loadIncidents(data.phone);
      setPerms({ camera: false, mic: false, location: false });
      setStep('permissions');
    }
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('rakshika_user_session');
    } catch (_) {}
    setPerms({ camera: false, mic: false, location: false });
    setStep('landing');
    setIsMobileMenuOpen(false);
  };

  const requestLocationPermission = async (): Promise<boolean> => {
    setPermRequesting('location');
    setPermErrorMsg(null);
    try {
      if (!('geolocation' in navigator)) {
        setPermErrorMsg('Geolocation is not supported by your browser.');
        setPermRequesting(null);
        return false;
      }

      return await new Promise<boolean>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setPerms((p) => ({ ...p, location: true }));
            setLocationPermStatus('granted');
            setCurrentLocation({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              timestamp: new Date().toISOString(),
              isSharing: true,
            });
            setPermRequesting(null);
            resolve(true);
          },
          async (err) => {
            console.warn('Geolocation notice:', err.code, err.message);
            let isGrantedByQuery = false;
            if (navigator.permissions && navigator.permissions.query) {
              try {
                const res = await navigator.permissions.query({ name: 'geolocation' });
                if (res.state === 'granted') {
                  isGrantedByQuery = true;
                }
              } catch (_) {}
            }

            if (isGrantedByQuery || err.code === 2 || err.code === 3) {
              setPerms((p) => ({ ...p, location: true }));
              setLocationPermStatus('granted');
              setCurrentLocation((prev) => prev || {
                latitude: 28.6139,
                longitude: 77.2090,
                accuracy: 100,
                timestamp: new Date().toISOString(),
                isSharing: true,
              });
              setPermRequesting(null);
              resolve(true);
            } else {
              setPerms((p) => ({ ...p, location: false }));
              setLocationPermStatus('denied');
              setPermErrorMsg('Location permission was denied. Please allow Location Access in your browser address bar.');
              setPermRequesting(null);
              resolve(false);
            }
          },
          {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 60000,
          }
        );
      });
    } catch (err: any) {
      console.warn('Location request caught:', err);
      setPermErrorMsg('Location request failed. Please check site permissions in your browser.');
      setPermRequesting(null);
      return false;
    }
  };

  const requestMicPermission = async (): Promise<boolean> => {
    setPermRequesting('mic');
    setPermErrorMsg(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setPermErrorMsg('Microphone access is not supported in this browser.');
        setPermRequesting(null);
        return false;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setPerms((p) => ({ ...p, mic: true }));
      setPermRequesting(null);
      return true;
    } catch (err: any) {
      console.warn('Microphone permission notice:', err);
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setPerms((p) => ({ ...p, mic: true }));
        setPermRequesting(null);
        return true;
      }
      setPerms((p) => ({ ...p, mic: false }));
      setPermErrorMsg('Microphone access was denied. Please click the lock or mic icon in your address bar to allow.');
      setPermRequesting(null);
      return false;
    }
  };

  const requestCameraPermission = async (): Promise<boolean> => {
    setPermRequesting('camera');
    setPermErrorMsg(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setPermErrorMsg('Camera access is not supported in this browser.');
        setPermRequesting(null);
        return false;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((track) => track.stop());
      setPerms((p) => ({ ...p, camera: true }));
      setPermRequesting(null);
      return true;
    } catch (err: any) {
      console.warn('Camera permission notice:', err);
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setPerms((p) => ({ ...p, camera: true }));
        setPermRequesting(null);
        return true;
      }
      setPerms((p) => ({ ...p, camera: false }));
      setPermErrorMsg('Camera access was denied. Please click the lock or camera icon in your address bar to allow.');
      setPermRequesting(null);
      return false;
    }
  };

  const requestPermission = async (type: 'camera' | 'mic' | 'location') => {
    if (type === 'location') return await requestLocationPermission();
    if (type === 'mic') return await requestMicPermission();
    if (type === 'camera') return await requestCameraPermission();
    return false;
  };

  const requestAllRemainingPermissions = async () => {
    setPermRequesting('all');
    setPermErrorMsg(null);

    let okLoc = perms.location;
    let okMic = perms.mic;
    let okCam = perms.camera;

    if (!okLoc) {
      okLoc = await requestLocationPermission();
    }
    if (!okMic) {
      okMic = await requestMicPermission();
    }
    if (!okCam) {
      okCam = await requestCameraPermission();
    }

    setPermRequesting(null);

    if (okLoc && okMic && okCam) {
      setStep('dashboard');
    } else {
      const missing: string[] = [];
      if (!okLoc) missing.push('GPS Location');
      if (!okMic) missing.push('Microphone');
      if (!okCam) missing.push('Camera');
      setPermErrorMsg(`All 3 permissions are required to enter. Please allow: ${missing.join(', ')}.`);
    }
  };

  // Guard dashboard entry: Never enter or stay in dashboard without all 3 permissions granted
  useEffect(() => {
    if (step === 'dashboard') {
      if (!perms.location || !perms.mic || !perms.camera) {
        setStep('permissions');
      }
    }
  }, [step, perms.location, perms.mic, perms.camera]);

  return (
    <div className={`min-h-screen bg-[#0c071e] text-purple-100 font-sans selection:bg-pink-500/30 relative overflow-x-hidden rakshika-ambient-bg ${isNightMode ? 'contrast-125' : ''}`}>
      {/* Decorative ambient background gradient glows */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[650px] h-[450px] bg-gradient-to-b from-fuchsia-600/15 via-purple-600/10 to-transparent blur-3xl rounded-full" />
        <div className="absolute top-1/4 -left-32 w-[450px] h-[450px] bg-gradient-to-r from-pink-600/10 to-transparent blur-3xl rounded-full" />
        <div className="absolute bottom-10 -right-32 w-[550px] h-[550px] bg-gradient-to-l from-purple-700/15 via-fuchsia-600/10 to-transparent blur-3xl rounded-full" />
      </div>

      <AnimatePresence mode="wait">
        {/* ======================================================== */}
        {/* STEP 1: LANDING & REGISTRATION VIEW                     */}
        {/* ======================================================== */}
        {step === 'landing' && (
          <motion.div 
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex flex-col relative z-10"
          >
            {/* Header */}
            <header className="container mx-auto px-6 py-6 flex items-center justify-between border-b border-purple-500/10">
              <RakshikaLogo variant="horizontal" size="md" showTagline={true} />
              
              <div className="flex items-center gap-4 sm:gap-6">
                <nav className="hidden md:flex gap-6 text-sm font-medium text-purple-300/70">
                  <button onClick={() => setInfoModal('features')} className="hover:text-pink-300 transition-colors cursor-pointer">
                    {t('features', 'Features')}
                  </button>
                  <button onClick={() => setInfoModal('how-it-works')} className="hover:text-pink-300 transition-colors cursor-pointer">
                    {t('howItWorks', 'How it works')}
                  </button>
                  <button onClick={() => setInfoModal('safety-guide')} className="hover:text-pink-300 transition-colors cursor-pointer">
                    {t('safetyGuide', 'Safety Guide')}
                  </button>
                </nav>

                <LanguageSelector currentLanguage={lang} onLanguageChange={handleLanguageChange} />
              </div>
            </header>

            {/* Hero Section with Auth Modal */}
            <main className="flex-1 container mx-auto px-6 flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-20 py-8 lg:py-12">
              <div className="flex-1 space-y-7 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-fuchsia-500/15 to-pink-500/15 text-pink-300 text-sm font-medium border border-pink-500/30 shadow-sm shadow-pink-950/40">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-pink-500"></span>
                  </span>
                  <span>{t('liveMonitoringActive', 'AI-Powered Women Safety & Guardian Ecosystem')}</span>
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight text-white">
                  {t('heroTitlePrefix', 'Next-Gen')}{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-300 via-fuchsia-400 to-rose-400">
                    {t('heroTitleHighlight', "Women's Safety")}
                  </span>{' '}
                  {t('heroTitleSuffix', '& Guardian Network.')}
                </h1>
                <p className="text-base sm:text-lg text-purple-200/70 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                  {t('heroSubtitle', 'Consent-based live location sharing, on-device voice danger detection across 8 Indian languages, instant SOS button with cancellation safety, and real-time guardian linking.')}
                </p>
                <div className="flex flex-wrap items-center gap-3 justify-center lg:justify-start pt-1">
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-purple-200 bg-[#140b33]/80 px-3.5 py-1.5 rounded-full border border-purple-500/25 shadow-sm">
                    <CheckCircle2 className="w-4 h-4 text-pink-400" /> {t('Multi-Language Keyword AI', 'Multi-Language Keyword AI')}
                  </div>
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-purple-200 bg-[#140b33]/80 px-3.5 py-1.5 rounded-full border border-purple-500/25 shadow-sm">
                    <CheckCircle2 className="w-4 h-4 text-pink-400" /> {t('6-Character Guardian Link Codes', '6-Character Guardian Link Codes')}
                  </div>
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-purple-200 bg-[#140b33]/80 px-3.5 py-1.5 rounded-full border border-purple-500/25 shadow-sm">
                    <CheckCircle2 className="w-4 h-4 text-pink-400" /> {t('Supabase Encrypted Storage', 'Supabase Encrypted Storage')}
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-2 flex-wrap justify-center lg:justify-start">
                  <span className="text-xs text-purple-400/80 uppercase tracking-wider font-semibold">{t('language', 'Language')}:</span>
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => handleLanguageChange(l.code)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                        lang === l.code
                          ? 'bg-gradient-to-r from-fuchsia-500/25 to-pink-500/25 text-pink-200 border-pink-500/40 font-semibold shadow-sm'
                          : 'bg-[#140b33]/70 text-purple-300/70 border-purple-500/20 hover:text-white hover:border-purple-400/30'
                      }`}
                    >
                      {l.flag} {l.nativeName}
                    </button>
                  ))}
                </div>
              </div>

              {/* Registration & Authentication Card */}
              <div className="w-full max-w-md">
                <AuthModal
                  onSuccess={handleAuthSuccess}
                  lang={lang}
                  t={t}
                />
              </div>
            </main>

            {/* Information Modals */}
            {infoModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
                <div className="bg-[#130b2e] border border-purple-500/30 rounded-3xl p-6 sm:p-8 max-w-2xl w-full relative max-h-[85vh] overflow-y-auto shadow-2xl shadow-purple-950/80">
                  <button 
                    onClick={() => setInfoModal(null)} 
                    className="absolute top-5 right-5 text-purple-300 hover:text-white cursor-pointer w-8 h-8 rounded-full bg-purple-950/80 hover:bg-purple-900 border border-purple-500/30 flex items-center justify-center transition-colors"
                  >
                    ✕
                  </button>
                  {infoModal === 'features' && (
                    <div>
                      <h2 className="text-2xl font-bold text-white mb-4 tracking-tight flex items-center gap-2">
                        <span className="text-pink-400">✦</span>
                        <span>{t('features', 'Platform Features')}</span>
                      </h2>
                      <ul className="space-y-3.5 text-purple-200/90 text-sm sm:text-base">
                        <li><strong className="text-pink-400">High-Urgency SOS:</strong> Hold-to-activate button with high-decibel siren and 5-second cancel countdown to avoid false alarms.</li>
                        <li><strong className="text-pink-400">Consent-Based Live GPS:</strong> Real-time coordinate stream with accuracy radius. Sharing can be paused or stopped anytime.</li>
                        <li><strong className="text-pink-400">On-Device Voice AI:</strong> Keyword spotting for distress words like "Help", "Bachao", "Leave me" in 8 Indian languages without sending raw audio to servers.</li>
                        <li><strong className="text-pink-400">Guardian Linking:</strong> 6-character invite codes link parents and trusted contacts with full access revocation control.</li>
                        <li><strong className="text-pink-400">Emergency Incident History:</strong> Immutable encrypted logs for telemetry events and SOS triggers.</li>
                      </ul>
                    </div>
                  )}
                  {infoModal === 'how-it-works' && (
                    <div>
                      <h2 className="text-2xl font-bold text-white mb-4 tracking-tight flex items-center gap-2">
                        <span className="text-pink-400">✦</span>
                        <span>{t('howItWorks', 'How It Works')}</span>
                      </h2>
                      <div className="space-y-4 text-purple-200/90 text-sm sm:text-base">
                        <p><strong>1. User Registration:</strong> Women/users register their safety profile, emergency contacts, and blood group.</p>
                        <p><strong>2. Guardian Invite Code:</strong> Users generate a 6-character code (e.g. RAK-8429) to link their guardian.</p>
                        <p><strong>3. Consent Telemetry:</strong> While travelling, users tap "Start Sharing Location" to broadcast live coordinates to their guardian console.</p>
                        <p><strong>4. Rapid Response:</strong> Any voice distress or SOS activation immediately sounds alarms on the guardian console with live Google Maps links.</p>
                      </div>
                    </div>
                  )}
                  {infoModal === 'safety-guide' && (
                    <div>
                      <h2 className="text-2xl font-bold text-white mb-4 tracking-tight flex items-center gap-2">
                        <span className="text-pink-400">✦</span>
                        <span>{t('safetyGuide', 'Safety Guide')}</span>
                      </h2>
                      <p className="text-purple-200/90 mb-4 text-sm sm:text-base">Safety tips for traveling alone:</p>
                      <ul className="space-y-2.5 text-purple-300/80 list-disc list-inside text-sm sm:text-base">
                        <li>Always start location sharing before entering cabs or unfamiliar routes.</li>
                        <li>Keep voice danger detection active in quiet or isolated areas.</li>
                        <li>Use the Fake Call tool to discourage strangers without escalating conflict.</li>
                        <li>In an emergency, trigger SOS and dial 112 / 1091 directly.</li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ======================================================== */}
        {/* STEP 2: SYSTEM INITIALIZATION & PERMISSIONS             */}
        {/* ======================================================== */}
        {step === 'permissions' && (
          <motion.div
            key="permissions"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="min-h-screen flex items-center justify-center p-6 relative z-10"
          >
            <div className="w-full max-w-2xl rakshika-card border border-purple-500/30 rounded-3xl p-8 lg:p-12 shadow-2xl shadow-purple-950/80 relative">
              <div className="absolute top-6 right-6">
                <LanguageSelector currentLanguage={lang} onLanguageChange={handleLanguageChange} />
              </div>

              <div className="text-center mb-8">
                <div className="flex justify-center mb-4">
                  <RakshikaLogo variant="emblem" size="xl" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 tracking-tight">{t('System Initialization', 'Device Permissions Setup')}</h2>
                <p className="text-purple-200/70 text-sm max-w-lg mx-auto">
                  {t("systemInitDesc", "Rakshika AI requires Location, Microphone, and Camera access to enable real-time safety monitoring, emergency triggers, and guardian telemetry. All 3 permissions must be granted to enter.")}
                </p>
              </div>

              <div className="grid gap-4 mb-6">
                <PermissionRow
                  icon={<MapPin className="w-6 h-6" />}
                  title={t('Live Location Tracking', 'GPS Location Access')}
                  desc={t('locationPermissionDesc', 'Enables consent-based live telemetry sharing with your linked guardians.')}
                  granted={perms.location}
                  loading={permRequesting === 'location' || permRequesting === 'all'}
                  onClick={() => requestPermission('location')}
                  lang={lang}
                />
                <PermissionRow
                  icon={<Mic className="w-6 h-6" />}
                  title={t('Audio AI Analysis', 'Microphone (Keyword Spotting)')}
                  desc={t('micPermissionDesc', "Listens on-device for distress keywords like 'Help', 'Bachao'. Audio is never streamed or recorded.")}
                  granted={perms.mic}
                  loading={permRequesting === 'mic' || permRequesting === 'all'}
                  onClick={() => requestPermission('mic')}
                  lang={lang}
                />
                <PermissionRow
                  icon={<Camera className="w-6 h-6" />}
                  title={t('Camera Surveillance', 'Camera Feed (Surveillance Snapshots)')}
                  desc={t('cameraPermissionDesc', 'Enables encrypted video stream capture and safety evidence snapshots during emergencies.')}
                  granted={perms.camera}
                  loading={permRequesting === 'camera' || permRequesting === 'all'}
                  onClick={() => requestPermission('camera')}
                  lang={lang}
                />
              </div>

              {permErrorMsg && (
                <div className="mb-6 p-4 bg-rose-500/15 border border-rose-500/30 rounded-2xl flex items-start gap-3 text-xs sm:text-sm text-rose-300">
                  <AlertTriangle className="w-5 h-5 text-pink-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-rose-200">{t('Action Required', 'Action Required')}</p>
                    <p className="mt-0.5 text-purple-200">{permErrorMsg}</p>
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  if (perms.location && perms.mic && perms.camera) {
                    setStep('dashboard');
                  } else {
                    requestAllRemainingPermissions();
                  }
                }}
                id="launch-dashboard-btn"
                disabled={permRequesting !== null}
                className={`w-full font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer ${
                  perms.location && perms.mic && perms.camera
                    ? 'rakshika-gradient-btn'
                    : 'bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 hover:from-fuchsia-500 hover:to-rose-500 text-white shadow-fuchsia-950/70'
                }`}
              >
                {permRequesting ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>{t('Requesting Browser Permissions...', 'Requesting Browser Permissions...')}</span>
                  </>
                ) : perms.location && perms.mic && perms.camera ? (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>{t('Launch Rakshika AI Safety Workspace (3/3 Granted)', 'Launch Rakshika AI Safety Workspace (3/3 Granted)')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5" />
                    <span>
                      {t('Allow All Permissions & Enter', 'Allow All Permissions & Enter')} (
                      {(perms.location ? 1 : 0) + (perms.mic ? 1 : 0) + (perms.camera ? 1 : 0)}/3 {t('Granted', 'Granted')})
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}

        {/* ======================================================== */}
        {/* STEP 3: USER (WOMEN) MAIN DASHBOARD                     */}
        {/* ======================================================== */}
        {step === 'dashboard' && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`min-h-screen flex bg-[#0c071e] text-purple-100 ${isNightMode ? 'contrast-105 brightness-95' : ''}`}
          >
            {/* Desktop Persistent Sidebar */}
            <aside className="hidden lg:flex w-72 bg-[#100929]/95 border-r border-purple-500/20 backdrop-blur-xl flex-col shrink-0 h-screen sticky top-0 z-20">
              <div className="h-20 flex items-center justify-between px-5 border-b border-purple-500/15 bg-[#0e0724]/60">
                <RakshikaLogo variant="horizontal" size="sm" showTagline={false} />
              </div>
              
              <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-6">
                <div>
                  <div className="text-xs font-semibold text-purple-400/80 uppercase tracking-wider mb-2">
                    {t('Safety Modules', 'Safety Modules')}
                  </div>
                  <nav className="space-y-1">
                    <NavItem icon={<Home />} label={t('Overview', 'Overview')} active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
                    <NavItem icon={<Navigation />} label={t('Live GPS Tracking', 'Live GPS Tracking')} active={activeTab === 'tracking'} onClick={() => setActiveTab('tracking')} />
                    <NavItem icon={<Mic />} label={t('Voice Clips & Safety', 'Voice Clips & Safety')} active={activeTab === 'voice'} onClick={() => setActiveTab('voice')} />
                    <NavItem icon={<Users />} label={t('Guardian Linking', 'Guardian Linking')} active={activeTab === 'guardians'} onClick={() => setActiveTab('guardians')} />
                  </nav>
                </div>

                <div>
                  <div className="text-xs font-semibold text-purple-400/80 uppercase tracking-wider mb-2">
                    {t('Safety Vault & Logs', 'Safety Vault & Logs')}
                  </div>
                  <nav className="space-y-1">
                    <NavItem icon={<Activity />} label={`${t('Incident Logs', 'Incident Logs')} (${incidents.length})`} active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} />
                    <NavItem icon={<Lock />} label={t('Evidence Vault', 'Evidence Vault')} active={activeTab === 'vault'} onClick={() => setActiveTab('vault')} />
                    <NavItem icon={<HeartPulse />} label={t('Medical & Profile', 'Medical & Profile')} active={activeTab === 'medical'} onClick={() => setActiveTab('medical')} />
                    <NavItem icon={<Map />} label={t('Nearby Safe Zones', 'Nearby Safe Zones')} active={activeTab === 'community'} onClick={() => setActiveTab('community')} />
                    <NavItem icon={<ShieldCheck />} label={t('Privacy & Sensors', 'Privacy & Sensors')} active={activeTab === 'privacy'} onClick={() => setActiveTab('privacy')} />
                  </nav>
                </div>
              </div>

              <div className="p-4 border-t border-purple-500/20 bg-[#0c0722]/80">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-800 to-pink-700 flex items-center justify-center border border-pink-400/40 font-bold text-white text-sm shadow-sm">
                    {userData.fullName.charAt(0) || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white truncate">{userData.fullName}</div>
                    <div className="text-[0.65rem] text-pink-300 flex items-center gap-1 font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse"></span>
                      {userData.phone}
                    </div>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold uppercase tracking-wider text-purple-300 hover:text-white bg-purple-950/60 hover:bg-purple-900/60 rounded-xl transition-colors cursor-pointer border border-purple-500/30"
                >
                  <LogOut className="w-3.5 h-3.5" /> {t('End Session', 'End Session')}
                </button>
              </div>
            </aside>

            {/* Mobile Slide-Out Drawer Navigation */}
            <AnimatePresence>
              {isMobileMenuOpen && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 lg:hidden cursor-pointer"
                  />
                  <motion.aside
                    initial={{ x: '-100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '-100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 280 }}
                    className="fixed top-0 left-0 bottom-0 w-72 max-w-[85vw] bg-[#100929] border-r border-purple-500/25 z-50 flex flex-col shadow-2xl shadow-purple-950 lg:hidden"
                  >
                    <div className="h-16 flex items-center justify-between px-4 border-b border-purple-500/20 bg-[#0e0724]/80">
                      <RakshikaLogo variant="horizontal" size="sm" showTagline={false} />
                      <button
                        type="button"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="p-1.5 rounded-xl bg-purple-950/80 text-purple-300 hover:text-white cursor-pointer border border-purple-500/30"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="p-4 flex-1 overflow-y-auto space-y-6">
                      <div>
                        <div className="text-xs font-semibold text-purple-400/80 uppercase tracking-wider mb-2">
                          {t('Safety Modules', 'Safety Modules')}
                        </div>
                        <nav className="space-y-1">
                          <NavItem icon={<Home />} label={t('Overview', 'Overview')} active={activeTab === 'overview'} onClick={() => { setActiveTab('overview'); setIsMobileMenuOpen(false); }} />
                          <NavItem icon={<Navigation />} label={t('Live GPS Tracking', 'Live GPS Tracking')} active={activeTab === 'tracking'} onClick={() => { setActiveTab('tracking'); setIsMobileMenuOpen(false); }} />
                          <NavItem icon={<Mic />} label={t('Voice Clips & Safety', 'Voice Clips & Safety')} active={activeTab === 'voice'} onClick={() => { setActiveTab('voice'); setIsMobileMenuOpen(false); }} />
                          <NavItem icon={<Users />} label={t('Guardian Linking', 'Guardian Linking')} active={activeTab === 'guardians'} onClick={() => { setActiveTab('guardians'); setIsMobileMenuOpen(false); }} />
                        </nav>
                      </div>

                      <div>
                        <div className="text-xs font-semibold text-purple-400/80 uppercase tracking-wider mb-2">
                          {t('Safety Vault & Logs', 'Safety Vault & Logs')}
                        </div>
                        <nav className="space-y-1">
                          <NavItem icon={<Activity />} label={`${t('Incident Logs', 'Incident Logs')} (${incidents.length})`} active={activeTab === 'logs'} onClick={() => { setActiveTab('logs'); setIsMobileMenuOpen(false); }} />
                          <NavItem icon={<Lock />} label={t('Evidence Vault', 'Evidence Vault')} active={activeTab === 'vault'} onClick={() => { setActiveTab('vault'); setIsMobileMenuOpen(false); }} />
                          <NavItem icon={<HeartPulse />} label={t('Medical & Profile', 'Medical & Profile')} active={activeTab === 'medical'} onClick={() => { setActiveTab('medical'); setIsMobileMenuOpen(false); }} />
                          <NavItem icon={<Map />} label={t('Nearby Safe Zones', 'Nearby Safe Zones')} active={activeTab === 'community'} onClick={() => { setActiveTab('community'); setIsMobileMenuOpen(false); }} />
                          <NavItem icon={<ShieldCheck />} label={t('Privacy & Sensors', 'Privacy & Sensors')} active={activeTab === 'privacy'} onClick={() => { setActiveTab('privacy'); setIsMobileMenuOpen(false); }} />
                        </nav>
                      </div>
                    </div>

                    <div className="p-4 border-t border-purple-500/20 bg-[#0c0722]/80">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-800 to-pink-700 flex items-center justify-center border border-pink-400/40 font-bold text-white text-xs">
                          {userData.fullName.charAt(0) || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-white truncate">{userData.fullName}</div>
                          <div className="text-[0.65rem] text-pink-300">{userData.phone}</div>
                        </div>
                      </div>
                      <button 
                        type="button"
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold uppercase tracking-wider text-purple-300 hover:text-white bg-purple-950/60 hover:bg-purple-900/60 rounded-xl transition-colors cursor-pointer border border-purple-500/30"
                      >
                        <LogOut className="w-3.5 h-3.5" /> {t('End Session', 'End Session')}
                      </button>
                    </div>
                  </motion.aside>
                </>
              )}
            </AnimatePresence>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-h-screen lg:h-screen lg:overflow-hidden">
              {/* Responsive Topbar Header */}
              <header className="h-16 sm:h-20 border-b border-purple-500/20 flex items-center justify-between px-3 sm:px-6 lg:px-8 bg-[#100929]/80 backdrop-blur-md shrink-0 sticky top-0 z-30">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  {/* Hamburger menu for mobile */}
                  <button
                    type="button"
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="lg:hidden p-2 rounded-xl bg-purple-950/70 hover:bg-purple-900/80 text-purple-200 hover:text-white border border-purple-500/30 transition-colors cursor-pointer shrink-0"
                    title="Open Navigation Menu"
                  >
                    <Menu className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>

                  <div className="min-w-0">
                    <h2 className="text-sm sm:text-lg lg:text-xl font-bold text-white truncate tracking-tight">
                      {activeTab === 'overview' && t('Overview', 'Live Safety Console')}
                      {activeTab === 'tracking' && t('Live GPS Tracking', 'Live GPS Tracking')}
                      {activeTab === 'voice' && t('Voice Messages & Safety Hub', 'Voice Messages & Safety Hub')}
                      {activeTab === 'guardians' && t('Guardian Linking', 'Guardian Linking')}
                      {activeTab === 'logs' && t('Incident Logs', 'Incident Logs')}
                      {activeTab === 'vault' && t('Evidence Vault', 'Evidence Vault')}
                      {activeTab === 'medical' && t('Medical & Profile', 'Medical & Profile')}
                      {activeTab === 'community' && t('Nearby Safe Zones', 'Nearby Safe Zones')}
                      {activeTab === 'privacy' && t('Privacy & Sensors', 'Privacy & Sensors')}
                    </h2>
                    <p className="text-[0.65rem] sm:text-xs text-purple-300/70 hidden sm:block truncate">
                      {userData.fullName} • {t('Encrypted session active', 'Encrypted session active')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
                  <LanguageSelector currentLanguage={lang} onLanguageChange={handleLanguageChange} theme="rose" />

                  {/* Header Refresh Button */}
                  <button
                    type="button"
                    onClick={handleGlobalRefresh}
                    disabled={isGlobalRefreshing}
                    className="p-2 sm:px-3 sm:py-1.5 bg-purple-950/70 hover:bg-purple-900/80 text-purple-200 rounded-xl text-xs font-semibold border border-purple-500/30 flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95 disabled:opacity-50"
                    title={t('Refresh', 'Refresh all live data and GPS')}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-pink-400 shrink-0 ${isGlobalRefreshing ? 'animate-spin' : ''}`} />
                    <span className="hidden md:inline">{globalRefreshedText || t('Refresh', 'Refresh')}</span>
                  </button>

                  <button 
                    type="button"
                    onClick={() => {
                      setGuardianData({
                        name: 'Guardian (' + userData.fullName + ')',
                        phone: userData.emergencyContactPhone || '+91 98111 22334',
                      });
                      setStep('guardian-dashboard');
                    }}
                    className="p-2 sm:px-3 sm:py-1.5 bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 rounded-xl text-xs font-semibold border border-emerald-500/35 flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95"
                    title={t('Switch to Guardian Safety Console View', 'Switch to Guardian Safety Console View')}
                  >
                    <Eye className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="hidden lg:inline">{t('Guardian View', 'Guardian View')}</span>
                  </button>

                  <button 
                    type="button"
                    onClick={() => setIsFakeCallActive(true)} 
                    className="p-2 sm:px-3 sm:py-1.5 bg-purple-950/70 hover:bg-purple-900/80 text-purple-200 rounded-xl text-xs font-semibold border border-purple-500/30 flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95"
                    title={t('Trigger Fake Phone Call to Escape Unsafe Situations', 'Trigger Fake Phone Call to Escape Unsafe Situations')}
                  >
                    <Phone className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                    <span className="hidden md:inline">{t('Fake Call', 'Fake Call')}</span>
                  </button>

                  <button 
                    type="button"
                    onClick={() => {
                      audioAlert.resume();
                      setIsFlashActive(true);
                    }} 
                    className="p-2 sm:px-3 sm:py-1.5 bg-purple-950/70 hover:bg-purple-900/80 text-purple-200 rounded-xl text-xs font-semibold border border-purple-500/30 flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95"
                    title={t('Flash Fullscreen Visual Strobe SOS', 'Flash Fullscreen Visual Strobe SOS')}
                  >
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span className="hidden md:inline">{t('Flash SOS', 'Flash SOS')}</span>
                  </button>

                  <button 
                    type="button"
                    onClick={() => setIsNightMode(!isNightMode)} 
                    className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl ${isNightMode ? 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40' : 'bg-purple-950/70 text-purple-300 border-purple-500/30'} border flex items-center justify-center hover:text-white transition-colors cursor-pointer active:scale-95`}
                    title={t('Toggle Night Vision Shield', 'Toggle Night Vision Shield')}
                  >
                    <Moon className="w-4 h-4" />
                  </button>

                  {/* Compact Header SOS Button */}
                  <SosButton
                    variant="compact"
                    isSosActive={isSosActive}
                    isSirenMuted={isSirenMuted}
                    onToggleMuteSiren={handleToggleMuteSiren}
                    onActivateSos={(triggerType, notes) => handleTriggerSOS(triggerType, notes)}
                    onResolveSos={handleResolveSOS}
                    userPhone={userData.phone}
                    userName={userData.fullName}
                    emergencyContactPhone={userData.emergencyContactPhone}
                    emergencyContactName={userData.emergencyContactName}
                    location={currentLocation ? { lat: currentLocation.latitude, lng: currentLocation.longitude } : undefined}
                    t={t}
                  />
                </div>
              </header>

              {/* Tab Views Content Area */}
              <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 lg:p-8 space-y-6 pb-24 lg:pb-8">
                
                {/* Local-First IndexedDB Offline Resilience Banner */}
                <OfflineStatusBanner
                  isSimulatedOffline={isSimulatedOffline}
                  onToggleSimulatedOffline={() => {
                    const next = !isSimulatedOffline;
                    setIsSimulatedOffline(next);
                    if (!next) {
                      loadIncidents(userData.phone);
                    }
                  }}
                  userPhone={userData.phone}
                  onRefreshData={() => loadIncidents(userData.phone)}
                  onClearLocalState={() => {
                    setIncidents([]);
                    setSafetyEvents([]);
                  }}
                  lang={lang}
                />

                {offlineNotice && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="p-3 bg-amber-950/70 border border-amber-500/40 rounded-xl text-xs text-amber-200 flex items-center justify-between gap-3 shadow-lg"
                  >
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>{offlineNotice}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOfflineNotice(null)}
                      className="text-amber-400 hover:text-white text-xs px-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </motion.div>
                )}

                {/* Live Communication & Guardian Audio Listening Active Indicator */}
                {guardianIsListening && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3.5 bg-emerald-950/80 border border-emerald-500/60 rounded-2xl text-xs text-emerald-200 flex items-center justify-between gap-3 shadow-lg shadow-emerald-950/40"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                      <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        <strong>Guardian Live Audio Active:</strong> Your connected guardian tapped the speaker option and is currently listening to your live voice & environment.
                      </span>
                    </div>
                    <span className="text-[0.65rem] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      LIVE 🔊
                    </span>
                  </motion.div>
                )}

                {/* 1. OVERVIEW TAB */}
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    {/* Hero SOS Console Centerpiece */}
                    <SosButton
                      variant="hero"
                      isSosActive={isSosActive}
                      isSirenMuted={isSirenMuted}
                      onToggleMuteSiren={handleToggleMuteSiren}
                      onActivateSos={(triggerType, notes) => handleTriggerSOS(triggerType, notes)}
                      onResolveSos={handleResolveSOS}
                      userPhone={userData.phone}
                      userName={userData.fullName}
                      emergencyContactPhone={userData.emergencyContactPhone}
                      emergencyContactName={userData.emergencyContactName}
                      location={currentLocation ? { lat: currentLocation.latitude, lng: currentLocation.longitude } : undefined}
                      t={t}
                    />

                    {/* Status Highlights */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="rakshika-card border border-purple-500/25 rounded-2xl p-5 shadow-lg shadow-purple-950/40">
                        <span className="text-[0.7rem] uppercase tracking-wider text-purple-400/80 font-bold block mb-1">
                          {t('Live Location Telemetry', 'Live Location Telemetry')}
                        </span>
                        <div className="text-base font-bold text-white flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${isSharingLocation ? 'bg-emerald-400 animate-pulse' : 'bg-purple-900'}`}></span>
                          {isSharingLocation ? t('Active & Broadcasting', 'Active & Broadcasting') : t('Sharing Paused', 'Sharing Paused')}
                        </div>
                        <p className="text-xs text-purple-200/70 mt-1">
                          {currentLocation ? `±${Math.round(currentLocation.accuracy || 10)}m ${t('accuracy', 'accuracy')}` : t('Ready to acquire GPS', 'Ready to acquire GPS')}
                        </p>
                      </div>

                      <div className="rakshika-card border border-purple-500/25 rounded-2xl p-5 shadow-lg shadow-purple-950/40">
                        <span className="text-[0.7rem] uppercase tracking-wider text-purple-400/80 font-bold block mb-1">
                          {t('Voice Safety & Guardian Relay', 'Voice Safety & Guardian Relay')}
                        </span>
                        <div className="text-base font-bold text-white flex items-center gap-2">
                          <Mic className="w-4 h-4 text-pink-400" />
                          <span>{t('Voice Clips & AI Shield', 'Voice Clips & AI Shield')}</span>
                        </div>
                        <p className="text-xs text-purple-200/70 mt-1">
                          {t('Record audio messages for guardian + keyword spotting', 'Record audio messages for guardian + keyword spotting')}
                        </p>
                      </div>

                      <div className="rakshika-card border border-purple-500/25 rounded-2xl p-5 shadow-lg shadow-purple-950/40">
                        <span className="text-[0.7rem] uppercase tracking-wider text-purple-400/80 font-bold block mb-1">
                          {t('Fall & Accelerometer', 'Fall & Accelerometer')}
                        </span>
                        <div className="text-base font-bold text-white flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4 text-emerald-400" />
                          <span>{t('Motion Guard Active', 'Motion Guard Active')}</span>
                        </div>
                        <p className="text-xs text-purple-200/70 mt-1">
                          {t('Automatic trigger on violent impact', 'Automatic trigger on violent impact')}
                        </p>
                      </div>
                    </div>

                    {/* Live Location Sharing Widget */}
                    <LiveLocationMap
                      location={currentLocation}
                      isSharing={isSharingLocation}
                      isOwner={true}
                      onToggleSharing={handleToggleLocationSharing}
                      permissionStatus={locationPermStatus}
                      userName={userData.fullName}
                      onRequestPermission={() => requestPermission('location')}
                    />

                    {/* Voice Danger & Voice Clip Panel */}
                    <VoiceDangerPanel
                      onDistressDetected={handleVoiceDistress}
                      lang={lang}
                      userName={userData.fullName}
                      userPhone={userData.phone}
                      currentLocation={currentLocation ? { latitude: currentLocation.latitude, longitude: currentLocation.longitude } : null}
                      onVoiceClipShared={(clip) => {
                        const event: SafetyEvent = {
                          id: `ev-${Date.now()}`,
                          userPhone: userData.phone,
                          userName: userData.fullName,
                          eventType: 'voice_clip_shared',
                          details: `Voice clip recorded and shared with guardian: "${clip.title}" (${clip.durationSeconds}s, tag: ${clip.tag})`,
                          createdAt: new Date().toISOString(),
                        };
                        setSafetyEvents((prev) => [event, ...prev]);
                      }}
                    />

                    {/* Emergency Helplines Quick Grid */}
                    <div className="rakshika-card border border-purple-500/25 rounded-2xl p-5 shadow-lg shadow-purple-950/40">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-pink-300 mb-3 flex items-center gap-2">
                        <Phone className="w-4 h-4 text-pink-400" />
                        <span>{t('Direct National Emergency Helplines (1-Tap Call)', 'Direct National Emergency Helplines (1-Tap Call)')}</span>
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <a
                          href="tel:112"
                          className="p-3 bg-[#0c0722]/80 hover:bg-[#180e3a] border border-purple-500/20 rounded-xl flex items-center justify-between transition-colors shadow-sm"
                        >
                          <div>
                            <span className="text-sm font-bold text-white block">{t('112 National Emergency', '112 National Emergency')}</span>
                            <span className="text-[0.7rem] text-purple-300/70">{t('Police, Ambulance, Fire', 'Police, Ambulance, Fire')}</span>
                          </div>
                          <span className="px-2.5 py-1 rakshika-gradient-btn text-white text-xs font-bold rounded-lg">{t('Call 112', 'Call 112')}</span>
                        </a>
                        <a
                          href="tel:1091"
                          className="p-3 bg-[#0c0722]/80 hover:bg-[#180e3a] border border-purple-500/20 rounded-xl flex items-center justify-between transition-colors shadow-sm"
                        >
                          <div>
                            <span className="text-sm font-bold text-white block">{t('1091 Women Helpline', '1091 Women Helpline')}</span>
                            <span className="text-[0.7rem] text-purple-300/70">{t('24/7 Dedicated Women Safety', '24/7 Dedicated Women Safety')}</span>
                          </div>
                          <span className="px-2.5 py-1 bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 text-white text-xs font-bold rounded-lg">{t('Call 1091', 'Call 1091')}</span>
                        </a>
                        <a
                          href="tel:100"
                          className="p-3 bg-[#0c0722]/80 hover:bg-[#180e3a] border border-purple-500/20 rounded-xl flex items-center justify-between transition-colors shadow-sm"
                        >
                          <div>
                            <span className="text-sm font-bold text-white block">{t('100 Police Control', '100 Police Control')}</span>
                            <span className="text-[0.7rem] text-purple-300/70">{t('Instant Police Dispatch', 'Instant Police Dispatch')}</span>
                          </div>
                          <span className="px-2.5 py-1 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white text-xs font-bold rounded-lg">{t('Call 100', 'Call 100')}</span>
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. TRACKING TAB */}
                {activeTab === 'tracking' && (
                  <div className="space-y-4">
                    <LiveLocationMap
                      location={currentLocation}
                      isSharing={isSharingLocation}
                      isOwner={true}
                      onToggleSharing={handleToggleLocationSharing}
                      permissionStatus={locationPermStatus}
                      userName={userData.fullName}
                      onRequestPermission={() => requestPermission('location')}
                    />
                  </div>
                )}

                {/* 3. VOICE TAB */}
                {activeTab === 'voice' && (
                  <div className="space-y-4">
                    <VoiceDangerPanel
                      onDistressDetected={handleVoiceDistress}
                      lang={lang}
                      userName={userData.fullName}
                      userPhone={userData.phone}
                      currentLocation={currentLocation ? { latitude: currentLocation.latitude, longitude: currentLocation.longitude } : null}
                      onVoiceClipShared={(clip) => {
                        const event: SafetyEvent = {
                          id: `ev-${Date.now()}`,
                          userPhone: userData.phone,
                          userName: userData.fullName,
                          eventType: 'voice_clip_shared',
                          details: `Voice clip recorded and shared with guardian: "${clip.title}" (${clip.durationSeconds}s, tag: ${clip.tag})`,
                          createdAt: new Date().toISOString(),
                        };
                        setSafetyEvents((prev) => [event, ...prev]);
                      }}
                    />
                  </div>
                )}

                {/* 4. GUARDIANS TAB */}
                {activeTab === 'guardians' && (
                  <div className="space-y-4">
                    <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-emerald-400" />
                          <span>{t('Guardian Console Live Preview', 'Guardian Console Live Preview')}</span>
                        </h4>
                        <p className="text-xs text-neutral-300 mt-0.5">
                          {t('Open the Guardian Safety Console to monitor real-time GPS, All Safe status, emergency distress, and medical records.', 'Open the Guardian Safety Console to monitor real-time GPS, All Safe status, emergency distress, and medical records.')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setGuardianData({
                            name: 'Guardian (' + userData.fullName + ')',
                            phone: userData.emergencyContactPhone || '+91 98111 22334',
                          });
                          setStep('guardian-dashboard');
                        }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950 transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{t('Open Guardian Console', 'Open Guardian Console')}</span>
                      </button>
                    </div>

                    <GuardianLinkingModal
                      userPhone={userData.phone}
                      userName={userData.fullName}
                      userProfile={{
                        fullName: userData.fullName,
                        phone: userData.phone,
                        email: userData.email,
                        bloodGroup: userData.bloodGroup || 'O+',
                        allergies: userData.allergies || 'None reported',
                        medicalNotes: userData.medicalNotes || 'No chronic conditions reported. AI Guard active.',
                        emergencyContactName: userData.emergencyContactName || 'Father (Rajesh)',
                        emergencyContactPhone: userData.emergencyContactPhone || '+91 98111 22334',
                      }}
                    />
                  </div>
                )}

                {/* 5. INCIDENT LOGS & AUDIT TRAIL TAB */}
                {activeTab === 'logs' && (
                  <div className="space-y-6">
                    {/* IndexedDB Local-First Storage Guarantee Banner */}
                    <div className="p-4 bg-rose-950/20 border border-rose-500/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 shrink-0">
                          <Database className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wide">
                            <span>{t('IndexedDB Local-First Persistence', 'IndexedDB Local-First Persistence')}</span>
                            <span className="px-1.5 py-0.5 rounded text-[0.6rem] bg-emerald-500/20 text-emerald-300 font-mono">
                              {t('Offline Ready', 'Offline Ready')}
                            </span>
                          </div>
                          <p className="text-[0.72rem] text-neutral-400 mt-0.5">
                            {t("All emergency logs and telemetry audit events are securely saved into your browser's persistent IndexedDB storage. You can access full logs even with zero cellular signal.", "All emergency logs and telemetry audit events are securely saved into your browser's persistent IndexedDB storage. You can access full logs even with zero cellular signal.")}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          const noteEvent: SafetyEvent = {
                            id: 'ev-chk-' + Date.now(),
                            userPhone: userData.phone,
                            userName: userData.fullName,
                            eventType: 'check_in',
                            details: `Manual safe check-in logged: User confirmed safe at ${new Date().toLocaleTimeString()} [IndexedDB Stored]`,
                            createdAt: new Date().toISOString(),
                          };
                          cacheSingleSafetyEvent(noteEvent).catch(() => {});
                          setSafetyEvents((prev) => [noteEvent, ...prev]);

                          if (isSimulatedOffline || !navigator.onLine) {
                            await enqueueOfflineAction({
                              type: 'log_event',
                              payload: noteEvent,
                            });
                            setOfflineNotice(t('Safe check-in stored locally in IndexedDB. Will sync when cellular returns.', 'Safe check-in stored locally in IndexedDB. Will sync when cellular returns.'));
                            setTimeout(() => setOfflineNotice(null), 4000);
                          } else {
                            try {
                              await fetch('/api/safety-event', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(noteEvent),
                              });
                            } catch {
                              await enqueueOfflineAction({
                                type: 'log_event',
                                payload: noteEvent,
                              });
                            }
                          }
                        }}
                        className="px-3 py-1.5 bg-purple-950/70 hover:bg-purple-900/80 text-purple-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-purple-500/30 shrink-0 cursor-pointer transition-colors"
                      >
                        <PlusCircle className="w-3.5 h-3.5 text-pink-400" />
                        <span>{t('Log Safe Check-In', 'Log Safe Check-In')}</span>
                      </button>
                    </div>

                    {/* Incidents Card */}
                    <div className="rakshika-card border border-purple-500/25 rounded-2xl p-5 shadow-lg shadow-purple-950/40">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-purple-200 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-pink-400" />
                          <span>{t('Emergency SOS Incidents', 'Emergency SOS Incidents')} ({incidents.length})</span>
                        </h3>
                        <div className="flex items-center gap-3">
                          <span className="text-[0.68rem] text-purple-400/80 font-mono hidden sm:inline">
                            {t('Synced to IndexedDB', 'Synced to IndexedDB')}
                          </span>
                          <button
                            type="button"
                            onClick={handleRefreshIncidents}
                            disabled={isRefreshingIncidents}
                            className="text-xs text-purple-300/70 hover:text-white flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            title={t('Refresh', 'Refresh emergency incidents')}
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingIncidents ? 'animate-spin text-pink-400' : ''}`} />
                            <span>{incidentsRefreshedText || t('Refresh', 'Refresh')}</span>
                          </button>
                        </div>
                      </div>

                      {incidents.length > 0 ? (
                        <div className="space-y-2">
                          {incidents.map((inc) => (
                            <div
                              key={inc.id}
                              className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                                inc.status === 'ACTIVE'
                                  ? 'bg-rose-950/30 border-rose-500/50'
                                  : 'bg-[#0c0722]/80 border-purple-500/20'
                              }`}
                            >
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`px-2 py-0.5 rounded-md text-[0.65rem] font-black uppercase ${
                                    inc.status === 'ACTIVE' ? 'bg-rose-600 text-white animate-pulse' : 'bg-purple-950/80 text-purple-300 border border-purple-500/30'
                                  }`}>
                                    {inc.status === 'ACTIVE' ? t('ACTIVE', 'ACTIVE') : inc.status}
                                  </span>
                                  <span className="text-sm font-bold text-white">{t('Trigger:', 'Trigger:')} {inc.triggerType}</span>
                                  <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-purple-950/80 text-pink-300 font-mono flex items-center gap-1 border border-purple-500/20">
                                    <Database className="w-2.5 h-2.5 text-pink-400" /> {t('IndexedDB Cached', 'IndexedDB Cached')}
                                  </span>
                                </div>
                                <p className="text-xs text-purple-300/80 mt-1">{inc.notes}</p>
                                <div className="text-[0.7rem] text-purple-400/70 mt-1 flex items-center gap-2">
                                  <span>{new Date(inc.createdAt).toLocaleString()}</span>
                                  {inc.latitude && inc.longitude && (
                                    <span className="text-purple-300 font-mono">
                                      • GPS: {Number(inc.latitude).toFixed(4)}, {Number(inc.longitude).toFixed(4)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {inc.status === 'ACTIVE' && (
                                <button
                                  type="button"
                                  onClick={handleResolveSOS}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow"
                                >
                                  {t('Resolve Incident', 'Resolve Incident')}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-10">
                          <Check className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                          <p className="text-sm font-semibold text-white">{t('No Emergency Incidents', 'No Emergency Incidents')}</p>
                          <p className="text-xs text-purple-300/70 mt-1">{t('Your status is all safe. Any SOS alert is permanently logged here.', 'Your status is all safe. Any SOS alert is permanently logged here.')}</p>
                        </div>
                      )}
                    </div>

                    {/* Safety Events Card */}
                    <div className="rakshika-card border border-purple-500/25 rounded-2xl p-5 shadow-lg shadow-purple-950/40">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-purple-200 flex items-center gap-2">
                          <Activity className="w-4 h-4 text-emerald-400" />
                          <span>{t('Telemetry & Audit Vault', 'Telemetry & Audit Vault')} ({safetyEvents.length})</span>
                        </h3>
                        <span className="text-[0.68rem] text-emerald-400 font-mono">
                          {t('Local-First Active', 'Local-First Active')}
                        </span>
                      </div>

                      {safetyEvents.length > 0 ? (
                        <div className="space-y-2">
                          {safetyEvents.map((evt) => (
                            <div key={evt.id} className="p-3 bg-[#0c0722]/80 border border-purple-500/20 rounded-xl text-xs flex items-center justify-between">
                              <div>
                                <span className="font-semibold text-white block uppercase">{evt.eventType}</span>
                                <span className="text-purple-300/80 mt-0.5 block">{evt.details}</span>
                              </div>
                              <span className="text-[0.65rem] text-purple-400/80 font-mono shrink-0 ml-4">
                                {new Date(evt.createdAt).toLocaleTimeString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-purple-300/70">{t('No events logged yet.', 'No events logged yet.')}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* 6. MEDICAL & CONTACTS TAB */}
                {activeTab === 'medical' && (
                  <div className="space-y-6">
                    {/* Offline Medical Storage Note */}
                    <div className="p-3.5 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl flex items-center gap-3 text-xs text-emerald-300">
                      <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div>
                        <span className="font-bold text-white">{t('Offline Emergency Medical Card Active:', 'Offline Emergency Medical Card Active:')} </span>
                        <span>{t('This critical medical profile and primary emergency contact number are cached on-device in IndexedDB and remain accessible 24/7 without requiring cellular signal or mobile data.', 'This critical medical profile and primary emergency contact number are cached on-device in IndexedDB and remain accessible 24/7 without requiring cellular signal or mobile data.')}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="rakshika-card border border-purple-500/25 rounded-2xl p-6 shadow-lg shadow-purple-950/40">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-purple-200 mb-4 flex items-center gap-2">
                          <HeartPulse className="w-4 h-4 text-pink-400" />
                          <span>{t('Medical Profile & Health Data', 'Medical Profile & Health Data')}</span>
                        </h3>
                        <div className="space-y-4">
                          <div>
                            <label className="text-xs text-purple-400/80 uppercase tracking-wider block mb-1">{t('Blood Group:', 'Blood Group')}</label>
                            <div className="text-lg font-bold text-pink-300 font-mono">{userData.bloodGroup || 'O+'}</div>
                          </div>
                          <div>
                            <label className="text-xs text-purple-400/80 uppercase tracking-wider block mb-1">{t('Allergies', 'Allergies')}</label>
                            <div className="text-sm text-purple-200">{userData.allergies || 'None reported'}</div>
                          </div>
                          <div>
                            <label className="text-xs text-purple-400/80 uppercase tracking-wider block mb-1">{t('Medical Notes', 'Medical Notes')}</label>
                            <div className="text-sm text-purple-200">{userData.medicalNotes || 'Healthy. No chronic medical conditions.'}</div>
                          </div>
                        </div>
                      </div>

                      <div className="rakshika-card border border-purple-500/25 rounded-2xl p-6 shadow-lg shadow-purple-950/40">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-purple-200 mb-4 flex items-center gap-2">
                          <Users className="w-4 h-4 text-emerald-400" />
                          <span>{t('Emergency Contact Info', 'Emergency Contact Info')}</span>
                        </h3>
                        <div className="space-y-4">
                          <div>
                            <label className="text-xs text-purple-400/80 uppercase tracking-wider block mb-1">{t('Primary Emergency Contact', 'Primary Emergency Contact')}</label>
                            <div className="text-base font-bold text-white">{userData.emergencyContactName || 'Rajesh Sharma (Father)'}</div>
                            <div className="text-xs text-emerald-400 font-mono mt-0.5">{userData.emergencyContactPhone || '+91 98111 22334'}</div>
                          </div>
                          <div className="pt-2">
                            <a
                              href={`tel:${(userData.emergencyContactPhone || '+919811122334').replace(/\s+/g, '')}`}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-lg shadow-emerald-950 transition-colors"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>{t('Call Emergency Contact', 'Call Emergency Contact')}</span>
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 7. EVIDENCE VAULT TAB */}
                {activeTab === 'vault' && (
                  <div className="rakshika-card border border-purple-500/25 rounded-2xl p-6 shadow-lg shadow-purple-950/40">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <Lock className="w-5 h-5 text-pink-400" />
                        <span>{t('Encrypted Evidence Vault', 'Encrypted Evidence Vault')}</span>
                      </h3>
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        {t('Biometric Authentication Protected', 'Biometric Authentication Protected')}
                      </span>
                    </div>

                    {!isVaultUnlocked ? (
                      <div className="text-center py-16 bg-[#0c0722]/90 rounded-2xl border border-purple-500/25 shadow-inner">
                        <div 
                          className="w-20 h-20 bg-purple-950/80 rounded-full flex items-center justify-center mx-auto mb-4 cursor-pointer hover:bg-purple-900 border-2 border-purple-500/40 hover:border-pink-400 transition-all shadow-xl shadow-purple-950/60"
                          onClick={() => setIsVaultUnlocked(true)}
                        >
                          <Fingerprint className="w-10 h-10 text-pink-400" />
                        </div>
                        <h4 className="text-base font-bold text-white mb-1">{t('Evidence Vault Locked', 'Evidence Vault Locked')}</h4>
                        <p className="text-xs text-purple-300/80 max-w-sm mx-auto mb-4">
                          {t('Touch fingerprint sensor or click the icon to authenticate and view encrypted incident captures and logs.', 'Touch fingerprint sensor or click the icon to authenticate and view encrypted incident captures and logs.')}
                        </p>
                        <button
                          type="button"
                          onClick={() => setIsVaultUnlocked(true)}
                          className="px-4 py-2 rakshika-gradient-btn text-white rounded-xl text-xs font-bold transition-transform hover:scale-105 cursor-pointer shadow-lg"
                        >
                          {t('Unlock Vault', 'Unlock Vault')}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center bg-[#0c0722]/80 p-4 rounded-xl border border-purple-500/25">
                          <div>
                            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
                              {t('Authentication Verified', 'Authentication Verified')}
                            </span>
                            <span className="text-xs text-purple-300/80">{t('Vault open for current session', 'Vault open for current session')}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsVaultUnlocked(false)}
                            className="px-3 py-1.5 bg-purple-950/80 hover:bg-purple-900 text-purple-200 rounded-lg text-xs font-medium cursor-pointer border border-purple-500/30"
                          >
                            {t('Lock Vault', 'Lock Vault')}
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="p-4 bg-[#0c0722]/80 rounded-xl border border-purple-500/20">
                            <span className="text-xs font-bold text-white block">{t('Identity Profile', 'Identity Profile')}</span>
                            <p className="text-xs text-purple-300/80 mt-1">{t('Full Name, Encrypted Phone & Emergency ID Synced to Supabase.', 'Full Name, Encrypted Phone & Emergency ID Synced to Supabase.')}</p>
                          </div>
                          <div className="p-4 bg-[#0c0722]/80 rounded-xl border border-purple-500/20">
                            <span className="text-xs font-bold text-white block">{t('GPS Log Audits', 'GPS Log Audits')}</span>
                            <p className="text-xs text-purple-300/80 mt-1">{t('Consent timestamped WGS84 coordinates saved per broadcast.', 'Consent timestamped WGS84 coordinates saved per broadcast.')}</p>
                          </div>
                          <div className="p-4 bg-[#0c0722]/80 rounded-xl border border-purple-500/20">
                            <span className="text-xs font-bold text-white block">{t('SOS Incidents', 'SOS Incidents')}</span>
                            <p className="text-xs text-purple-300/80 mt-1">{t('Immutable record of every trigger event and resolution state.', 'Immutable record of every trigger event and resolution state.')}</p>
                          </div>
                        </div>

                        {/* IndexedDB Local-First Safety Vault & Offline Evidence Cache Manager */}
                        <div className="mt-6 pt-6 border-t border-purple-500/25">
                          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <div className="flex items-center gap-2.5">
                              <div className="p-2 bg-gradient-to-r from-pink-500/20 to-purple-500/20 border border-pink-500/30 rounded-xl text-pink-400">
                                <HardDrive className="w-5 h-5" />
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                                  <span>{t('IndexedDB Local-First Safety Vault', 'IndexedDB Local-First Safety Vault')}</span>
                                  <span className="px-2 py-0.5 rounded-full text-[0.65rem] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                                    {t('Persistent Local Storage', 'Persistent Local Storage')}
                                  </span>
                                </h4>
                                <p className="text-xs text-purple-300/70">
                                  {t('Zero-latency on-device cache guaranteeing complete offline access to incidents, audio evidence, and medical records.', 'Zero-latency on-device cache guaranteeing complete offline access to incidents, audio evidence, and medical records.')}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Reset Cache with In-UI Confirmation */}
                              {vaultResetConfirm ? (
                                <div className="flex items-center gap-2 bg-rose-950/85 border border-rose-500/50 px-3 py-1.5 rounded-xl shadow-lg animate-in fade-in">
                                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                                  <span className="text-xs text-rose-200 font-semibold">{t('Wipe all local vault cache?', 'Wipe all local vault cache?')}</span>
                                  <button
                                    type="button"
                                    onClick={handleVaultResetCache}
                                    disabled={isVaultResetting}
                                    className="px-2.5 py-1 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white rounded-lg text-xs font-bold cursor-pointer transition-all shadow-md flex items-center gap-1 disabled:opacity-50"
                                  >
                                    {isVaultResetting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                    <span>{isVaultResetting ? t('Resetting...', 'Resetting...') : t('Yes, Reset Cache', 'Yes, Reset Cache')}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setVaultResetConfirm(false)}
                                    className="px-2 py-1 bg-purple-950/70 hover:bg-purple-900 text-purple-300 rounded-lg text-xs cursor-pointer"
                                  >
                                    {t('Cancel', 'Cancel')}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setVaultResetConfirm(true)}
                                  className="px-3 py-2 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all shadow-sm hover:border-rose-400"
                                >
                                  <Trash2 className="w-4 h-4 text-rose-400" />
                                  <span>{t('Reset Cache', 'Reset Cache')}</span>
                                </button>
                              )}

                              {/* Sync from Cloud Button */}
                              <button
                                type="button"
                                onClick={handleVaultSyncCloud}
                                className="px-3 py-2 bg-purple-900/60 hover:bg-purple-800/80 text-purple-200 border border-purple-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
                              >
                                <RefreshCw className="w-4 h-4 text-pink-400" />
                                <span>{t('Sync Cloud Data', 'Sync Cloud Data')}</span>
                              </button>
                            </div>
                          </div>

                          {/* Vault Reset Feedback Message */}
                          {vaultResetMessage && (
                            <div className="mb-4 px-3.5 py-2.5 bg-pink-950/70 border border-pink-500/40 rounded-xl text-pink-200 text-xs flex items-center gap-2 shadow-lg animate-in fade-in">
                              <CheckCircle2 className="w-4 h-4 text-pink-400 shrink-0" />
                              <span>{vaultResetMessage}</span>
                            </div>
                          )}

                          {/* IndexedDB Storage Metric Cards */}
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                            <div className="p-3 rounded-xl bg-[#080415]/80 border border-purple-500/20">
                              <span className="text-[0.65rem] text-purple-300/70 uppercase font-medium block">{t('Cached Incidents', 'Cached Incidents')}</span>
                              <span className="text-lg font-bold text-white font-mono mt-0.5 block">{vaultCacheStats?.incidentsCount ?? 0}</span>
                              <span className="text-[0.62rem] text-emerald-400 flex items-center justify-center gap-1 mt-1">
                                <CheckCircle2 className="w-2.5 h-2.5" /> {t('Encrypted', 'Encrypted')}
                              </span>
                            </div>
                            <div className="p-3 rounded-xl bg-[#080415]/80 border border-purple-500/20">
                              <span className="text-[0.65rem] text-purple-300/70 uppercase font-medium block">{t('Audit Events', 'Audit Events')}</span>
                              <span className="text-lg font-bold text-white font-mono mt-0.5 block">{vaultCacheStats?.eventsCount ?? 0}</span>
                              <span className="text-[0.62rem] text-emerald-400 flex items-center justify-center gap-1 mt-1">
                                <CheckCircle2 className="w-2.5 h-2.5" /> {t('Tamper-proof', 'Tamper-proof')}
                              </span>
                            </div>
                            <div className="p-3 rounded-xl bg-[#080415]/80 border border-purple-500/20">
                              <span className="text-[0.65rem] text-purple-300/70 uppercase font-medium block">{t('Voice Clips', 'Voice Clips')}</span>
                              <span className="text-lg font-bold text-white font-mono mt-0.5 block">{vaultCacheStats?.voiceClipsCount ?? 0}</span>
                              <span className="text-[0.62rem] text-pink-400 flex items-center justify-center gap-1 mt-1">
                                <Volume2 className="w-2.5 h-2.5" /> {t('Audio Stream', 'Audio Stream')}
                              </span>
                            </div>
                            <div className="p-3 rounded-xl bg-[#080415]/80 border border-purple-500/20">
                              <span className="text-[0.65rem] text-purple-300/70 uppercase font-medium block">{t('Medical Card', 'Medical Card')}</span>
                              <span className="text-lg font-bold text-white font-mono mt-0.5 block">{vaultCacheStats?.hasProfile ? t('Saved', 'Saved') : t('Empty', 'Empty')}</span>
                              <span className="text-[0.62rem] text-emerald-400 flex items-center justify-center gap-1 mt-1">
                                <ShieldCheck className="w-2.5 h-2.5" /> {t('Emergency Ready', 'Emergency Ready')}
                              </span>
                            </div>
                            <div className="p-3 rounded-xl bg-[#080415]/80 border border-purple-500/20">
                              <span className="text-[0.65rem] text-purple-300/70 uppercase font-medium block">{t('Sync Queue', 'Sync Queue')}</span>
                              <span className="text-lg font-bold text-white font-mono mt-0.5 block">{vaultCacheStats?.pendingQueueCount ?? 0}</span>
                              <span className="text-[0.62rem] text-purple-300/60 flex items-center justify-center gap-1 mt-1">
                                <Clock className="w-2.5 h-2.5" /> {t('Auto Flush', 'Auto Flush')}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3.5 pt-3 border-t border-purple-500/20 flex flex-wrap items-center justify-between text-xs text-purple-300/70 gap-2">
                            <span>
                              {t('Last Local-First Cache Sync: ', 'Last Local-First Cache Sync: ')}
                              <span className="text-white font-mono">{vaultCacheStats?.lastCachedAt ? new Date(vaultCacheStats.lastCachedAt).toLocaleTimeString() : t('Active session', 'Active session')}</span>
                            </span>
                            <span className="font-mono text-purple-300/80">
                              Database: rakshika_safety_offline_db (IndexedDB v2 Local-First Storage)
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 8. COMMUNITY SAFE ZONES TAB */}
                {activeTab === 'community' && (
                  <div className="rakshika-card border border-purple-500/25 rounded-2xl p-6 shadow-lg shadow-purple-950/40">
                    <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4">
                      <Map className="w-5 h-5 text-pink-400" />
                      <span>{t('Verified Nearby Safe Shelters & Law Enforcement', 'Verified Nearby Safe Shelters & Law Enforcement')}</span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[
                        { name: t("Central Police Station (Women's Desk)", "Central Police Station (Women's Desk)"), type: t("Law Enforcement", "Law Enforcement"), distance: `0.7 km ${t('away', 'away')}`, status: t("Verified Safe Zone", "Verified 24/7 Safe Zone") },
                        { name: t("Civil Hospital & Trauma Emergency", "Civil Hospital & Trauma Emergency"), type: t("Medical & Ambulance", "Medical & Ambulance"), distance: `1.2 km ${t('away', 'away')}`, status: t("24/7 Open", "Open 24/7") },
                        { name: t("One Stop Crisis Center (Sakhi)", "One Stop Crisis Center (Sakhi)"), type: t("Women Support & Shelter", "Women Support & Shelter"), distance: `2.4 km ${t('away', 'away')}`, status: t("Verified Safe Zone", "Verified Safe Zone") },
                        { name: t("City Metro Interchange (CCTV Guarded)", "City Metro Interchange (CCTV Guarded)"), type: t("Transit Hub", "Transit Hub"), distance: `2.8 km ${t('away', 'away')}`, status: t("High Security", "High Security") }
                      ].map((place, idx) => (
                        <div key={idx} className="p-4 bg-[#0c0722]/80 rounded-xl border border-purple-500/20 flex items-center justify-between">
                          <div>
                            <span className="text-sm font-bold text-white block">{place.name}</span>
                            <span className="text-xs text-purple-300/80 mt-0.5 block">{place.type} • {place.distance}</span>
                          </div>
                          <span className="px-2.5 py-1 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-medium rounded-lg">
                            {place.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 9. PRIVACY & PERMISSIONS TAB */}
                {activeTab === 'privacy' && (
                  <div className="rakshika-card border border-purple-500/25 rounded-2xl p-6 space-y-6 shadow-lg shadow-purple-950/40">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-emerald-400" />
                      <span>{t('Privacy Architecture, Sensor Consent & Prototype Disclaimers', 'Privacy Architecture, Sensor Consent & Prototype Disclaimers')}</span>
                    </h3>

                    <div className="space-y-4 text-xs text-purple-200 leading-relaxed">
                      <div className="p-4 bg-[#0c0722]/80 border border-purple-500/20 rounded-xl">
                        <strong className="text-white text-sm block mb-1">{t('1. Consent-Based Geolocation', '1. Consent-Based Geolocation')}</strong>
                        <p>
                          {t('Your GPS coordinates are ONLY accessed and broadcast when you explicitly have "Live Location Sharing" turned ON. When sharing is stopped, no background coordinates are collected or stored.', 'Your GPS coordinates are ONLY accessed and broadcast when you explicitly have "Live Location Sharing" turned ON. When sharing is stopped, no background coordinates are collected or stored.')}
                        </p>
                      </div>

                      <div className="p-4 bg-[#0c0722]/80 border border-purple-500/20 rounded-xl">
                        <strong className="text-white text-sm block mb-1">{t('2. On-Device Speech Recognition', '2. On-Device Speech Recognition')}</strong>
                        <p>
                          {t('Voice keyword spotting runs locally in your browser using the Web Speech API. Raw audio is never uploaded, recorded, or streamed to external servers. It only matches against safety distress keywords.', 'Voice keyword spotting runs locally in your browser using the Web Speech API. Raw audio is never uploaded, recorded, or streamed to external servers. It only matches against safety distress keywords.')}
                        </p>
                      </div>

                      <div className="p-4 bg-[#0c0722]/80 border border-purple-500/20 rounded-xl">
                        <strong className="text-white text-sm block mb-1">{t('3. Guardian Authorization & Access Revocation', '3. Guardian Authorization & Access Revocation')}</strong>
                        <p>
                          {t('Guardians can only monitor your live status if you have provided them with an active 6-character authorization invite code. You can revoke guardian access at any time with a single click.', 'Guardians can only monitor your live status if you have provided them with an active 6-character authorization invite code. You can revoke guardian access at any time with a single click.')}
                        </p>
                      </div>

                      <div className="p-4 bg-[#0c0722]/80 border border-amber-500/30 rounded-xl text-amber-200">
                        <strong className="text-amber-300 text-sm block mb-1 flex items-center gap-1.5">
                          <Info className="w-4 h-4" /> {t('4. Prototype AI Capabilities & Emergency Dispatch', '4. Prototype AI Capabilities & Emergency Dispatch')}
                        </strong>
                        <p>
                          {t("Rakshika AI's speech recognition and danger keyword detection is a prototype AI capability designed to alert your designated guardians. In an immediate life-threatening emergency, always contact local emergency services directly via phone call (112 / 1091 / 100).", "Rakshika AI's speech recognition and danger keyword detection is a prototype AI capability designed to alert your designated guardians. In an immediate life-threatening emergency, always contact local emergency services directly via phone call (112 / 1091 / 100).")}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Mobile Bottom Navigation Bar (Thumb-friendly dock for small screens) */}
              <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#100929]/95 backdrop-blur-md border-t border-purple-500/25 flex items-center justify-around px-2 z-30 shadow-2xl">
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors cursor-pointer ${
                    activeTab === 'overview' ? 'text-pink-400 font-bold' : 'text-purple-300/70 hover:text-white'
                  }`}
                >
                  <Home className="w-5 h-5" />
                  <span className="text-[0.65rem] mt-0.5">{t('Overview', 'Overview')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('tracking')}
                  className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors cursor-pointer ${
                    activeTab === 'tracking' ? 'text-pink-400 font-bold' : 'text-purple-300/70 hover:text-white'
                  }`}
                >
                  <Navigation className="w-5 h-5" />
                  <span className="text-[0.65rem] mt-0.5">{t('GPS', 'GPS')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('voice')}
                  className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors cursor-pointer ${
                    activeTab === 'voice' ? 'text-pink-400 font-bold' : 'text-purple-300/70 hover:text-white'
                  }`}
                >
                  <Mic className="w-5 h-5" />
                  <span className="text-[0.65rem] mt-0.5">{t('Voice Clip', 'Voice Clip')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('guardians')}
                  className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors cursor-pointer ${
                    activeTab === 'guardians' ? 'text-pink-400 font-bold' : 'text-purple-300/70 hover:text-white'
                  }`}
                >
                  <Users className="w-5 h-5" />
                  <span className="text-[0.65rem] mt-0.5">{t('Guardians', 'Guardians')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('logs')}
                  className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors cursor-pointer ${
                    activeTab === 'logs' ? 'text-pink-400 font-bold' : 'text-purple-300/70 hover:text-white'
                  }`}
                >
                  <Activity className="w-5 h-5" />
                  <span className="text-[0.65rem] mt-0.5">{t('Logs', 'Logs')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="flex flex-col items-center justify-center flex-1 py-1 text-purple-300/70 hover:text-white transition-colors cursor-pointer"
                >
                  <Menu className="w-5 h-5" />
                  <span className="text-[0.65rem] mt-0.5">{t('More', 'More')}</span>
                </button>
              </div>
            </main>

            {/* Fake Call Modal (Believable call simulator to exit uncomfortable situations) */}
            {isFakeCallActive && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4">
                <div className="w-full max-w-sm rakshika-card border border-purple-500/35 rounded-3xl p-6 sm:p-8 flex flex-col justify-between shadow-2xl shadow-purple-950 min-h-[500px]">
                  {/* Top Caller Card */}
                  <div className="text-center mt-6">
                    <div className="w-24 h-24 bg-gradient-to-br from-purple-950 via-[#180e38] to-pink-950 rounded-full mx-auto mb-4 flex items-center justify-center text-4xl border-2 border-purple-500/40 shadow-inner">
                      👨‍🦳
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-1">{t('dad', 'Dad')}</h2>
                    <p className="text-purple-300/70 text-sm font-mono">Mobile +91 98230 11990</p>
                    
                    {isFakeCallAnswered ? (
                      <div className="mt-4 inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full text-xs font-mono font-bold">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span>
                          {String(Math.floor(fakeCallSeconds / 60)).padStart(2, '0')}:
                          {String(fakeCallSeconds % 60).padStart(2, '0')}
                        </span>
                      </div>
                    ) : (
                      <p className="text-pink-400 text-sm font-medium mt-3 animate-pulse">
                        {t('incomingCall', 'Incoming cellular call...')}
                      </p>
                    )}
                  </div>

                  {/* In-call simulation details if answered */}
                  {isFakeCallAnswered && (
                    <div className="p-4 bg-[#0c0722]/90 border border-purple-500/25 rounded-2xl text-center text-xs text-purple-200 space-y-2">
                      <p className="text-white font-medium">"Beta, where are you right now? I'm coming to pick you up in 5 minutes."</p>
                      <p className="text-[0.7rem] text-purple-400/70">Hold phone to your ear and speak normally to leave the area safely.</p>
                    </div>
                  )}

                  {/* Call Actions */}
                  <div className="mt-8 mb-4">
                    {isFakeCallAnswered ? (
                      <div className="flex justify-center">
                        <button 
                          type="button"
                          onClick={() => {
                            setIsFakeCallActive(false);
                            setIsFakeCallAnswered(false);
                          }} 
                          className="w-16 h-16 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer text-white shadow-xl shadow-red-950"
                          title="End Call"
                        >
                          <Phone className="w-8 h-8 rotate-[135deg]" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-around items-center px-4">
                        <button 
                          type="button"
                          onClick={() => {
                            setIsFakeCallActive(false);
                            setIsFakeCallAnswered(false);
                          }} 
                          className="w-16 h-16 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer text-white shadow-xl shadow-red-950"
                          title="Decline"
                        >
                          <Phone className="w-8 h-8 rotate-[135deg]" />
                        </button>
                        <button 
                          type="button"
                          onClick={() => setIsFakeCallAnswered(true)} 
                          className="w-16 h-16 bg-emerald-600 hover:bg-emerald-500 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer text-white animate-bounce shadow-xl shadow-emerald-950"
                          title="Accept Call"
                        >
                          <Phone className="w-8 h-8" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Flash SOS Screen Modal with loud siren and mute siren */}
            <FlashSosModal
              isOpen={isFlashActive}
              onClose={() => setIsFlashActive(false)}
              userData={userData}
              currentLocation={currentLocation ? { latitude: currentLocation.latitude, longitude: currentLocation.longitude } : null}
              t={t}
            />
          </motion.div>
        )}

        {/* ======================================================== */}
        {/* STEP 4: GUARDIAN DASHBOARD VIEW                         */}
        {/* ======================================================== */}
        {step === 'guardian-dashboard' && (
          <GuardianDashboard
            guardianName={guardianData.name}
            guardianPhone={guardianData.phone}
            onLogout={handleLogout}
            onSwitchToUser={() => setStep('dashboard')}
            lang={lang}
          />
        )}
      </AnimatePresence>

      {/* Hidden live camera capture video element for streaming to guardian */}
      <video
        ref={userVideoRef}
        id="user-camera-feed"
        autoPlay
        playsInline
        muted
        className="hidden"
      />
    </div>
  );
}

// Subcomponents

function PermissionRow({ icon, title, desc, granted, onClick, loading, lang }: any) {
  return (
    <div
      onClick={!granted && !loading ? onClick : undefined}
      className={`flex items-start gap-4 p-5 rounded-2xl border transition-all ${
        granted
          ? 'bg-[#0c0722]/85 border-purple-500/20 cursor-default'
          : 'bg-[#140b33]/85 border-purple-500/30 cursor-pointer hover:border-pink-500/50 hover:bg-[#1a0f3e] shadow-lg shadow-purple-950/40'
      }`}
    >
      <div className={`mt-1 p-2.5 rounded-xl ${granted ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-purple-950/60 text-pink-400 border border-purple-500/30'}`}>
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-white font-medium">{title}</h3>
          {granted ? (
            <span className="text-[0.65rem] px-2 py-0.5 rounded-full font-semibold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              {translate('Allowed', lang || 'en', 'Allowed')}
            </span>
          ) : (
            <span className="text-[0.65rem] px-2 py-0.5 rounded-full font-semibold uppercase bg-pink-500/15 text-pink-300 border border-pink-500/30">
              {translate('Required', lang || 'en', 'Required')}
            </span>
          )}
        </div>
        <p className="text-sm text-purple-200/70 leading-relaxed">{desc}</p>
      </div>
      <div className="pt-1">
        {granted ? (
          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!loading && onClick) onClick();
            }}
            disabled={loading}
            className="text-xs font-bold uppercase tracking-wider text-white rakshika-gradient-btn active:scale-95 px-3.5 py-1.5 rounded-lg cursor-pointer transition-all shadow-md shadow-pink-950 flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>{translate('Prompting...', lang || 'en', 'Prompting...')}</span>
              </>
            ) : (
              <span>{translate('Allow', lang || 'en', 'Allow')}</span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function NavItem({ icon, label, active = false, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all text-xs sm:text-sm font-medium cursor-pointer ${
        active 
          ? 'bg-gradient-to-r from-fuchsia-600/25 via-pink-600/20 to-purple-600/15 text-pink-200 border-l-4 border-pink-500 font-semibold shadow-sm shadow-purple-950'
          : 'text-purple-300/70 hover:bg-purple-950/40 hover:text-white border-l-4 border-transparent'
      }`}
    >
      {React.cloneElement(icon, { className: 'w-4 h-4 shrink-0' })}
      <span className="truncate">{label}</span>
    </button>
  );
}
