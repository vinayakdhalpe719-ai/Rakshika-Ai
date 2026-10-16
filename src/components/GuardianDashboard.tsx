import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, Shield, AlertTriangle, MapPin, Activity, Clock, 
  Phone, Check, RefreshCw, Radio, ExternalLink, ShieldCheck, 
  Volume2, VolumeX, LogOut, ChevronRight, UserPlus, HeartPulse,
  Droplet, FileText, Navigation, Bell, AlertCircle, CheckCircle2,
  Copy, ArrowLeft, Zap, Eye, Database, WifiOff, Play, Pause,
  Mic, Download, Headphones, Tag, Video, VideoOff, Maximize2, Minimize2, MicOff, Sliders
} from 'lucide-react';
import { GuardianRelationship, LocationUpdate, EmergencyIncident, SafetyEvent, VoiceClip, GuardianAccessPermissions, GuardianAccessRequests } from '../types/safety';
import LiveLocationMap from './LiveLocationMap';
import GuardianLinkingModal from './GuardianLinkingModal';
import GuardianAccessControls from './GuardianAccessControls';
import LanguageSelector from './LanguageSelector';
import RakshikaLogo from './RakshikaLogo';
import { audioAlert } from '../utils/audioAlert';
import { getWebSocketUrl, LiveAudioPlayer, LiveAudioCapture } from '../utils/liveStream';
import { translate, LanguageCode } from '../translations';
import { 
  cacheIncidents, 
  getCachedIncidents, 
  cacheSafetyEvents, 
  getCachedSafetyEvents, 
  cacheUserProfile, 
  getCachedUserProfile,
  cacheLocation,
  getCachedLocation,
  cacheVoiceClips,
  getCachedVoiceClips
} from '../lib/offlineStorage';

interface GuardianDashboardProps {
  guardianName: string;
  guardianPhone: string;
  onLogout: () => void;
  onSwitchToUser?: () => void;
  lang: string;
  onLanguageChange?: (lang: LanguageCode) => void;
}

