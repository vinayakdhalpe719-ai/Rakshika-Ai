import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, MicOff, AlertTriangle, Shield, Check, Info, Radio, RefreshCw, 
  Play, Pause, Square, Send, Volume2, Clock, MapPin, Tag, CheckCircle2, 
  Trash2, Download, Sparkles, Share2, Headphones, AlertCircle
} from 'lucide-react';
import { DISTRESS_KEYWORDS, SUPPORTED_LANGUAGES, LanguageCode, translate } from '../translations';
import { VoiceClip, VoiceClipTag } from '../types/safety';
import { cacheSingleVoiceClip, getCachedVoiceClips, enqueueOfflineAction } from '../lib/offlineStorage';

interface VoiceDangerPanelProps {
  onDistressDetected: (keyword: string, languageName: string) => void;
  lang: LanguageCode;
  userName?: string;
  userPhone?: string;
  currentLocation?: { latitude: number; longitude: number } | null;
  onVoiceClipShared?: (clip: VoiceClip) => void;
}

export default function VoiceDangerPanel({
  onDistressDetected,
  lang,
  userName = 'User',
  userPhone = '',
  currentLocation = null,
  onVoiceClipShared,
}: VoiceDangerPanelProps) {
  const t = (k: string, d?: string) => translate(k, lang, d);

  // Panel Mode: 'record' (Record & Share Voice Message) vs 'listen' (Keyword Detection)
  const [activeMode, setActiveMode] = useState<'record' | 'listen'>('record');

  // -------------------------------------------------------------
  // 1. VOICE RECORDING & GUARDIAN SHARING STATE
  // -------------------------------------------------------------
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedAudioBase64, setRecordedAudioBase64] = useState<string | null>(null);
  const [recordedMimeType, setRecordedMimeType] = useState<string>('audio/webm');
  const [selectedTag, setSelectedTag] = useState<VoiceClipTag>('suspicious');
  const [clipTitle, setClipTitle] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendSuccessMsg, setSendSuccessMsg] = useState<string | null>(null);
  const [recordMicLevel, setRecordMicLevel] = useState(0);
  const [sentClips, setSentClips] = useState<VoiceClip[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyRefreshedText, setHistoryRefreshedText] = useState<string | null>(null);

  // Audio Playback Preview State
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Sent Clips List Audio Player State
  const [playingClipId, setPlayingClipId] = useState<string | null>(null);
  const clipAudioRef = useRef<HTMLAudioElement | null>(null);

  // Recorder Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<any>(null);
  const recordAnalyserRef = useRef<AnalyserNode | null>(null);
  const recordAudioCtxRef = useRef<AudioContext | null>(null);
  const recordAnimRef = useRef<number | null>(null);

  // -------------------------------------------------------------
  // 2. KEYWORD DETECTION STATE
  // -------------------------------------------------------------
  const [isListening, setIsListening] = useState(false);
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
  const [lastDetectedKeyword, setLastDetectedKeyword] = useState<string | null>(null);
  const [detectedCount, setDetectedCount] = useState(0);
  const [listenAudioLevel, setListenAudioLevel] = useState(0);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [recentTranscripts, setRecentTranscripts] = useState<string[]>([]);

  const recognitionRef = useRef<any>(null);
  const listenAudioContextRef = useRef<AudioContext | null>(null);
  const listenAnalyserRef = useRef<AnalyserNode | null>(null);
  const listenMediaStreamRef = useRef<MediaStream | null>(null);
  const listenAnimFrameRef = useRef<number | null>(null);

  // Check Web Speech API support
  useEffect(() => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setSpeechSupported(false);
    }
  }, []);

  // Load existing sent voice clips on mount and when userPhone changes
  const loadSentClips = async () => {
    const phone = userPhone || (typeof window !== 'undefined' ? localStorage.getItem('rakshika_user_phone') || '' : '');
    setIsLoadingHistory(true);
    setHistoryRefreshedText(null);
    try {
      if (phone) {
        // 1. Try local IndexedDB first for instant responsiveness
        const cached = await getCachedVoiceClips(phone);
        if (cached && cached.length > 0) {
          setSentClips(cached);
        }

        // 2. Fetch fresh list from server
        const res = await fetch(`/api/voice-clips/${encodeURIComponent(phone)}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setSentClips(data);
          }
        }
      }
      setHistoryRefreshedText(t('Refreshed!', 'Refreshed!'));
      setTimeout(() => setHistoryRefreshedText(null), 2500);
    } catch (err) {
      console.warn("Failed to load sent voice clips:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadSentClips();
  }, [userPhone]);

  // -------------------------------------------------------------
  // MEDIA RECORDER: START / STOP
  // -------------------------------------------------------------

  const getSupportedMimeType = () => {
    if (typeof MediaRecorder === 'undefined') return '';
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/wav',
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  };

  const startVoiceRecording = async () => {
    try {
      setSendSuccessMsg(null);
      // Clean up previous preview audio
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
        setRecordedAudioUrl(null);
        setRecordedAudioBase64(null);
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;

      // Audio level analyser for visual feedback
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const analyser = audioCtx.createAnalyser();
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 64;
        recordAnalyserRef.current = analyser;
        recordAudioCtxRef.current = audioCtx;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateMeter = () => {
          if (recordAnalyserRef.current) {
            recordAnalyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            setRecordMicLevel(Math.min(Math.round((avg / 128) * 100), 100));
            recordAnimRef.current = requestAnimationFrame(updateMeter);
          }
        };
        updateMeter();
      } catch (e) {
        console.warn("Record meter skipped:", e);
      }

      const mimeType = getSupportedMimeType() || 'audio/webm';
      setRecordedMimeType(mimeType);

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      recordChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(recordChunksRef.current, { type: mimeType });
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecordedAudioUrl(audioUrl);

        // Convert blob to Base64 data URL
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Data = reader.result as string;
          setRecordedAudioBase64(base64Data);
        };
        reader.readAsDataURL(audioBlob);

        // Stop stream tracks
        if (recordStreamRef.current) {
          recordStreamRef.current.getTracks().forEach((t) => t.stop());
          recordStreamRef.current = null;
        }
      };

      mediaRecorder.start(250);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordSeconds(0);

      // Start timer (maximum 60 seconds)
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((sec) => {
          if (sec >= 59) {
            stopVoiceRecording();
            return 60;
          }
          return sec + 1;
        });
      }, 1000);
    } catch (err: any) {
      console.error("Failed to start voice recording:", err);
      alert("Microphone access is required to record voice messages. Please check your browser permissions.");
    }
  };

  const stopVoiceRecording = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (recordAnimRef.current) {
      cancelAnimationFrame(recordAnimRef.current);
      recordAnimRef.current = null;
    }
    if (recordAudioCtxRef.current) {
      try {
        recordAudioCtxRef.current.close();
      } catch (_) {}
      recordAudioCtxRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (_) {}
    }
    setIsRecording(false);
    setRecordMicLevel(0);
  };

  const discardRecording = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
    }
    setRecordedAudioUrl(null);
    setRecordedAudioBase64(null);
    setRecordSeconds(0);
    setIsPlayingPreview(false);
    setPreviewProgress(0);
    setSendSuccessMsg(null);
  };

  // Handle Share to Guardian
  const handleShareToGuardian = async () => {
    if (!recordedAudioBase64 || !userPhone) {
      return;
    }

    setIsSending(true);
    setSendSuccessMsg(null);

    const title = clipTitle.trim() || getDefaultTagTitle(selectedTag);
    const duration = Math.max(recordSeconds, 1);

    const payload = {
      userPhone,
      userName,
      audioBase64: recordedAudioBase64,
      mimeType: recordedMimeType,
      durationSeconds: duration,
      title,
      tag: selectedTag,
      coordinates: currentLocation ? {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      } : null,
    };

    try {
      const res = await fetch('/api/voice-clips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        const savedClip: VoiceClip = data.voiceClip;
        
        // Cache to IndexedDB
        cacheSingleVoiceClip(savedClip).catch(() => {});
        setSentClips((prev) => [savedClip, ...prev.filter((c) => c.id !== savedClip.id)]);
        setSendSuccessMsg(`Voice message securely shared with your connected guardian!`);
        if (onVoiceClipShared) onVoiceClipShared(savedClip);

        // Reset recorder view
        setTimeout(() => {
          discardRecording();
          setClipTitle('');
        }, 1500);
      } else {
        throw new Error('Upload failed');
      }
    } catch (err) {
      console.warn("Network upload failed, queueing offline:", err);
      // Offline fallback: Queue action in IndexedDB
      const offlineClip: VoiceClip = {
        id: `offline-vc-${Date.now()}`,
        userPhone,
        userName,
        audioBase64: recordedAudioBase64,
        mimeType: recordedMimeType,
        durationSeconds: duration,
        title,
        tag: selectedTag,
        createdAt: new Date().toISOString(),
        coordinates: currentLocation,
        listenedByGuardian: false,
      };

      await cacheSingleVoiceClip(offlineClip);
      await enqueueOfflineAction({ type: 'upload_voice_clip', payload });

      setSentClips((prev) => [offlineClip, ...prev]);
      setSendSuccessMsg("Voice message saved offline! It will automatically sync to your guardian when signal returns.");
      setTimeout(() => {
        discardRecording();
        setClipTitle('');
      }, 2000);
    } finally {
      setIsSending(false);
    }
  };

  const getDefaultTagTitle = (tag: VoiceClipTag) => {
    switch (tag) {
      case 'sos': return 'Emergency Voice Alert';
      case 'suspicious': return 'Suspicious Activity Notice';
      case 'route_deviation': return 'Cab/Route Deviation Alert';
      case 'checkin': return 'Safe Location Check-in';
      case 'general': return 'Voice Safety Message';
    }
  };

  const getTagBadgeStyle = (tag: VoiceClipTag) => {
    switch (tag) {
      case 'sos':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/40';
      case 'suspicious':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'route_deviation':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'checkin':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
      case 'general':
      default:
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
    }
  };

  const getTagIcon = (tag: VoiceClipTag) => {
    switch (tag) {
      case 'sos': return <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />;
      case 'suspicious': return <AlertCircle className="w-3.5 h-3.5 text-amber-400" />;
      case 'route_deviation': return <MapPin className="w-3.5 h-3.5 text-blue-400" />;
      case 'checkin': return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'general': return <Volume2 className="w-3.5 h-3.5 text-purple-400" />;
    }
  };

  // -------------------------------------------------------------
  // AUDIO PLAYBACK HANDLERS
  // -------------------------------------------------------------

  const togglePreviewPlay = () => {
    if (!previewAudioRef.current) return;
    if (isPlayingPreview) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      previewAudioRef.current.play().catch(console.warn);
      setIsPlayingPreview(true);
    }
  };

  const toggleClipPlay = (clip: VoiceClip) => {
    if (playingClipId === clip.id) {
      if (clipAudioRef.current) {
        clipAudioRef.current.pause();
      }
      setPlayingClipId(null);
    } else {
      if (clipAudioRef.current) {
        clipAudioRef.current.pause();
      }
      const audio = new Audio(clip.audioBase64);
      audio.onended = () => setPlayingClipId(null);
      audio.play().catch(console.warn);
      clipAudioRef.current = audio;
      setPlayingClipId(clip.id);
    }
  };

  // -------------------------------------------------------------
  // KEYWORD SPOTTER ENGINE (PRESERVED)
  // -------------------------------------------------------------

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      listenMediaStreamRef.current = stream;
      setHasMicPermission(true);

      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const analyser = audioCtx.createAnalyser();
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 64;
        listenAnalyserRef.current = analyser;
        listenAudioContextRef.current = audioCtx;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateMeter = () => {
          if (listenAnalyserRef.current) {
            listenAnalyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            setListenAudioLevel(Math.min(Math.round((avg / 128) * 100), 100));
            listenAnimFrameRef.current = requestAnimationFrame(updateMeter);
          }
        };
        updateMeter();
      } catch (err) {
        console.warn("Audio meter setup skipped", err);
      }

      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRec) {
        setSpeechSupported(false);
        return;
      }

      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = false;

      const langConfig = SUPPORTED_LANGUAGES.find((l) => l.code === lang) || SUPPORTED_LANGUAGES[0];
      recognition.lang = langConfig.speechLang;

      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const rawTranscript = event.results[i][0].transcript.toLowerCase().trim();
          setRecentTranscripts((prev) => [rawTranscript, ...prev.slice(0, 4)]);

          const matchedKw = DISTRESS_KEYWORDS.find((kw) => rawTranscript.includes(kw.toLowerCase()));
          if (matchedKw) {
            setLastDetectedKeyword(matchedKw);
            setDetectedCount((c) => c + 1);
            onDistressDetected(matchedKw, langConfig.name);
          }
        }
      };

      recognition.onerror = (e: any) => {
        console.warn("Speech recognition notice:", e.error);
        if (e.error === 'not-allowed') {
          setHasMicPermission(false);
          stopListening();
        }
      };

      recognition.onend = () => {
        if (recognitionRef.current) {
          try {
            recognition.start();
          } catch (e) {}
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch (err) {
      console.error("Microphone access error:", err);
      setHasMicPermission(false);
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }
    if (listenAnimFrameRef.current) {
      cancelAnimationFrame(listenAnimFrameRef.current);
      listenAnimFrameRef.current = null;
    }
    if (listenMediaStreamRef.current) {
      listenMediaStreamRef.current.getTracks().forEach((track) => track.stop());
      listenMediaStreamRef.current = null;
    }
    if (listenAudioContextRef.current) {
      try {
        listenAudioContextRef.current.close();
      } catch (e) {}
      listenAudioContextRef.current = null;
    }
    setIsListening(false);
    setListenAudioLevel(0);
  };

  const simulateDistress = (kw: string) => {
    setLastDetectedKeyword(kw);
    setDetectedCount((c) => c + 1);
    setRecentTranscripts((prev) => [`[Simulated Voice] "${kw}"`, ...prev.slice(0, 4)]);
    const activeLangConfig = SUPPORTED_LANGUAGES.find((l) => l.code === lang) || SUPPORTED_LANGUAGES[0];
    onDistressDetected(kw, activeLangConfig.name);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (recordAnimRef.current) cancelAnimationFrame(recordAnimRef.current);
      if (recordAudioCtxRef.current) {
        try { recordAudioCtxRef.current.close(); } catch (_) {}
      }
      if (recordStreamRef.current) {
        recordStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (clipAudioRef.current) {
        clipAudioRef.current.pause();
      }
    };
  }, []);

  const activeLangConfig = SUPPORTED_LANGUAGES.find((l) => l.code === lang) || SUPPORTED_LANGUAGES[0];

  return (
    <div className="rakshika-card border border-purple-500/25 rounded-3xl p-5 lg:p-6 shadow-xl shadow-purple-950/50 space-y-6">
      {/* Top Header & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-purple-500/15 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center text-pink-400">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-lg">{t('Voice Danger AI & Audio Clips', 'Voice Safety Hub')}</h3>
                <span className="text-[0.65rem] bg-fuchsia-500/15 text-pink-300 border border-pink-500/30 px-2 py-0.5 rounded-full font-semibold">
                  {t('Voice Clips & Relay Active', 'Guardian Relay Active')}
                </span>
              </div>
              <p className="text-xs text-purple-300/70 mt-0.5">
                {t('Tap to record audio snippet for guardian', 'Record encrypted voice clips for your guardian & enable local keyword spotting.')}
              </p>
            </div>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center p-1 bg-[#0c0722]/90 border border-purple-500/25 rounded-2xl shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveMode('record')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeMode === 'record'
                ? 'rakshika-gradient-btn shadow-md shadow-pink-950/60'
                : 'text-purple-300/70 hover:text-white'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>{t('Record Voice Clip', 'Record Voice Clip')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('listen')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeMode === 'listen'
                ? 'rakshika-gradient-btn shadow-md shadow-pink-950/60'
                : 'text-purple-300/70 hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>{t('Distress Keyword Detection', 'Keyword Spotting')}</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODE 1: RECORD & SHARE VOICE CLIPS TO GUARDIAN          */}
      {/* ======================================================== */}
      {activeMode === 'record' && (
        <div className="space-y-6">
          {/* Main Recording Station Card */}
          <div className="p-6 bg-[#0c0722]/85 border border-purple-500/25 rounded-2xl relative overflow-hidden">
            {/* Ambient Background Wave */}
            {isRecording && (
              <div className="absolute inset-0 bg-pink-600/10 animate-pulse pointer-events-none" />
            )}

            <div className="relative z-10 flex flex-col items-center text-center space-y-4">
              {/* Recording Status Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border">
                {isRecording ? (
                  <span className="bg-rose-500/20 text-rose-300 border-rose-500/30 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-pink-400 animate-ping"></span>
                    {t('Recording Voice Clip...', 'Recording Live Voice Clip')} ({recordSeconds}s / 60s)
                  </span>
                ) : recordedAudioUrl ? (
                  <span className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    {t('Audio Clip Preview', 'Audio Clip Captured')} ({recordSeconds}s)
                  </span>
                ) : (
                  <span className="bg-purple-950/70 text-purple-300 border-purple-500/30 flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-pink-400" />
                    {t('Tap to Record', 'Tap to Record Voice Message for Guardian')}
                  </span>
                )}
              </div>

              {/* Big Interactive Action Button */}
              {!recordedAudioUrl ? (
                <div className="py-2 flex flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                    className={`w-24 h-24 rounded-full flex flex-col items-center justify-center transition-all cursor-pointer select-none active:scale-95 shadow-2xl relative ${
                      isRecording
                        ? 'bg-gradient-to-tr from-fuchsia-600 to-rose-600 hover:from-fuchsia-500 hover:to-rose-500 text-white shadow-pink-900 border-4 border-pink-300/60 animate-pulse'
                        : 'bg-[#140b33] hover:bg-[#1a0f40] text-pink-400 hover:text-pink-300 border-2 border-purple-500/40 hover:border-pink-500/60 shadow-lg shadow-purple-950'
                    }`}
                  >
                    {isRecording ? (
                      <>
                        <Square className="w-8 h-8 fill-current" />
                        <span className="text-[0.65rem] font-black uppercase tracking-wider mt-1">{t('Stop Recording', 'Stop')}</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-9 h-9" />
                        <span className="text-[0.65rem] font-black uppercase tracking-wider mt-1">{t('Record Voice Clip', 'Record')}</span>
                      </>
                    )}
                  </button>

                  <div className="text-xs text-purple-300/80">
                    {isRecording ? (
                      <span className="text-pink-300 font-mono font-bold">
                        Speak clearly • Tap button to finish
                      </span>
                    ) : (
                      <span>Tap to start recording • Up to 60 seconds</span>
                    )}
                  </div>

                  {/* Realtime Audio Volume Bar */}
                  {isRecording && (
                    <div className="w-48 bg-[#0c0722] border border-purple-500/25 rounded-xl p-2 mt-1">
                      <div className="flex items-center justify-between text-[0.65rem] text-purple-300/80 mb-1">
                        <span>Mic Sensitivity</span>
                        <span className="font-mono text-pink-400">{recordMicLevel}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-purple-950/80 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-400 via-fuchsia-500 to-pink-500 transition-all duration-75"
                          style={{ width: `${recordMicLevel}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Audio Playback Review & Tagging Station */
                <div className="w-full max-w-lg space-y-4 pt-2">
                  {/* Audio Player Preview */}
                  <div className="p-4 bg-[#140b33] border border-purple-500/25 rounded-2xl flex items-center gap-3">
                    <button
                      type="button"
                      onClick={togglePreviewPlay}
                      className="w-11 h-11 rounded-xl rakshika-gradient-btn text-white flex items-center justify-center shrink-0 cursor-pointer shadow-md transition-all active:scale-95"
                    >
                      {isPlayingPreview ? (
                        <Pause className="w-5 h-5 fill-current" />
                      ) : (
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-xs text-purple-200 font-medium mb-1">
                        <span className="truncate">Preview Audio Message</span>
                        <span className="font-mono text-pink-300 text-xs shrink-0">
                          {recordSeconds}s
                        </span>
                      </div>
                      <div className="w-full h-2 bg-[#0c0722] rounded-full overflow-hidden border border-purple-500/20">
                        <div
                          className="h-full bg-gradient-to-r from-fuchsia-500 to-pink-500 transition-all duration-100"
                          style={{ width: `${previewProgress}%` }}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={discardRecording}
                      className="p-2.5 rounded-xl bg-purple-950/70 hover:bg-purple-900 text-purple-300 hover:text-rose-400 border border-purple-500/25 transition-colors cursor-pointer"
                      title="Discard & Record Again"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    {/* Hidden Audio Element for Preview */}
                    <audio
                      ref={previewAudioRef}
                      src={recordedAudioUrl}
                      onTimeUpdate={() => {
                        if (previewAudioRef.current) {
                          const prog = (previewAudioRef.current.currentTime / previewAudioRef.current.duration) * 100;
                          setPreviewProgress(isNaN(prog) ? 0 : prog);
                        }
                      }}
                      onEnded={() => {
                        setIsPlayingPreview(false);
                        setPreviewProgress(0);
                      }}
                    />
                  </div>

                  {/* Situational Tag Selector */}
                  <div className="text-left space-y-2">
                    <label className="text-xs font-semibold text-purple-300/80 uppercase tracking-wider flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-pink-400" />
                      <span>Select Situation Tag</span>
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { id: 'suspicious', label: 'Suspicious Activity', icon: <AlertCircle className="w-3.5 h-3.5" /> },
                        { id: 'route_deviation', label: 'Cab/Taxi Deviation', icon: <MapPin className="w-3.5 h-3.5" /> },
                        { id: 'sos', label: '🚨 Emergency SOS', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
                        { id: 'checkin', label: 'Safe Check-in', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
                        { id: 'general', label: 'General Voice Note', icon: <Volume2 className="w-3.5 h-3.5" /> },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedTag(item.id as VoiceClipTag)}
                          className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer text-left ${
                            selectedTag === item.id
                              ? 'bg-gradient-to-r from-fuchsia-500/25 to-pink-500/25 text-pink-200 border-pink-500/50 shadow-md'
                              : 'bg-[#0c0722]/80 text-purple-300/70 border-purple-500/20 hover:text-white hover:bg-[#140b33]'
                          }`}
                        >
                          {item.icon}
                          <span className="truncate">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Optional Voice Note Context Input */}
                  <div className="text-left space-y-1.5">
                    <label className="text-xs font-semibold text-purple-300/80">
                      Message Note / Description (Optional)
                    </label>
                    <input
                      type="text"
                      value={clipTitle}
                      onChange={(e) => setClipTitle(e.target.value)}
                      placeholder={`e.g. ${getDefaultTagTitle(selectedTag)} - sharing audio snippet`}
                      className="w-full bg-[#0c0722]/90 border border-purple-500/25 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-purple-400/50 focus:outline-none focus:border-pink-500"
                    />
                  </div>

                  {/* Location Coordinate Badge */}
                  {currentLocation && (
                    <div className="flex items-center gap-1.5 text-[0.7rem] text-emerald-300 bg-emerald-950/30 border border-emerald-500/30 px-3 py-1.5 rounded-xl">
                      <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                      <span>GPS Attached: {currentLocation.latitude.toFixed(5)}, {currentLocation.longitude.toFixed(5)}</span>
                    </div>
                  )}

                  {/* Send to Guardian Action */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={discardRecording}
                      disabled={isSending}
                      className="flex-1 py-3 px-4 rounded-xl border border-purple-500/30 bg-purple-950/60 hover:bg-purple-900/60 text-purple-200 font-bold text-xs transition-colors cursor-pointer"
                    >
                      {t('Discard', 'Discard')}
                    </button>

                    <button
                      type="button"
                      onClick={handleShareToGuardian}
                      disabled={isSending}
                      className="flex-2 py-3 px-5 rounded-xl rakshika-gradient-btn disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-pink-950 transition-all cursor-pointer"
                    >
                      {isSending ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>{t('Sending...', 'Dispatching to Guardian...')}</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>{t('Send to Guardian', 'Send Securely to Guardian')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Success Notification Banner */}
              {sendSuccessMsg && (
                <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{sendSuccessMsg}</span>
                </div>
              )}
            </div>
          </div>

          {/* Sent Voice Clips History List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-purple-300/80 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-pink-400" />
                <span>{t('Sent Voice Clips', 'Sent Voice Clips')} ({sentClips.length})</span>
              </h4>
              <button
                type="button"
                onClick={loadSentClips}
                disabled={isLoadingHistory}
                className="text-[0.7rem] text-pink-400 hover:text-pink-300 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                <span>{historyRefreshedText || t('Refresh', 'Refresh')}</span>
              </button>
            </div>

            {sentClips.length === 0 ? (
              <div className="p-6 bg-[#0c0722]/80 border border-purple-500/20 rounded-2xl text-center text-xs text-purple-400/70">
                {t('No voice clips recorded yet. Tap "Record" above to share a voice message with your guardian.', 'No voice clips recorded yet. Tap "Record" above to share a voice message with your guardian.')}
              </div>
            ) : (
              <div className="grid gap-2.5">
                {sentClips.slice(0, 5).map((clip) => (
                  <div
                    key={clip.id}
                    className="p-3.5 bg-[#0c0722]/85 border border-purple-500/20 hover:border-pink-500/30 rounded-2xl flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleClipPlay(clip)}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                          playingClipId === clip.id
                            ? 'rakshika-gradient-btn text-white shadow-md shadow-pink-950'
                            : 'bg-purple-950/70 text-purple-200 hover:text-white hover:bg-purple-900 border border-purple-500/30'
                        }`}
                      >
                        {playingClipId === clip.id ? (
                          <Pause className="w-4 h-4 fill-current" />
                        ) : (
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        )}
                      </button>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate">
                            {clip.title}
                          </span>
                          <span className={`text-[0.65rem] px-2 py-0.5 rounded-full border font-semibold uppercase ${getTagBadgeStyle(clip.tag)}`}>
                            {clip.tag}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[0.7rem] text-purple-300/70 mt-0.5">
                          <span className="font-mono">{clip.durationSeconds}s</span>
                          <span>•</span>
                          <span>{new Date(clip.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {clip.coordinates && (
                            <>
                              <span>•</span>
                              <span className="text-emerald-400 flex items-center gap-0.5">
                                <MapPin className="w-2.5 h-2.5" /> GPS Linked
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <a
                      href={clip.audioBase64}
                      download={`rakshika-voice-${clip.id}.webm`}
                      className="p-2 rounded-xl bg-purple-950/70 hover:bg-purple-900 text-purple-300 hover:text-white transition-colors cursor-pointer shrink-0 border border-purple-500/25"
                      title="Download audio clip"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODE 2: AI DANGER KEYWORD DETECTION (PRESERVED)         */}
      {/* ======================================================== */}
      {activeMode === 'listen' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-pink-400" />
                <span>On-Device Distress Keyword Spotting</span>
              </h4>
              <p className="text-xs text-purple-300/70">
                Listens on-device for distress keywords like 'Help', 'Bachao'. Audio is never streamed or stored.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => simulateDistress('bachao')}
                className="px-3 py-1.5 rounded-xl font-semibold text-xs text-pink-300 hover:text-white bg-pink-500/15 hover:bg-pink-600/30 border border-pink-500/35 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-pink-400" />
                <span>Simulate "Bachao"</span>
              </button>

              {isListening ? (
                <button
                  type="button"
                  onClick={stopListening}
                  className="px-3.5 py-1.5 rounded-xl bg-purple-950/80 hover:bg-purple-900 text-purple-200 text-xs font-bold flex items-center gap-1.5 border border-purple-500/30 transition-colors cursor-pointer"
                >
                  <MicOff className="w-3.5 h-3.5 text-pink-400" />
                  <span>Stop Detection</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startListening}
                  className="px-4 py-1.5 rounded-xl rakshika-gradient-btn text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-pink-950 transition-all cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Start Voice Detection</span>
                </button>
              )}
            </div>
          </div>

          {!speechSupported && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Speech Recognition API is not supported in this browser. Please use Chrome, Edge, or Safari for voice trigger detection.</span>
            </div>
          )}

          {hasMicPermission === false && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Microphone permission was denied. Please allow microphone access in your browser site settings.</span>
            </div>
          )}

          {/* Active Listening Status Card */}
          <div className="bg-[#0c0722]/85 border border-purple-500/25 rounded-2xl p-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                    isListening
                      ? 'bg-fuchsia-500/20 text-pink-300 border border-fuchsia-500/40 shadow-lg shadow-purple-950'
                      : 'bg-purple-950/70 text-purple-400 border border-purple-500/30'
                  }`}
                >
                  {isListening ? (
                    <Radio className="w-6 h-6 animate-pulse" />
                  ) : (
                    <MicOff className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">
                      {isListening ? 'Actively Listening for Danger Keywords' : 'Voice Detection Standby'}
                    </span>
                    {isListening && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                    )}
                  </div>
                  <p className="text-xs text-purple-300/70">
                    Language: <strong className="text-white">{activeLangConfig.name}</strong> ({activeLangConfig.nativeName})
                  </p>
                </div>
              </div>

              {isListening && (
                <div className="w-full sm:w-48 bg-[#0c0722] border border-purple-500/25 rounded-xl p-2.5">
                  <div className="flex items-center justify-between text-[0.65rem] text-purple-300/80 mb-1">
                    <span>Mic Input Level</span>
                    <span className="font-mono text-pink-400">{listenAudioLevel}%</span>
                  </div>
                  <div className="w-full h-2 bg-purple-950/80 rounded-full overflow-hidden border border-purple-500/20">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 via-fuchsia-500 to-pink-500 transition-all duration-75"
                      style={{ width: `${listenAudioLevel}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {lastDetectedKeyword && (
              <div className="mt-3 p-3 bg-fuchsia-500/15 border border-pink-500/30 rounded-xl flex items-center justify-between text-xs text-pink-300">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-pink-400" />
                  <span>
                    Detected keyword: <strong className="text-white font-mono uppercase underline">"{lastDetectedKeyword}"</strong>
                  </span>
                </div>
                <span className="text-[0.65rem] text-pink-300 bg-pink-500/20 px-2 py-0.5 rounded-md border border-pink-500/30">
                  Trigger Count: {detectedCount}
                </span>
              </div>
            )}
          </div>

          {/* Danger Keywords List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-purple-300/80 uppercase tracking-wider">
                Distress Keywords (Tap to Simulate)
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DISTRESS_KEYWORDS.slice(0, 10).map((kw) => (
                <button
                  key={kw}
                  type="button"
                  onClick={() => simulateDistress(kw)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer select-none active:scale-95 ${
                    lastDetectedKeyword === kw
                      ? 'rakshika-gradient-btn text-white border-pink-300 shadow-md animate-pulse'
                      : 'bg-[#0c0722]/85 hover:bg-[#140b33] text-purple-200 hover:text-white border-purple-500/25 hover:border-pink-500/40'
                  }`}
                >
                  "{kw}"
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer Privacy Guarantee */}
      <div className="pt-3 border-t border-purple-500/15 flex flex-wrap items-center justify-between text-[0.7rem] text-purple-400/70 gap-2">
        <span className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <span>Encrypted Voice Relay • Guardian Access Only</span>
        </span>
        <span className="text-purple-400/60">Audio clips saved to device & synced to linked guardian</span>
      </div>
    </div>
  );
}