export default function GuardianDashboard({
  guardianName,
  guardianPhone,
  onLogout,
  onSwitchToUser,
  lang,
  onLanguageChange,
}: GuardianDashboardProps) {
  const t = (k: string, def?: string) => translate(k, (lang as LanguageCode) || 'en', def);
  const [linkedUsers, setLinkedUsers] = useState<any[]>([]);
  const [selectedUserPhone, setSelectedUserPhone] = useState<string | null>(null);
  const [selectedUserState, setSelectedUserState] = useState<any>(null);
  const [latestLocation, setLatestLocation] = useState<LocationUpdate | null>(null);
  const [activeIncident, setActiveIncident] = useState<EmergencyIncident | null>(null);
  const [incidentLogs, setIncidentLogs] = useState<EmergencyIncident[]>([]);
  const [safetyEvents, setSafetyEvents] = useState<SafetyEvent[]>([]);
  const [voiceClips, setVoiceClips] = useState<VoiceClip[]>([]);
  const [latestVoiceClip, setLatestVoiceClip] = useState<VoiceClip | null>(null);
  const [playingVoiceClipId, setPlayingVoiceClipId] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const guardianAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'live' | 'voice' | 'medical' | 'history' | 'link'>('live');
  const [isSirenActive, setIsSirenActive] = useState(false);
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [pingSuccess, setPingSuccess] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [isConnectionHealthy, setIsConnectionHealthy] = useState(true);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [manualRefreshedText, setManualRefreshedText] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  // -------------------------------------------------------------
  // LIVE COMMUNICATION & SURVEILLANCE STATE (Live Voice & Camera)
  // -------------------------------------------------------------
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [speakerVolume, setSpeakerVolume] = useState(0.85);
  const [liveAudioMeter, setLiveAudioMeter] = useState(0);
  const [liveCameraFrame, setLiveCameraFrame] = useState<string | null>(null);
  const [isCameraLive, setIsCameraLive] = useState(false);
  const [lastCameraUpdate, setLastCameraUpdate] = useState<Date | null>(null);
  const [isIntercomTalking, setIsIntercomTalking] = useState(false);
  const [intercomMicStream, setIntercomMicStream] = useState<MediaStream | null>(null);
  const [isLiveExpanded, setIsLiveExpanded] = useState(false);
  const [isUserDeviceOnline, setIsUserDeviceOnline] = useState(true);
  const [snapshotSavedNotice, setSnapshotSavedNotice] = useState(false);

  // Bidirectional Permissions State on Guardian Side
  const [accessPermissions, setAccessPermissions] = useState<GuardianAccessPermissions>({
    camera: true,
    microphone: true,
    location: true,
  });
  const [pendingRequests, setPendingRequests] = useState<GuardianAccessRequests>({});

  const guardianAudioPlayerRef = useRef<LiveAudioPlayer | null>(null);
  const guardianTalkCaptureRef = useRef<LiveAudioCapture | null>(null);
  const guardianWsRef = useRef<WebSocket | null>(null);

  // Load users linked to this guardian
  const loadLinkedUsers = async () => {
    try {
      const res = await fetch(`/api/guardian/linked-users?guardianPhone=${encodeURIComponent(guardianPhone)}`);
      if (res.ok) {
        const users: any[] = await res.json();
        setLinkedUsers(users);
        if (users.length > 0) {
          if (!selectedUserPhone || !users.some(u => u.userPhone === selectedUserPhone)) {
            setSelectedUserPhone(users[0].userPhone);
          }
        }
      }
    } catch {
      // Gracefully ignore transient fetch delays
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLinkedUsers();
  }, [guardianPhone]);

  // Hydrate selected user's data from IndexedDB immediately on selection
  useEffect(() => {
    if (!selectedUserPhone) return;
    const hydrateLocal = async () => {
      try {
        const [cachedIncs, cachedEvs, cachedProf, cachedLoc, cachedClips] = await Promise.all([
          getCachedIncidents(selectedUserPhone),
          getCachedSafetyEvents(selectedUserPhone),
          getCachedUserProfile(selectedUserPhone),
          getCachedLocation(selectedUserPhone),
          getCachedVoiceClips(selectedUserPhone),
        ]);
        if (cachedIncs && cachedIncs.length > 0) setIncidentLogs(cachedIncs);
        if (cachedEvs && cachedEvs.length > 0) setSafetyEvents(cachedEvs);
        if (cachedLoc) setLatestLocation(cachedLoc);
        if (cachedClips && cachedClips.length > 0) {
          setVoiceClips(cachedClips);
          setLatestVoiceClip(cachedClips[0]);
        }
        if (cachedProf) {
          setSelectedUserState((prev: any) => ({
            ...(prev || {}),
            profile: cachedProf,
            userPhone: selectedUserPhone,
            userName: cachedProf.fullName || prev?.userName || 'User',
          }));
        }
      } catch (e) {
        console.warn('IndexedDB guardian hydration warning:', e);
      }
    };
    hydrateLocal();
  }, [selectedUserPhone]);

  // Resilient fast polling of selected user's live telemetry and incidents (every 1.5 seconds)
  useEffect(() => {
    if (!selectedUserPhone) return;

    let isMounted = true;
    const abortController = new AbortController();

    const fetchUserData = async () => {
      // Avoid overlapping requests
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      try {
        // 1. Unified telemetry endpoint (single lightweight fetch)
        const res = await fetch(`/api/guardian/telemetry/${encodeURIComponent(selectedUserPhone)}`, {
          signal: abortController.signal,
          headers: { 'Accept': 'application/json' },
        });

        if (res.ok && isMounted) {
          const data = await res.json();
          setIsConnectionHealthy(true);
          setLastSyncTime(new Date());

          if (data.state) {
            setSelectedUserState(data.state);
            if (data.state.location) {
              setLatestLocation(data.state.location);
              cacheLocation(data.state.location).catch(() => {});
            }
            if (data.state.profile) {
              cacheUserProfile(data.state.profile).catch(() => {});
            }
          }

          if (data.location) {
            setLatestLocation(data.location);
            cacheLocation(data.location).catch(() => {});
          }

          if (data.profile) {
            cacheUserProfile(data.profile).catch(() => {});
          }

          if (data.activeIncident) {
            setActiveIncident(data.activeIncident);
          } else if (!data.state?.sosActive) {
            setActiveIncident(null);
            if (isSirenActive) {
              audioAlert.stopSiren();
              setIsSirenActive(false);
            }
          }

          if (data.incidentLogs) {
            setIncidentLogs(data.incidentLogs);
            cacheIncidents(data.incidentLogs).catch(() => {});
          }
          if (data.safetyEvents) {
            setSafetyEvents(data.safetyEvents);
            cacheSafetyEvents(data.safetyEvents).catch(() => {});
          }

          if (data.voiceClips) {
            setVoiceClips(data.voiceClips);
            cacheVoiceClips(selectedUserPhone, data.voiceClips).catch(() => {});
          }
          if (data.latestVoiceClip) {
            setLatestVoiceClip(data.latestVoiceClip);
          }

          if (data.permissions || data.state?.guardianPermissions) {
            const p = data.permissions || data.state?.guardianPermissions;
            setAccessPermissions({
              camera: Boolean(p.camera),
              microphone: Boolean(p.microphone),
              location: Boolean(p.location),
              updatedAt: p.updatedAt,
              updatedBy: p.updatedBy,
            });
            if (p.requests) {
              setPendingRequests(p.requests);
            }
          }
        } else if (isMounted) {
          // Resilient fallback to /api/state/:phone
          const fallbackRes = await fetch(`/api/state/${encodeURIComponent(selectedUserPhone)}`, {
            signal: abortController.signal,
          });
          if (fallbackRes.ok && isMounted) {
            const stateData = await fallbackRes.json();
            setSelectedUserState(stateData);
            setLastSyncTime(new Date());
            setIsConnectionHealthy(true);
            if (stateData.location) {
              setLatestLocation(stateData.location);
              cacheLocation(stateData.location).catch(() => {});
            }
            if (stateData.profile) {
              cacheUserProfile(stateData.profile).catch(() => {});
            }
            if (stateData.latestVoiceClip) {
              setLatestVoiceClip(stateData.latestVoiceClip);
            }
            if (stateData.activeIncident) setActiveIncident(stateData.activeIncident);
            else if (!stateData.sosActive) setActiveIncident(null);
          }
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError' && isMounted) {
          // Transient network interruption or offline cellular - fallback cleanly to IndexedDB
          setIsConnectionHealthy(false);
          try {
            const [cachedIncs, cachedEvs, cachedProf, cachedClips] = await Promise.all([
              getCachedIncidents(selectedUserPhone),
              getCachedSafetyEvents(selectedUserPhone),
              getCachedUserProfile(selectedUserPhone),
              getCachedVoiceClips(selectedUserPhone),
            ]);
            if (cachedIncs.length > 0) setIncidentLogs(cachedIncs);
            if (cachedEvs.length > 0) setSafetyEvents(cachedEvs);
            if (cachedClips && cachedClips.length > 0) {
              setVoiceClips(cachedClips);
              setLatestVoiceClip(cachedClips[0]);
            }
            if (cachedProf && !selectedUserState?.profile) {
              setSelectedUserState((prev: any) => ({ ...(prev || {}), profile: cachedProf }));
            }
          } catch {}
        }
      } finally {
        isFetchingRef.current = false;
      }
    };

    fetchUserData();
    const interval = setInterval(fetchUserData, 1500);

    return () => {
      isMounted = false;
      abortController.abort();
      clearInterval(interval);
    };
  }, [selectedUserPhone, isSirenActive]);

  // Handle siren audio toggle for guardian
  const handleToggleGuardianSiren = () => {
    audioAlert.resume();
    if (isSirenActive) {
      audioAlert.stopSiren();
      setIsSirenActive(false);
    } else {
      audioAlert.startSiren(0.35);
      setIsSirenActive(true);
    }
  };

  // Clean up siren on unmount
  useEffect(() => {
    return () => {
      audioAlert.stopSiren();
      if (guardianAudioRef.current) {
        guardianAudioRef.current.pause();
      }
    };
  }, []);

  // Playback handler for guardian listening to protected user voice clips
  const togglePlayVoiceClip = (clip: VoiceClip) => {
    if (playingVoiceClipId === clip.id) {
      if (guardianAudioRef.current) {
        guardianAudioRef.current.pause();
      }
      setPlayingVoiceClipId(null);
      setPlaybackProgress(0);
    } else {
      if (guardianAudioRef.current) {
        guardianAudioRef.current.pause();
      }
      const audio = new Audio(clip.audioBase64);
      audio.ontimeupdate = () => {
        if (audio.duration) {
          const prog = (audio.currentTime / audio.duration) * 100;
          setPlaybackProgress(isNaN(prog) ? 0 : prog);
        }
      };
      audio.onended = () => {
        setPlayingVoiceClipId(null);
        setPlaybackProgress(0);
      };
      audio.play().catch(console.warn);
      guardianAudioRef.current = audio;
      setPlayingVoiceClipId(clip.id);

      // Acknowledge clip listening on backend
      fetch(`/api/voice-clips/${encodeURIComponent(clip.id)}/listen`, { method: 'POST' }).catch(() => {});
      setVoiceClips((prev) => prev.map((c) => (c.id === clip.id ? { ...c, listenedByGuardian: true } : c)));
      if (latestVoiceClip?.id === clip.id) {
        setLatestVoiceClip((prev) => (prev ? { ...prev, listenedByGuardian: true } : null));
      }
    }
  };

  // -------------------------------------------------------------
  // REAL-TIME WEBSOCKET LISTENER FOR LIVE CAMERA & AUDIO STREAM
  // -------------------------------------------------------------
  useEffect(() => {
    if (!selectedUserPhone) return;

    let ws: WebSocket | null = null;
    const player = new LiveAudioPlayer(16000, (level) => {
      setLiveAudioMeter(level);
    });
    player.setMuted(!isSpeakerOn);
    player.setVolume(speakerVolume);
    guardianAudioPlayerRef.current = player;

    const connectWs = () => {
      try {
        const wsUrl = getWebSocketUrl();
        ws = new WebSocket(wsUrl);
        guardianWsRef.current = ws;

        ws.onopen = () => {
          ws?.send(JSON.stringify({
            type: 'register',
            role: 'guardian',
            phone: guardianPhone,
            userName: guardianName,
            targetUserPhone: selectedUserPhone,
          }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'live_camera_frame') {
              setLiveCameraFrame(data.frame);
              setIsCameraLive(true);
              setLastCameraUpdate(new Date());
            } else if (data.type === 'live_audio_chunk') {
              setLiveAudioMeter(data.volume || 0);
              player.playChunk(data.pcm, data.sampleRate || 16000);
            } else if (data.type === 'user_live_status') {
              setIsUserDeviceOnline(Boolean(data.isOnline));
            } else if (data.type === 'guardian_permission_updated' && data.permissions) {
              setAccessPermissions({
                camera: Boolean(data.permissions.camera),
                microphone: Boolean(data.permissions.microphone),
                location: Boolean(data.permissions.location),
                updatedAt: data.permissions.updatedAt,
                updatedBy: data.permissions.updatedBy,
              });
              if (data.permissions.requests) {
                setPendingRequests(data.permissions.requests);
              }
            }
          } catch (e) {}
        };

        ws.onclose = () => {
          setTimeout(() => {
            if (selectedUserPhone) connectWs();
          }, 3000);
        };
      } catch (e) {
        console.warn('Guardian WS error:', e);
      }
    };

    connectWs();

    return () => {
      if (ws) {
        try { ws.close(); } catch (_) {}
      }
      guardianWsRef.current = null;
      player.close();
    };
  }, [selectedUserPhone, guardianPhone, guardianName]);

  // Guardian updates or pauses an active permission
  const handleUpdatePermissions = async (updated: Partial<GuardianAccessPermissions>) => {
    if (!selectedUserPhone) return;
    const next = { ...accessPermissions, ...updated };
    setAccessPermissions(next);

    try {
      await fetch('/api/guardian/permissions/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPhone: selectedUserPhone,
          permissions: next,
          updatedBy: 'guardian',
        }),
      });
      if (guardianWsRef.current?.readyState === WebSocket.OPEN) {
        guardianWsRef.current.send(JSON.stringify({
          type: 'permission_update',
          userPhone: selectedUserPhone,
          permissions: next,
          updatedBy: 'guardian',
        }));
      }
    } catch (e) {
      console.error('Error updating permissions from guardian:', e);
    }
  };

  // Guardian requests permission access on demand
  const handleRequestPermission = async (target: 'camera' | 'microphone' | 'location') => {
    if (!selectedUserPhone) return;
    setPendingRequests((prev) => ({ ...prev, [target]: true }));

    try {
      await fetch('/api/guardian/permissions/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPhone: selectedUserPhone,
          guardianPhone,
          guardianName,
          requestedPermissions: { [target]: true },
        }),
      });
      if (guardianWsRef.current?.readyState === WebSocket.OPEN) {
        guardianWsRef.current.send(JSON.stringify({
          type: 'permission_request',
          userPhone: selectedUserPhone,
          guardianPhone,
          guardianName,
          requestedPermissions: { [target]: true },
        }));
      }
    } catch (e) {
      console.error('Error requesting permission from guardian:', e);
    }
  };

  // Toggle listening to the user's live voice through the speaker
  const handleToggleSpeaker = async () => {
    const next = !isSpeakerOn;
    setIsSpeakerOn(next);

    if (next) {
      await guardianAudioPlayerRef.current?.resume();
      guardianAudioPlayerRef.current?.setMuted(false);
      guardianAudioPlayerRef.current?.setVolume(speakerVolume);

      if (guardianWsRef.current?.readyState === WebSocket.OPEN && selectedUserPhone) {
        guardianWsRef.current.send(JSON.stringify({
          type: 'speaker_status',
          userPhone: selectedUserPhone,
          guardianPhone,
          isListening: true,
        }));
      }
    } else {
      guardianAudioPlayerRef.current?.setMuted(true);

      if (guardianWsRef.current?.readyState === WebSocket.OPEN && selectedUserPhone) {
        guardianWsRef.current.send(JSON.stringify({
          type: 'speaker_status',
          userPhone: selectedUserPhone,
          guardianPhone,
          isListening: false,
        }));
      }
    }
  };

  const handleSpeakerVolumeChange = (vol: number) => {
    setSpeakerVolume(vol);
    guardianAudioPlayerRef.current?.setVolume(vol);
  };

  // Two-way Intercom: Guardian talks live to User
  const handleStartIntercom = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setIntercomMicStream(stream);
      setIsIntercomTalking(true);

      const capture = new LiveAudioCapture((pcmBase64) => {
        if (guardianWsRef.current?.readyState === WebSocket.OPEN && selectedUserPhone) {
          guardianWsRef.current.send(JSON.stringify({
            type: 'guardian_talk_chunk',
            userPhone: selectedUserPhone,
            guardianPhone,
            guardianName,
            pcm: pcmBase64,
            sampleRate: 16000,
          }));
        }
      }, 16000);

      capture.start(stream);
      guardianTalkCaptureRef.current = capture;
    } catch (e) {
      console.warn('Intercom mic permission error:', e);
      alert('Microphone permission is required for the Intercom to speak back to the user.');
    }
  };

  const handleStopIntercom = () => {
    setIsIntercomTalking(false);
    if (guardianTalkCaptureRef.current) {
      guardianTalkCaptureRef.current.stop();
      guardianTalkCaptureRef.current = null;
    }
    if (intercomMicStream) {
      intercomMicStream.getTracks().forEach((t) => t.stop());
      setIntercomMicStream(null);
    }
  };

  const handleSaveCameraSnapshot = () => {
    const frame = liveCameraFrame || selectedUserState?.lastImage;
    if (!frame) return;
    const link = document.createElement('a');
    link.href = frame;
    link.download = `rakshika-camera-snapshot-${selectedUserPhone}-${Date.now()}.jpg`;
    link.click();
    setSnapshotSavedNotice(true);
    setTimeout(() => setSnapshotSavedNotice(false), 3000);
  };

  // Resolve emergency incident
  const handleResolveIncident = async (incidentId?: string) => {
    if (!selectedUserPhone) return;
    try {
      audioAlert.stopSiren();
      setIsSirenActive(false);

      const targetId = incidentId || activeIncident?.id || 'manual-clear';
      const res = await fetch(`/api/incidents/resolve/${encodeURIComponent(targetId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPhone: selectedUserPhone,
          incidentId: targetId,
          notes: `Emergency marked as RESOLVED by guardian ${guardianName}. User confirmed safe.`,
        }),
      });

      if (res.ok) {
        setActiveIncident(null);
        setSelectedUserState((prev: any) => ({
          ...prev,
          sosActive: false,
          activeIncident: null,
          audioStatus: 'All safe. Voice Shield Guard Active.',
        }));
        loadLinkedUsers();
      }
    } catch (e) {
      console.error("Error resolving incident:", e);
    }
  };

  // Guardian triggers an active safety ping / check-in
  const handleRequestSafetyPing = async () => {
    if (!selectedUserPhone || isPinging) return;
    setIsPinging(true);
    try {
      await fetch('/api/safety-events/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPhone: selectedUserPhone,
          userName: selectedUserRel?.userName || 'User',
          eventType: 'guardian_check_in',
          details: `Guardian ${guardianName} initiated a safety ping. Telemetry online.`,
        }),
      });
      setPingSuccess(true);
      setTimeout(() => setPingSuccess(false), 3000);
    } catch (e) {
      console.error("Error sending safety ping:", e);
    } finally {
      setIsPinging(false);
    }
  };

  // Copy GPS coordinates
  const handleCopyCoordinates = () => {
    if (!latestLocation) return;
    const text = `${latestLocation.latitude.toFixed(6)}, ${latestLocation.longitude.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  // Manual refresh of telemetry and monitored users
  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    setManualRefreshedText(null);
    try {
      if (selectedUserPhone) {
        const res = await fetch(`/api/guardian/telemetry/${encodeURIComponent(selectedUserPhone)}`, {
          headers: { 'Accept': 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          setIsConnectionHealthy(true);
          setLastSyncTime(new Date());
          if (data.state) setSelectedUserState(data.state);
          if (data.location) setLatestLocation(data.location);
          if (data.activeIncident) setActiveIncident(data.activeIncident);
          else if (!data.state?.sosActive) setActiveIncident(null);
          if (data.voiceClips) setVoiceClips(data.voiceClips);
          if (data.latestVoiceClip) setLatestVoiceClip(data.latestVoiceClip);
        }
      }
      await loadLinkedUsers();
      setManualRefreshedText(t('Refreshed!', 'Refreshed!'));
      setTimeout(() => setManualRefreshedText(null), 2500);
    } catch (err) {
      console.warn("Manual refresh failed:", err);
    } finally {
      setIsManualRefreshing(false);
    }
  };

  const selectedUserRel = linkedUsers.find(u => u.userPhone === selectedUserPhone);
  
  // Combine all data sources to ensure NO important information is missed
  const isSosActive = !!(activeIncident || selectedUserState?.sosActive || selectedUserRel?.sosActive);
  const isSharingLocation = selectedUserState?.isSharingLocation !== undefined 
    ? !!selectedUserState.isSharingLocation 
    : (latestLocation?.isSharing !== undefined ? !!latestLocation.isSharing : (selectedUserRel?.isSharingLocation ?? true));

  const profile = selectedUserState?.profile || selectedUserRel?.profile || {
    fullName: selectedUserRel?.userName || 'Protected User',
    phone: selectedUserPhone || '+91 98765 43210',
    email: 'user.safe@rakshika.ai',
    bloodGroup: 'O+',
    allergies: 'None reported',
    medicalNotes: 'No critical chronic conditions reported. Voice Guard active.',
    emergencyContactName: 'Father (Rajesh)',
    emergencyContactPhone: '+91 98111 22334',
  };

  return (
    <div className="min-h-screen bg-[#0c071e] text-purple-100 flex flex-col font-sans selection:bg-pink-500/30 rakshika-ambient-bg">
      {/* Top Guardian Header */}
      <header className="border-b border-purple-500/20 bg-[#100929]/90 backdrop-blur-md px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center shrink-0 shadow-sm">
            <RakshikaLogo variant="emblem" size="sm" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-white text-base sm:text-lg tracking-tight">Guardian Safety Console</h1>
              <span className="px-2 py-0.5 rounded-full text-[0.65rem] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold uppercase tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Authorized
              </span>
            </div>
            <p className="text-[0.7rem] sm:text-xs text-purple-300/70">
              Guardian: <strong className="text-white">{guardianName}</strong> <span className="font-mono text-purple-400">({guardianPhone})</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Heartbeat pulse */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-[#0c0722]/90 border border-purple-500/20 rounded-lg text-[0.7rem] text-purple-300/80 font-mono">
            <span className={`w-2 h-2 rounded-full ${isConnectionHealthy ? 'bg-emerald-500 animate-ping' : 'bg-amber-400 animate-pulse'}`}></span>
            <span>{isConnectionHealthy ? `${t('Live sync:', 'Live sync:')} ${lastSyncTime.toLocaleTimeString()}` : t('Offline: Serving IndexedDB Cache', 'Offline: Serving IndexedDB Cache')}</span>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isManualRefreshing}
            className="px-2.5 py-1.5 rounded-xl bg-purple-950/70 hover:bg-purple-900/80 text-purple-200 text-xs font-semibold flex items-center gap-1.5 border border-purple-500/30 transition-all cursor-pointer"
            title={t('Refresh', 'Refresh monitored user data and telemetry')}
          >
            <RefreshCw className={`w-3.5 h-3.5 text-pink-400 ${isManualRefreshing ? 'animate-spin' : ''}`} />
            <span>{manualRefreshedText || t('Refresh', 'Refresh')}</span>
          </button>

          {onLanguageChange && (
            <LanguageSelector currentLanguage={(lang as LanguageCode) || 'en'} onLanguageChange={onLanguageChange} theme="emerald" />
          )}

          {onSwitchToUser && (
            <button
              type="button"
              onClick={onSwitchToUser}
              className="px-3 py-1.5 rounded-xl bg-purple-950/70 hover:bg-purple-900/80 text-purple-200 text-xs font-semibold flex items-center gap-1.5 border border-purple-500/30 transition-all cursor-pointer"
              title="Switch back to User App Screen"
            >
              <Eye className="w-3.5 h-3.5 text-pink-400" />
              <span className="hidden sm:inline">{t('Protected User App', 'Protected User App')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('link')}
            className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 border border-emerald-500/30 transition-all cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{t('+ Link Code', '+ Link Code')}</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="px-3 py-1.5 rounded-xl bg-purple-950/70 hover:bg-rose-500/20 text-purple-300 hover:text-rose-400 text-xs font-semibold flex items-center gap-1.5 border border-purple-500/30 transition-all cursor-pointer"
            title="Log out of guardian session"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('Exit', 'Exit')}</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 container mx-auto px-4 sm:px-6 py-5 max-w-7xl">
        {/* Linked User Switcher */}
        {linkedUsers.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="text-xs text-purple-300/80 uppercase tracking-wider font-semibold mr-1">
              Monitored Users:
            </span>
            {linkedUsers.map((u) => {
              const userActiveSos = u.sosActive || (u.userPhone === selectedUserPhone && isSosActive);
              return (
                <button
                  key={u.id || u.userPhone}
                  type="button"
                  onClick={() => {
                    setSelectedUserPhone(u.userPhone);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                    selectedUserPhone === u.userPhone
                      ? 'rakshika-gradient-btn text-white shadow-lg shadow-pink-950 border border-pink-300'
                      : 'bg-[#0c0722]/85 text-purple-200 border border-purple-500/25 hover:text-white hover:bg-[#140b33]'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${userActiveSos ? 'bg-rose-400 animate-ping' : 'bg-emerald-400'}`} />
                  <span>{u.userName}</span>
                  <span className="text-[0.65rem] font-mono opacity-80">({u.userPhone})</span>
                  {userActiveSos && (
                    <span className="px-1.5 py-0.2 bg-rose-600 text-white text-[0.6rem] font-black rounded uppercase">
                      SOS
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ========================================================= */}
        {/* 1. EMERGENCY DISTRESS DETECTED BANNER (WHEN SOS ACTIVE)   */}
        {/* ========================================================= */}
        {isSosActive && (
          <div className="mb-6 p-5 bg-gradient-to-r from-red-950 via-rose-950 to-neutral-950 border-2 border-rose-500 rounded-3xl shadow-2xl shadow-rose-950/90 relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 relative z-10">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-rose-600 flex items-center justify-center text-white shadow-xl shadow-rose-950 shrink-0 animate-bounce">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wider">
                      EMERGENCY DISTRESS DETECTED!
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-500 text-white text-xs font-black tracking-widest uppercase animate-pulse">
                      URGENT ALERT
                    </span>
                  </div>
                  <p className="text-sm text-rose-200 mt-1">
                    User <strong className="text-white underline">{profile.fullName}</strong> triggered emergency safety distress.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-rose-300 font-mono">
                    <span className="bg-rose-900/60 px-2 py-0.5 rounded border border-rose-700/50">
                      Trigger: {activeIncident?.triggerType || selectedUserState?.audioStatus || 'Manual SOS Hold'}
                    </span>
                    {activeIncident?.createdAt && (
                      <span>Time: {new Date(activeIncident.createdAt).toLocaleTimeString()}</span>
                    )}
                    {latestLocation && (
                      <span>
                        GPS: {latestLocation.latitude.toFixed(4)}, {latestLocation.longitude.toFixed(4)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Rapid Response Actions */}
              <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
                <button
                  type="button"
                  onClick={handleToggleGuardianSiren}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-lg ${
                    isSirenActive
                      ? 'bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black animate-pulse'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
                  }`}
                  title="Audible alarm toggle on guardian device"
                >
                  {isSirenActive ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-rose-400" />}
                  <span>{isSirenActive ? 'Mute Siren' : 'Play Siren'}</span>
                </button>

                <a
                  href={`tel:${profile.phone.replace(/\s+/g, '')}`}
                  className="px-4 py-2.5 bg-white text-rose-950 hover:bg-neutral-100 rounded-xl text-xs font-black flex items-center gap-2 shadow-lg transition-transform hover:scale-105"
                >
                  <Phone className="w-4 h-4 text-rose-600" />
                  <span>Call {profile.fullName.split(' ')[0]}</span>
                </a>

                <a
                  href="tel:112"
                  className="px-3.5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-lg transition-transform hover:scale-105"
                >
                  <span>Call 112</span>
                </a>

                <button
                  type="button"
                  onClick={() => handleResolveIncident(activeIncident?.id)}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-950 transition-all cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Mark Safe (Resolve)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex flex-wrap items-center gap-2 mb-6 border-b border-purple-500/20 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('live')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'live'
                ? 'rakshika-gradient-btn text-white shadow-md shadow-pink-950'
                : 'text-purple-300/70 hover:text-white'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 text-pink-300" />
            <span>{t('Live GPS Map', 'Live GPS & Status')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('voice')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 relative ${
              activeTab === 'voice'
                ? 'rakshika-gradient-btn text-white shadow-md shadow-pink-950'
                : 'text-purple-300/70 hover:text-white'
            }`}
          >
            <Headphones className="w-3.5 h-3.5 text-pink-300" />
            <span>{t('Voice Messages', 'Voice Messages')} ({voiceClips.length})</span>
            {voiceClips.some(c => !c.listenedByGuardian) && (
              <span className="w-2 h-2 rounded-full bg-pink-400 animate-pulse"></span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('medical')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'medical'
                ? 'rakshika-gradient-btn text-white shadow-md shadow-pink-950'
                : 'text-purple-300/70 hover:text-white'
            }`}
          >
            <HeartPulse className="w-3.5 h-3.5 text-pink-300" />
            <span>{t('Medical & SOS', 'Medical & Safety Info')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'history'
                ? 'rakshika-gradient-btn text-white shadow-md shadow-pink-950'
                : 'text-purple-300/70 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-pink-300" />
            <span>{t('Incident Logs', 'Incident Logs & Audits')} ({incidentLogs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('link')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'link'
                ? 'rakshika-gradient-btn text-white shadow-md shadow-pink-950'
                : 'text-purple-300/70 hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5 text-pink-300" />
            <span>{t('Link Code', 'Link With Invite Code')}</span>
          </button>
        </div>

        {/* ========================================================= */}
        {/* TAB 1: LIVE MAP & STATUS (ALL SAFE + SHARING LIVE GPS)    */}
        {/* ========================================================= */}
        {activeTab === 'live' && (
          <div>
            {selectedUserPhone ? (
              <div className="space-y-6">
                {/* 3 Status Modules Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Card 1: ALL SAFE or SOS STATUS */}
                  <div className={`p-4 rounded-2xl border transition-all ${
                    isSosActive 
                      ? 'bg-rose-950/40 border-rose-500/60 shadow-lg shadow-rose-950/40' 
                      : 'rakshika-card border-purple-500/25 shadow-lg shadow-purple-950/40'
                  }`}>
                    <div className="flex items-center justify-between text-xs text-purple-300/80 mb-1.5">
                      <span className="font-semibold uppercase tracking-wider">Emergency Status</span>
                      <Shield className={`w-4 h-4 ${isSosActive ? 'text-rose-500' : 'text-emerald-400'}`} />
                    </div>
                    <div className="text-xl font-black text-white">
                      {isSosActive ? (
                        <span className="text-rose-400 flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping"></span>
                          EMERGENCY DISTRESS
                        </span>
                      ) : (
                        <span className="text-emerald-400 flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          All Safe & Protected
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-purple-300/70 mt-1">
                      {isSosActive
                        ? 'Emergency incident open. Immediate action required.'
                        : 'No distress keywords or falls detected. AI Guard active.'}
                    </p>
                    {!isSosActive && (
                      <div className="mt-3 pt-3 border-t border-purple-500/15 flex items-center justify-between">
                        <span className="text-[0.7rem] text-emerald-400 font-mono">Sensors: Normal</span>
                        <button
                          type="button"
                          onClick={handleRequestSafetyPing}
                          disabled={isPinging}
                          className="text-[0.7rem] font-bold text-purple-200 hover:text-white bg-purple-950/80 hover:bg-purple-900 px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 border border-purple-500/30"
                        >
                          <RefreshCw className={`w-3 h-3 text-pink-400 ${isPinging ? 'animate-spin' : ''}`} />
                          <span>{pingSuccess ? 'Verified!' : 'Request Ping'}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Card 2: SHARING LIVE GPS STATUS */}
                  <div className={`p-4 rounded-2xl border transition-all ${
                    isSharingLocation 
                      ? 'bg-emerald-950/30 border-emerald-500/40 shadow-lg shadow-emerald-950/40' 
                      : 'rakshika-card border-purple-500/25 shadow-lg shadow-purple-950/40'
                  }`}>
                    <div className="flex items-center justify-between text-xs text-purple-300/80 mb-1.5">
                      <span className="font-semibold uppercase tracking-wider">Live GPS Tracking</span>
                      <MapPin className={`w-4 h-4 ${isSharingLocation ? 'text-emerald-400' : 'text-purple-400'}`} />
                    </div>
                    <div className="text-xl font-black text-white">
                      {isSharingLocation ? (
                        <span className="text-emerald-400 flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          Sharing Live GPS
                        </span>
                      ) : (
                        <span className="text-purple-300/70 flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-purple-900"></span>
                          Sharing Paused
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-purple-300/70 mt-1">
                      {isSharingLocation
                        ? 'Real-time telemetry streaming coordinates to console.'
                        : 'User paused broadcast. Last known coordinates pinned below.'}
                    </p>
                    {latestLocation && (
                      <div className="mt-3 pt-3 border-t border-purple-500/15 flex items-center justify-between text-[0.7rem] font-mono text-purple-300/80">
                        <span>Acc: ±{latestLocation.accuracy ? Math.round(latestLocation.accuracy) : 8}m</span>
                        <span>Speed: {latestLocation.speed ? `${Math.round(latestLocation.speed * 3.6)} km/h` : '0 km/h'}</span>
                      </div>
                    )}
                  </div>

                  {/* Card 3: AUDIO & VOICE SHIELD */}
                  <div className={`p-4 rounded-2xl border transition-all ${
                    latestVoiceClip?.tag === 'sos'
                      ? 'bg-rose-950/30 border-rose-500/50 shadow-md shadow-rose-950/20'
                      : 'rakshika-card border-purple-500/25 shadow-lg shadow-purple-950/40'
                  }`}>
                    <div className="flex items-center justify-between text-xs text-purple-300/80 mb-1.5">
                      <span className="font-semibold uppercase tracking-wider">Audio & Voice Shield</span>
                      <Radio className="w-4 h-4 text-pink-400" />
                    </div>
                    {latestVoiceClip ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-white truncate">
                            {latestVoiceClip.title}
                          </span>
                          <span className={`text-[0.65rem] px-2 py-0.5 rounded-full border font-semibold uppercase ${
                            latestVoiceClip.tag === 'sos' ? 'bg-rose-500/20 text-rose-400 border-rose-500/40' : 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          }`}>
                            {latestVoiceClip.tag}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => togglePlayVoiceClip(latestVoiceClip)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow transition-all ${
                              playingVoiceClipId === latestVoiceClip.id
                                ? 'bg-rose-600 text-white animate-pulse'
                                : 'bg-neutral-800 hover:bg-neutral-700 text-white'
                            }`}
                          >
                            {playingVoiceClipId === latestVoiceClip.id ? (
                              <>
                                <Pause className="w-3.5 h-3.5 fill-current" />
                                <span>Pause ({latestVoiceClip.durationSeconds}s)</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5 fill-current" />
                                <span>Play Clip ({latestVoiceClip.durationSeconds}s)</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveTab('voice')}
                            className="text-[0.7rem] text-rose-400 hover:underline cursor-pointer"
                          >
                            All ({voiceClips.length}) &rarr;
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-sm font-bold text-white truncate">
                          {selectedUserState?.audioStatus || 'Safe ambient audio - Voice Shield Active'}
                        </div>
                        <p className="text-xs text-neutral-400 mt-1">
                          Listening for distress keywords: "Help", "Bachao", "Leave me".
                        </p>
                      </>
                    )}
                    <div className="mt-3 pt-3 border-t border-neutral-800/80 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={handleToggleSpeaker}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                          isSpeakerOn
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950 animate-pulse'
                            : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                        }`}
                        title={isSpeakerOn ? 'Click to Mute Live Voice' : 'Click to Listen to User Live Voice'}
                      >
                        {isSpeakerOn ? (
                          <>
                            <Volume2 className="w-3.5 h-3.5 text-white" />
                            <span>Listening Live 🔊</span>
                          </>
                        ) : (
                          <>
                            <VolumeX className="w-3.5 h-3.5 text-neutral-400" />
                            <span>Listen Live (Speaker)</span>
                          </>
                        )}
                      </button>

                      <div className="flex items-center gap-1.5 text-[0.7rem] text-neutral-400">
                        {isSpeakerOn ? (
                          <span className="text-emerald-400 font-mono font-bold flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                            {liveAudioMeter}% Level
                          </span>
                        ) : (
                          <span>Tap speaker to listen</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ========================================================= */}
                {/* LIVE SURVEILLANCE & COMMUNICATION STATION (CAMERA & AUDIO)*/}
                {/* ========================================================= */}
                <div className="rakshika-card border border-purple-500/25 rounded-3xl p-5 lg:p-6 shadow-xl shadow-purple-950/40 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-purple-500/15 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center text-pink-400">
                        <Video className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-white text-base lg:text-lg">
                            Live Surveillance & Communication
                          </h3>
                          <span className="text-[0.65rem] bg-fuchsia-500/20 text-pink-300 border border-fuchsia-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-ping"></span>
                            REAL-TIME STREAM
                          </span>
                        </div>
                        <p className="text-xs text-purple-300/70 mt-0.5">
                          Tap speaker to listen to live voice from {profile.fullName}'s microphone and watch live camera feed.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Speaker Quick Button in Header */}
                      <button
                        type="button"
                        onClick={handleToggleSpeaker}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md ${
                          isSpeakerOn
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950 animate-pulse'
                            : 'bg-purple-950/70 hover:bg-purple-900 text-purple-200 border border-purple-500/30'
                        }`}
                      >
                        {isSpeakerOn ? (
                          <>
                            <Volume2 className="w-4 h-4" />
                            <span>Speaker Active 🔊</span>
                          </>
                        ) : (
                          <>
                            <VolumeX className="w-4 h-4 text-purple-400" />
                            <span>Tap Speaker to Listen</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Main Grid: Live Camera Stream + Live Audio & Intercom Console */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* 1. Live Camera Monitor */}
                    <div className="bg-[#0c0722]/85 border border-purple-500/20 rounded-2xl p-4 flex flex-col justify-between space-y-3 relative overflow-hidden">
                      <div className="flex items-center justify-between text-xs text-purple-300/80">
                        <span className="font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <Video className="w-3.5 h-3.5 text-pink-400" />
                          <span>Protected User Camera Stream</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[0.65rem] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                            4-5 FPS LIVE
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsLiveExpanded(!isLiveExpanded)}
                            className="p-1 rounded-lg text-purple-300 hover:text-white bg-purple-950/70 border border-purple-500/30 cursor-pointer"
                            title="Toggle Expanded View"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Video Player Window */}
                      <div className={`relative bg-black rounded-xl overflow-hidden flex items-center justify-center border border-purple-500/20 aspect-video ${isLiveExpanded ? 'lg:aspect-auto lg:h-96' : ''}`}>
                        {liveCameraFrame || selectedUserState?.lastImage ? (
                          <>
                            <img
                              src={liveCameraFrame || selectedUserState?.lastImage}
                              alt="Live camera stream"
                              className="w-full h-full object-cover select-none"
                            />
                            {/* Live Badge Overlay */}
                            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg text-[0.65rem] font-mono font-bold text-white border border-white/10">
                              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                              <span className="text-rose-400">LIVE FEED</span>
                            </div>

                            <div className="absolute bottom-2.5 right-2.5 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={handleSaveCameraSnapshot}
                                className="px-2.5 py-1 bg-black/70 hover:bg-black/90 backdrop-blur-md text-white text-[0.7rem] font-semibold rounded-lg border border-white/20 flex items-center gap-1 transition-all cursor-pointer"
                                title="Save Camera Frame as Evidence"
                              >
                                <Download className="w-3 h-3" />
                                <span>Save Snapshot</span>
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="text-center p-6 space-y-2">
                            <VideoOff className="w-10 h-10 text-neutral-600 mx-auto" />
                            <p className="text-xs font-semibold text-neutral-400">
                              Awaiting User Camera Stream
                            </p>
                            <p className="text-[0.7rem] text-neutral-500 max-w-xs">
                              Live video frames will appear automatically once {profile.fullName} grants camera permission.
                            </p>
                          </div>
                        )}
                      </div>

                      {snapshotSavedNotice && (
                        <div className="p-2 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-[0.75rem] text-emerald-300 flex items-center gap-1.5 animate-in fade-in">
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Snapshot captured and saved to downloads!</span>
                        </div>
                      )}
                    </div>

                    {/* 2. Live Audio & Speaker Console */}
                    <div className="bg-[#0c0722]/85 border border-purple-500/20 rounded-2xl p-4 flex flex-col justify-between space-y-4">
                      <div>
                        <div className="flex items-center justify-between text-xs text-purple-300/80 mb-3">
                          <span className="font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <Headphones className="w-3.5 h-3.5 text-pink-400" />
                            <span>Live Microphone & Speaker Audio</span>
                          </span>
                          <span className="text-[0.65rem] text-purple-400/70 font-mono">
                            16 kHz Ultra-Low Latency
                          </span>
                        </div>

                        {/* Large Speaker Interactive Toggle Button */}
                        <div className="p-4 bg-[#140b33] border border-purple-500/25 rounded-2xl space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <button
                              type="button"
                              onClick={handleToggleSpeaker}
                              className={`w-full sm:w-auto flex-1 py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-lg active:scale-95 ${
                                isSpeakerOn
                                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50 border border-emerald-400/40 animate-pulse'
                                  : 'bg-purple-950/70 hover:bg-purple-900 text-purple-200 border border-purple-500/30'
                              }`}
                            >
                              {isSpeakerOn ? (
                                <>
                                  <Volume2 className="w-5 h-5 text-white" />
                                  <div className="text-left">
                                    <div className="text-xs font-black">{t('SPEAKER ACTIVE • LISTENING LIVE', 'SPEAKER ACTIVE • LISTENING LIVE')}</div>
                                    <div className="text-[0.65rem] text-emerald-200 font-normal">{t('Tap to mute speaker', 'Tap to mute speaker')}</div>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <VolumeX className="w-5 h-5 text-purple-400" />
                                  <div className="text-left">
                                    <div className="text-xs font-black">{t('Tap Speaker to Listen to User Live', 'TAP SPEAKER TO LISTEN LIVE')}</div>
                                    <div className="text-[0.65rem] text-purple-300/70 font-normal">{t('Listening Live to User Voice & Environment', "Hear user's live voice & room audio")}</div>
                                  </div>
                                </>
                              )}
                            </button>
                          </div>

                          {/* Volume Slider */}
                          <div className="flex items-center gap-3 pt-1">
                            <span className="text-[0.7rem] text-purple-300/80 font-medium shrink-0 flex items-center gap-1">
                              <Volume2 className="w-3 h-3 text-pink-400" />
                              <span>{t('Volume:', 'Speaker Volume:')}</span>
                            </span>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              value={speakerVolume}
                              onChange={(e) => handleSpeakerVolumeChange(parseFloat(e.target.value))}
                              className="flex-1 accent-pink-500 h-1.5 bg-[#0c0722] rounded-lg cursor-pointer"
                            />
                            <span className="text-[0.7rem] font-mono text-pink-300 w-10 text-right">
                              {Math.round(speakerVolume * 100)}%
                            </span>
                          </div>

                          {/* Real-time Audio Waveform Visualizer */}
                          <div className="pt-2 border-t border-purple-500/15">
                            <div className="flex items-center justify-between text-[0.65rem] text-purple-300/80 mb-1.5">
                              <span>{t('Microphone Level', 'User Microphone Input Level')}</span>
                              <span className="font-mono text-pink-300 font-bold">{liveAudioMeter}%</span>
                            </div>
                            <div className="flex items-center gap-1 h-6 bg-[#0c0722] rounded-xl p-1.5 border border-purple-500/20">
                              {Array.from({ length: 24 }).map((_, i) => {
                                const heightPercent = Math.min(100, Math.max(15, (liveAudioMeter * 1.5) - (Math.abs(12 - i) * 3)));
                                const isActive = liveAudioMeter > (i * 3.5);
                                return (
                                  <div
                                    key={i}
                                    className={`flex-1 rounded-full transition-all duration-75 ${
                                      isActive 
                                        ? i > 18 ? 'bg-rose-500' : i > 12 ? 'bg-fuchsia-500' : 'bg-pink-400'
                                        : 'bg-purple-950/60'
                                    }`}
                                    style={{ height: `${isActive ? heightPercent : 20}%` }}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 3. Two-Way Intercom (Guardian Talks to User) */}
                      <div className="p-3.5 bg-[#140b33] border border-purple-500/20 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-1.5">
                            <Mic className="w-3.5 h-3.5 text-pink-400" />
                            <span>{t('Push-to-Talk Intercom', 'Two-Way Intercom')}</span>
                          </div>
                          <p className="text-[0.7rem] text-neutral-400 mt-0.5">
                            {t('Hold to Speak to User', "Speak directly into user's phone speaker in real-time.")}
                          </p>
                        </div>

                        <button
                          type="button"
                          onMouseDown={handleStartIntercom}
                          onMouseUp={handleStopIntercom}
                          onTouchStart={handleStartIntercom}
                          onTouchEnd={handleStopIntercom}
                          className={`w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer select-none active:scale-95 shadow-md ${
                            isIntercomTalking
                              ? 'bg-rose-600 text-white shadow-rose-950 animate-pulse border-2 border-rose-400'
                              : 'bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700'
                          }`}
                        >
                          <Mic className="w-4 h-4" />
                          <span>{isIntercomTalking ? t('Speaking to User...', 'Transmitting Voice...') : t('Hold to Speak to User', 'Hold / Press to Speak')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* GPS Location Bar with Copy and Google Maps Navigation */}
                {latestLocation && (
                  <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                        <Navigation className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-2">
                          <span>Coordinates:</span>
                          <span className="font-mono text-emerald-300">
                            {latestLocation.latitude.toFixed(6)}, {latestLocation.longitude.toFixed(6)}
                          </span>
                        </div>
                        <p className="text-[0.7rem] text-neutral-400">
                          Last updated: {new Date(latestLocation.timestamp || Date.now()).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyCoordinates}
                        className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copiedCoords ? 'Copied!' : 'Copy GPS'}</span>
                      </button>

                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${latestLocation.latitude},${latestLocation.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-950"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Navigate in Google Maps</span>
                      </a>
                    </div>
                  </div>
                )}

                {/* Bidirectional Access Permissions Console on Guardian Dashboard */}
                <GuardianAccessControls
                  userPhone={selectedUserPhone}
                  userName={profile.fullName}
                  guardianPhone={guardianPhone}
                  guardianName={guardianName}
                  isGuardianMode={true}
                  permissions={accessPermissions}
                  pendingRequests={pendingRequests}
                  onUpdatePermissions={handleUpdatePermissions}
                  onRequestPermission={handleRequestPermission}
                  t={t}
                />

                {/* Interactive Live Map Component */}
                <div className="rounded-2xl overflow-hidden border border-purple-500/25 shadow-xl shadow-purple-950/40">
                  <LiveLocationMap
                    location={latestLocation}
                    isSharing={isSharingLocation && accessPermissions.location}
                    userName={profile.fullName}
                  />
                </div>
              </div>
            ) : (
              <div className="p-12 rakshika-card border border-purple-500/25 rounded-3xl text-center max-w-md mx-auto shadow-xl shadow-purple-950/40">
                <Users className="w-12 h-12 text-purple-400/60 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-white mb-1">No Users Linked Yet</h3>
                <p className="text-xs text-purple-300/70 mb-6 leading-relaxed">
                  Enter the 6-character invite code provided by the person you are monitoring to view their live GPS, distress alerts, and medical profile.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('link')}
                  className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-950/60 transition-all cursor-pointer"
                >
                  Link With Invite Code
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: VOICE MESSAGES & AUDIO CLIPS RELAY                 */}
        {/* ========================================================= */}
        {activeTab === 'voice' && (
          <div className="space-y-6 max-w-4xl mx-auto">
            <div className="p-6 rakshika-card border border-purple-500/25 rounded-3xl shadow-xl shadow-purple-950/40 space-y-6">
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-purple-500/20 pb-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-400 shrink-0">
                    <Headphones className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <span>Incoming Voice Messages</span>
                      <span className="text-xs bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30 px-2 py-0.5 rounded-full font-semibold">
                        {voiceClips.length} Audio Clips
                      </span>
                    </h2>
                    <p className="text-xs text-purple-300/70">
                      Encrypted audio clips and emergency voice recordings from {profile.fullName}.
                    </p>
                  </div>
                </div>

                {voiceClips.length > 0 && (
                  <div className="text-xs text-purple-300/70 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span>Direct Audio Feed Ready</span>
                  </div>
                )}
              </div>

              {/* Voice Clips List */}
              {voiceClips.length === 0 ? (
                <div className="py-12 px-6 text-center bg-[#0c0722]/85 border border-purple-500/20 rounded-2xl space-y-3">
                  <div className="w-14 h-14 rounded-full bg-purple-950/60 border border-purple-500/30 flex items-center justify-center mx-auto text-purple-400">
                    <Mic className="w-7 h-7" />
                  </div>
                  <h3 className="text-sm font-bold text-purple-200">No Voice Messages Yet</h3>
                  <p className="text-xs text-purple-300/60 max-w-sm mx-auto">
                    When {profile.fullName} records a voice message or distress clip, it will be relayed here in real-time.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {voiceClips.map((clip) => {
                    const isPlaying = playingVoiceClipId === clip.id;
                    const isSos = clip.tag === 'sos';
                    const isSuspicious = clip.tag === 'suspicious';

                    return (
                      <div
                        key={clip.id}
                        className={`p-5 rounded-2xl border transition-all ${
                          isSos
                            ? 'bg-rose-950/40 border-rose-500/50 shadow-lg shadow-rose-950/30'
                            : isSuspicious
                            ? 'bg-amber-950/30 border-amber-500/40'
                            : 'bg-[#0c0722]/85 border-purple-500/20 hover:border-purple-500/40'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          {/* Play button + Clip Metadata */}
                          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                            <button
                              type="button"
                              onClick={() => togglePlayVoiceClip(clip)}
                              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 cursor-pointer shadow-lg transition-all active:scale-95 ${
                                isPlaying
                                  ? 'bg-gradient-to-r from-rose-500 to-pink-600 text-white animate-pulse'
                                  : isSos
                                  ? 'bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white'
                                  : 'bg-purple-950/80 hover:bg-purple-900/90 text-white border border-purple-500/30'
                              }`}
                            >
                              {isPlaying ? (
                                <Pause className="w-5 h-5 fill-current" />
                              ) : (
                                <Play className="w-5 h-5 fill-current ml-0.5" />
                              )}
                            </button>

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className="text-sm font-bold text-white truncate">
                                  {clip.title}
                                </span>
                                <span className={`text-[0.65rem] px-2.5 py-0.5 rounded-full border font-bold uppercase ${
                                  isSos
                                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                    : isSuspicious
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    : clip.tag === 'route_deviation'
                                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                    : clip.tag === 'checkin'
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    : 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                }`}>
                                  {clip.tag.replace('_', ' ')}
                                </span>

                                {!clip.listenedByGuardian && (
                                  <span className="text-[0.6rem] bg-rose-500 text-white px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wider">
                                    New
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-3 text-xs text-purple-300/70 font-mono">
                                <span className="flex items-center gap-1 text-white font-semibold">
                                  <Clock className="w-3.5 h-3.5 text-purple-400" />
                                  {clip.durationSeconds}s
                                </span>
                                <span>•</span>
                                <span>{new Date(clip.createdAt).toLocaleString()}</span>
                                {clip.coordinates && (
                                  <>
                                    <span>•</span>
                                    <span className="text-pink-400 flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />
                                      GPS: {clip.coordinates.latitude.toFixed(4)}, {clip.coordinates.longitude.toFixed(4)}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Action Controls */}
                          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                            {clip.coordinates && (
                              <a
                                href={`https://www.google.com/maps/dir/?api=1&destination=${clip.coordinates.latitude},${clip.coordinates.longitude}`}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3 py-1.5 bg-purple-950/70 hover:bg-purple-900/80 text-purple-200 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1 border border-purple-500/30 transition-colors"
                              >
                                <MapPin className="w-3 h-3 text-pink-400" />
                                <span>View Location</span>
                              </a>
                            )}

                            <a
                              href={clip.audioBase64}
                              download={`voice-clip-${clip.id}.webm`}
                              className="p-2 rounded-xl bg-purple-950/70 hover:bg-purple-900/80 text-purple-300 hover:text-white border border-purple-500/30 transition-colors"
                              title="Download audio clip"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>

                        {/* Playing Progress Bar */}
                        {isPlaying && (
                          <div className="mt-3 pt-3 border-t border-purple-500/20 space-y-1.5">
                            <div className="flex items-center justify-between text-[0.65rem] text-purple-300/70 font-mono">
                              <span className="text-pink-400 flex items-center gap-1">
                                <Volume2 className="w-3 h-3" /> Playing audio clip...
                              </span>
                              <span>{Math.round(playbackProgress)}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-purple-950/60 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-100"
                                style={{ width: `${playbackProgress}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: MEDICAL & EMERGENCY INFORMATION (EVERY SINGLE INFO)*/}
        {/* ========================================================= */}
        {activeTab === 'medical' && (
          <div className="space-y-6 max-w-4xl mx-auto">
            <div className="p-6 rakshika-card border border-purple-500/25 rounded-3xl shadow-xl shadow-purple-950/40">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-purple-500/20 pb-5 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                    <HeartPulse className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Emergency Medical & Safety Profile</h2>
                    <p className="text-xs text-purple-300/70">
                      Synchronized from user's encrypted Rakshika AI profile.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-purple-950/70 border border-purple-500/30 rounded-xl text-xs font-mono text-purple-300">
                    ID: {profile.phone}
                  </span>
                </div>
              </div>

              {/* Information Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Full Identity */}
                <div className="p-4 bg-[#0c0722]/85 border border-purple-500/20 rounded-2xl">
                  <span className="text-xs text-purple-300/80 uppercase tracking-wider font-semibold block mb-2">
                    Protected Individual
                  </span>
                  <div className="text-lg font-bold text-white mb-1">{profile.fullName}</div>
                  <div className="text-sm font-mono text-pink-400 mb-1">{profile.phone}</div>
                  {profile.email && (
                    <div className="text-xs text-purple-300/70">{profile.email}</div>
                  )}
                  <div className="mt-3 pt-3 border-t border-purple-500/20 flex items-center gap-2">
                    <a
                      href={`tel:${profile.phone.replace(/\s+/g, '')}`}
                      className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md shadow-purple-950/40"
                    >
                      <Phone className="w-3.5 h-3.5 text-pink-200" />
                      <span>Direct Call</span>
                    </a>
                  </div>
                </div>

                {/* 2. Blood Group */}
                <div className="p-4 bg-[#0c0722]/85 border border-purple-500/20 rounded-2xl flex flex-col justify-between">
                  <div>
                    <span className="text-xs text-purple-300/80 uppercase tracking-wider font-semibold block mb-2 flex items-center gap-1.5">
                      <Droplet className="w-3.5 h-3.5 text-rose-500" />
                      <span>Blood Group</span>
                    </span>
                    <div className="text-3xl font-black text-rose-400 tracking-tight">
                      {profile.bloodGroup || 'O+'}
                    </div>
                  </div>
                  <p className="text-[0.7rem] text-purple-300/60 mt-2">
                    Essential for first responders and emergency paramedics in hospital trauma wards.
                  </p>
                </div>

                {/* 3. Allergies */}
                <div className="p-4 bg-[#0c0722]/85 border border-purple-500/20 rounded-2xl">
                  <span className="text-xs text-purple-300/80 uppercase tracking-wider font-semibold block mb-2 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                    <span>Known Allergies</span>
                  </span>
                  <div className="text-sm font-semibold text-white bg-purple-950/50 p-3 rounded-xl border border-purple-500/20">
                    {profile.allergies || 'None reported'}
                  </div>
                  <p className="text-[0.7rem] text-purple-300/60 mt-2">
                    Verified medication and food allergies.
                  </p>
                </div>

                {/* 4. Medical Notes / Chronic Conditions */}
                <div className="p-4 bg-[#0c0722]/85 border border-purple-500/20 rounded-2xl">
                  <span className="text-xs text-purple-300/80 uppercase tracking-wider font-semibold block mb-2 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-fuchsia-400" />
                    <span>Medical Conditions & Notes</span>
                  </span>
                  <div className="text-sm font-semibold text-white bg-purple-950/50 p-3 rounded-xl border border-purple-500/20">
                    {profile.medicalNotes || 'No chronic medical conditions reported. All sensors active.'}
                  </div>
                  <p className="text-[0.7rem] text-purple-300/60 mt-2">
                    Doctor instructions and emergency medical details.
                  </p>
                </div>
              </div>

              {/* Primary Emergency Contact Card */}
              <div className="mt-4 p-5 bg-gradient-to-r from-[#0c0722]/95 to-purple-950/70 border border-purple-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-xs text-purple-300/80 uppercase tracking-wider font-semibold block mb-1">
                    Primary Emergency Contact
                  </span>
                  <div className="text-base font-bold text-white">
                    {profile.emergencyContactName || 'Father (Rajesh)'}
                  </div>
                  <div className="text-xs font-mono text-pink-400">
                    {profile.emergencyContactPhone || '+91 98111 22334'}
                  </div>
                </div>

                <a
                  href={`tel:${(profile.emergencyContactPhone || '+919811122334').replace(/\s+/g, '')}`}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-purple-950/50 transition-transform hover:scale-105"
                >
                  <Phone className="w-4 h-4" />
                  <span>Call Emergency Contact</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: INCIDENT LOGS & SAFETY AUDIT EVENTS                */}
        {/* ========================================================= */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            {/* Incidents Table */}
            <div className="rakshika-card border border-purple-500/25 rounded-2xl p-5 shadow-lg shadow-purple-950/40">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-purple-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>Emergency SOS Incidents ({incidentLogs.length})</span>
                </h3>
              </div>

              {incidentLogs.length > 0 ? (
                <div className="space-y-2.5">
                  {incidentLogs.map((inc) => (
                    <div
                      key={inc.id}
                      className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        inc.status === 'ACTIVE'
                          ? 'bg-rose-950/40 border-rose-500/50 shadow-md shadow-rose-950/30'
                          : 'bg-[#0c0722]/85 border-purple-500/20'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[0.65rem] font-bold uppercase px-2 py-0.5 rounded-md ${
                            inc.status === 'ACTIVE'
                              ? 'bg-rose-600 text-white animate-pulse'
                              : 'bg-purple-950/70 text-purple-300 border border-purple-500/30'
                          }`}>
                            {inc.status}
                          </span>
                          <span className="text-xs font-bold text-white">Trigger: {inc.triggerType}</span>
                        </div>
                        <p className="text-xs text-purple-200/90">{inc.notes || 'Emergency triggered'}</p>
                        <div className="text-[0.65rem] text-purple-300/70 mt-1 flex items-center gap-3 font-mono">
                          <span>{new Date(inc.createdAt).toLocaleString()}</span>
                          {inc.latitude && inc.longitude && (
                            <span>GPS: {inc.latitude.toFixed(4)}, {inc.longitude.toFixed(4)}</span>
                          )}
                        </div>
                      </div>

                      {inc.status === 'ACTIVE' && (
                        <button
                          type="button"
                          onClick={() => handleResolveIncident(inc.id)}
                          className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-lg shrink-0 transition-colors cursor-pointer flex items-center gap-1.5 shadow"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Resolve</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-purple-300/60 py-3">No emergency distress incidents logged for this user.</p>
              )}
            </div>

            {/* Safety Events */}
            <div className="rakshika-card border border-purple-500/25 rounded-2xl p-5 shadow-lg shadow-purple-950/40">
              <h3 className="text-sm font-bold uppercase tracking-wider text-purple-200 mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-pink-400" />
                <span>Safety Event Audit Logs ({safetyEvents.length})</span>
              </h3>

              {safetyEvents.length > 0 ? (
                <div className="space-y-2">
                  {safetyEvents.map((evt) => (
                    <div key={evt.id} className="p-3 bg-[#0c0722]/85 border border-purple-500/20 rounded-xl text-xs">
                      <div className="flex items-center justify-between text-purple-300/70 mb-0.5">
                        <span className="font-semibold text-white uppercase">{evt.eventType}</span>
                        <span className="text-[0.65rem] text-purple-300/70 font-mono">
                          {new Date(evt.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-purple-200/90">{evt.details}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-purple-300/60 py-3">No telemetry safety events logged yet.</p>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: LINK USER WITH INVITE CODE                         */}
        {/* ========================================================= */}
        {activeTab === 'link' && (
          <div className="max-w-xl mx-auto">
            <GuardianLinkingModal
              userPhone={selectedUserPhone || ''}
              userName=""
              isGuardianMode={true}
              guardianPhone={guardianPhone}
              guardianName={guardianName}
              onLinkSuccess={() => {
                loadLinkedUsers();
                setActiveTab('live');
              }}
            />
          </div>
        )}
        {/* Fullscreen Expanded Live Stream & Intercom Modal */}
        {isLiveExpanded && (
          <div className="fixed inset-0 z-50 bg-[#060312]/95 backdrop-blur-xl p-4 md:p-8 flex flex-col justify-between animate-in fade-in">
            <div className="flex items-center justify-between pb-4 border-b border-purple-500/20">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-pink-500/20 border border-pink-500/40 flex items-center justify-center text-pink-400">
                  <Video className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base flex items-center gap-2">
                    <span>Live Surveillance Feed: {profile.fullName}</span>
                    <span className="text-[0.65rem] bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-full font-bold">
                      🔴 LIVE
                    </span>
                  </h3>
                  <p className="text-xs text-purple-300/70">Real-time camera & speaker audio stream</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveCameraSnapshot}
                  className="px-3 py-1.5 bg-purple-950/70 hover:bg-purple-900/80 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer border border-purple-500/30"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Snapshot</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsLiveExpanded(false)}
                  className="p-2 bg-purple-950/70 hover:bg-purple-900/80 text-white rounded-xl cursor-pointer border border-purple-500/30"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 my-4 relative flex items-center justify-center overflow-hidden rounded-2xl bg-black border border-purple-500/30">
              {liveCameraFrame || selectedUserState?.lastImage ? (
                <img
                  src={liveCameraFrame || selectedUserState?.lastImage}
                  alt="Expanded live stream"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-purple-400/60 text-sm">Connecting live video...</div>
              )}
            </div>

            {/* Bottom Controls in Fullscreen */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-purple-500/20">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleToggleSpeaker}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                    isSpeakerOn ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg animate-pulse' : 'bg-purple-950/70 text-purple-300 border border-purple-500/30'
                  }`}
                >
                  {isSpeakerOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-purple-400" />}
                  <span>{isSpeakerOn ? 'Speaker ON 🔊' : 'Tap Speaker to Listen'}</span>
                </button>

                {isSpeakerOn && (
                  <div className="flex items-center gap-2 text-xs text-purple-300">
                    <span className="text-[0.7rem]">Level:</span>
                    <span className="font-mono text-pink-400 font-bold">{liveAudioMeter}%</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onMouseDown={handleStartIntercom}
                onMouseUp={handleStopIntercom}
                onTouchStart={handleStartIntercom}
                onTouchEnd={handleStopIntercom}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  isIntercomTalking ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white animate-pulse' : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white'
                }`}
              >
                <Mic className="w-4 h-4" />
                <span>{isIntercomTalking ? 'Transmitting Voice...' : 'Hold to Speak'}</span>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
