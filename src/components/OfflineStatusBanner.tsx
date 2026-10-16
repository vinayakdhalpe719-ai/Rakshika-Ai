import React, { useState, useEffect } from 'react';
import { 
  Wifi, WifiOff, Database, RefreshCw, CheckCircle2, 
  AlertCircle, ShieldCheck, HardDrive, ArrowUpRight, Clock,
  Smartphone, Signal, Radio, Trash2, AlertTriangle, RotateCcw,
  Volume2
} from 'lucide-react';
import { 
  getOfflineCacheStats, 
  flushOfflineSyncQueue, 
  CacheStats,
  clearAllOfflineCache 
} from '../lib/offlineStorage';
import { translate, LanguageCode } from '../translations';

interface OfflineStatusBannerProps {
  isSimulatedOffline: boolean;
  onToggleSimulatedOffline: () => void;
  userPhone: string;
  onRefreshData?: () => Promise<void> | void;
  onClearLocalState?: () => void;
  lang?: string;
}

export default function OfflineStatusBanner({
  isSimulatedOffline,
  onToggleSimulatedOffline,
  userPhone,
  onRefreshData,
  onClearLocalState,
  lang = 'en',
}: OfflineStatusBannerProps) {
  const t = (k: string, d?: string) => translate(k, (lang as LanguageCode) || 'en', d);
  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<boolean>(false);

  // In-UI reset confirmation state (avoids window.confirm in sandboxed iframes)
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);

  const isEffectiveOffline = !isBrowserOnline || isSimulatedOffline;

  // Track browser online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsBrowserOnline(true);
      // Auto-flush queue when cellular/network restores
      handleSyncQueue();
    };
    const handleOffline = () => {
      setIsBrowserOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Poll cache stats
  const refreshStats = async () => {
    try {
      const s = await getOfflineCacheStats(userPhone);
      setStats(s);
    } catch (e) {
      console.warn('Failed to load offline cache stats', e);
    }
  };

  useEffect(() => {
    refreshStats();
    const interval = setInterval(refreshStats, 4000);
    return () => clearInterval(interval);
  }, [userPhone]);

  const handleSyncQueue = async () => {
    if (isEffectiveOffline) return;
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await flushOfflineSyncQueue();
      if (res.syncedCount > 0) {
        setSyncFeedback(`Successfully synchronized ${res.syncedCount} queued action(s) to server.`);
        if (onRefreshData) await onRefreshData();
      } else {
        setSyncFeedback('All offline safety logs are in sync with cloud.');
      }
      await refreshStats();
    } catch {
      setSyncFeedback('Synchronization failed. Will retry automatically.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncFeedback(null), 4000);
    }
  };

  // Safe In-UI Reset Cache handler that guarantees complete purge and avoids window.confirm
  const handleExecuteResetCache = async () => {
    setIsResetting(true);
    setResetFeedback(null);
    setShowResetConfirm(false);

    try {
      const result = await clearAllOfflineCache();
      
      // Immediately reflect zero counts in local state
      setStats({
        incidentsCount: 0,
        eventsCount: 0,
        hasProfile: false,
        hasLocation: false,
        pendingQueueCount: 0,
        voiceClipsCount: 0,
        lastCachedAt: null,
      });

      if (onClearLocalState) {
        onClearLocalState();
      }

      setResetFeedback(`Local IndexedDB Safety Vault cache wiped successfully (${result.clearedStores.length} stores reset to 0 items).`);
    } catch (err: any) {
      console.error('Failed to reset IndexedDB cache:', err);
      setResetFeedback('Failed to reset cache. Please retry.');
    } finally {
      setIsResetting(false);
      setTimeout(() => setResetFeedback(null), 6000);
    }
  };

  const handleManualReSync = async () => {
    if (isEffectiveOffline) return;
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      if (onRefreshData) {
        await onRefreshData();
      }
      await refreshStats();
      setSyncFeedback('Fresh records synchronized from cloud and re-cached into IndexedDB.');
    } catch {
      setSyncFeedback('Cloud re-sync failed.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncFeedback(null), 4000);
    }
  };

  return (
    <div className="w-full transition-all duration-300">
      {/* Primary Connectivity Alert Banner */}
      <div 
        className={`px-3.5 py-2.5 sm:px-4 sm:py-2.5 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs shadow-xl backdrop-blur-md transition-colors ${
          isEffectiveOffline
            ? 'bg-amber-950/75 border-amber-500/40 text-amber-200 shadow-amber-950/30'
            : 'bg-[#0d0726]/85 border-purple-500/25 text-purple-200 shadow-purple-950/40'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`p-2 rounded-xl shrink-0 ${
            isEffectiveOffline 
              ? 'bg-amber-500/20 text-amber-400 animate-pulse border border-amber-500/30' 
              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          }`}>
            {isEffectiveOffline ? (
              <WifiOff className="w-4 h-4" />
            ) : (
              <Signal className="w-4 h-4" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold tracking-tight text-white flex items-center gap-1.5">
                {isEffectiveOffline ? (
                  <>
                    <span>Cellular Signal Lost</span>
                    <span className="px-1.5 py-0.5 rounded text-[0.65rem] bg-amber-500 text-black font-extrabold uppercase tracking-wide">
                      IndexedDB Offline Shield
                    </span>
                  </>
                ) : (
                  <>
                    <span>Cellular Active</span>
                    <span className="px-1.5 py-0.5 rounded text-[0.65rem] bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
                      Local-First Synced
                    </span>
                  </>
                )}
              </span>

              {stats && stats.pendingQueueCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[0.65rem] bg-gradient-to-r from-rose-600 to-pink-600 text-white font-bold animate-bounce shadow-md">
                  {stats.pendingQueueCount} queued
                </span>
              )}
            </div>

            <p className="text-[0.72rem] text-purple-300/70 truncate mt-0.5">
              {isEffectiveOffline ? (
                <>
                  <span className="text-amber-300 font-medium">100% offline access:</span> Incident logs, medical profile & safety contacts available via local IndexedDB.
                </>
              ) : (
                <>
                  All safety incidents & medical data are cached locally in IndexedDB for instant zero-latency protection.
                </>
              )}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="px-2.5 py-1.5 bg-purple-950/60 hover:bg-purple-900/80 text-purple-200 rounded-xl text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors border border-purple-500/30 shadow-sm"
            title="View IndexedDB storage details"
          >
            <Database className="w-3.5 h-3.5 text-pink-400" />
            <span>Cache Stats</span>
            {stats && (
              <span className="bg-purple-900/80 border border-purple-500/30 px-1.5 py-0.2 rounded text-[0.65rem] font-mono text-purple-300">
                {stats.incidentsCount + stats.eventsCount}
              </span>
            )}
          </button>

          {/* Offline Simulator Switch */}
          <button
            type="button"
            onClick={onToggleSimulatedOffline}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all border ${
              isSimulatedOffline
                ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-400 shadow-lg shadow-amber-950/50'
                : 'bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border-purple-500/30'
            }`}
            title="Simulate loss of cellular and Wi-Fi connectivity to test offline IndexedDB fallback"
          >
            <Radio className={`w-3.5 h-3.5 ${isSimulatedOffline ? 'animate-pulse text-white' : 'text-purple-400'}`} />
            <span>{isSimulatedOffline ? t('Restore Signal', 'Restore Signal') : t('Simulate Dead Zone', 'Simulate Dead Zone')}</span>
          </button>

          {!isEffectiveOffline && stats && stats.pendingQueueCount > 0 && (
            <button
              type="button"
              onClick={handleSyncQueue}
              disabled={isSyncing}
              className="px-2.5 py-1.5 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-md disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{t('Sync Queue', 'Sync Queue')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Sync feedback banner */}
      {syncFeedback && (
        <div className="mt-2 px-3.5 py-2 bg-emerald-950/70 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2 shadow-lg animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{syncFeedback}</span>
        </div>
      )}

      {/* Reset Cache feedback banner */}
      {resetFeedback && (
        <div className="mt-2 px-3.5 py-2 bg-pink-950/70 border border-pink-500/40 rounded-xl text-pink-200 text-xs flex items-center justify-between gap-3 shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-pink-400 shrink-0" />
            <span>{resetFeedback}</span>
          </div>
          {!isEffectiveOffline && onRefreshData && (
            <button
              type="button"
              onClick={handleManualReSync}
              className="px-2.5 py-1 bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 border border-pink-500/40 rounded-lg text-[0.68rem] font-bold cursor-pointer transition-colors shadow-sm"
            >
              Re-sync from Cloud
            </button>
          )}
        </div>
      )}

      {/* Expanded Storage & Diagnostic Details Drawer */}
      {showDetails && (
        <div className="mt-2.5 p-4 bg-[#0d0726]/95 border border-purple-500/30 rounded-2xl shadow-2xl shadow-purple-950/60 text-purple-200 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between pb-3 border-b border-purple-500/20 mb-3.5 gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-gradient-to-r from-pink-500/20 to-purple-500/20 border border-pink-500/30 rounded-lg text-pink-400">
                <HardDrive className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                  IndexedDB Local-First Safety Vault
                </h4>
                <span className="text-[0.65rem] text-purple-300/70 block">
                  Encrypted on-device persistent database (Zero cellular data dependency)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Reset Cache with Safe In-UI Confirmation */}
              {showResetConfirm ? (
                <div className="flex items-center gap-2 bg-rose-950/85 border border-rose-500/50 px-2.5 py-1.5 rounded-xl shadow-lg animate-in fade-in">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span className="text-[0.7rem] text-rose-200 font-semibold">Wipe local cache?</span>
                  <button
                    type="button"
                    onClick={handleExecuteResetCache}
                    disabled={isResetting}
                    className="px-2.5 py-1 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white rounded-lg text-[0.7rem] font-bold cursor-pointer transition-all shadow-md flex items-center gap-1 disabled:opacity-50"
                  >
                    {isResetting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    <span>{isResetting ? 'Resetting...' : 'Yes, Reset'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(false)}
                    className="px-2 py-1 bg-purple-950/70 hover:bg-purple-900 text-purple-300 rounded-lg text-[0.7rem] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all shadow-sm hover:border-rose-400/50"
                  title="Wipe IndexedDB local cache storage"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Reset Cache</span>
                </button>
              )}

              {/* Re-sync Button */}
              {!isEffectiveOffline && onRefreshData && (
                <button
                  type="button"
                  onClick={handleManualReSync}
                  disabled={isSyncing}
                  className="px-2.5 py-1.5 bg-purple-950/60 hover:bg-purple-900/80 text-purple-200 border border-purple-500/30 rounded-xl text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                  title="Re-download and cache latest records from cloud"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-pink-400 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>Sync Cloud</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowDetails(false)}
                className="text-purple-400 hover:text-white text-xs cursor-pointer px-2 py-1 rounded-lg hover:bg-purple-900/40"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center">
            <div className="p-2.5 rounded-xl bg-[#080415]/80 border border-purple-500/20">
              <div className="text-[0.65rem] text-purple-300/70 uppercase font-medium">Cached Incidents</div>
              <div className="text-base font-bold text-white font-mono mt-0.5">
                {stats?.incidentsCount ?? 0}
              </div>
              <div className="text-[0.6rem] text-emerald-400 flex items-center justify-center gap-1 mt-0.5">
                <CheckCircle2 className="w-2.5 h-2.5" /> Ready offline
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-[#080415]/80 border border-purple-500/20">
              <div className="text-[0.65rem] text-purple-300/70 uppercase font-medium">Audit Events</div>
              <div className="text-base font-bold text-white font-mono mt-0.5">
                {stats?.eventsCount ?? 0}
              </div>
              <div className="text-[0.6rem] text-emerald-400 flex items-center justify-center gap-1 mt-0.5">
                <CheckCircle2 className="w-2.5 h-2.5" /> Immutable
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-[#080415]/80 border border-purple-500/20">
              <div className="text-[0.65rem] text-purple-300/70 uppercase font-medium">Medical Profile</div>
              <div className="text-base font-bold text-white font-mono mt-0.5">
                {stats?.hasProfile ? 'Saved' : 'Empty'}
              </div>
              <div className="text-[0.6rem] text-emerald-400 flex items-center justify-center gap-1 mt-0.5">
                <ShieldCheck className="w-2.5 h-2.5" /> On-device
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-[#080415]/80 border border-purple-500/20">
              <div className="text-[0.65rem] text-purple-300/70 uppercase font-medium">Voice Clips</div>
              <div className="text-base font-bold text-white font-mono mt-0.5">
                {stats?.voiceClipsCount ?? 0}
              </div>
              <div className="text-[0.6rem] text-pink-400 flex items-center justify-center gap-1 mt-0.5">
                <Volume2 className="w-2.5 h-2.5" /> Audio Vault
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-[#080415]/80 border border-purple-500/20">
              <div className="text-[0.65rem] text-purple-300/70 uppercase font-medium">Offline Queue</div>
              <div className={`text-base font-bold font-mono mt-0.5 ${
                (stats?.pendingQueueCount || 0) > 0 ? 'text-amber-400' : 'text-white'
              }`}>
                {stats?.pendingQueueCount ?? 0}
              </div>
              <div className="text-[0.6rem] text-purple-300/60 flex items-center justify-center gap-1 mt-0.5">
                <Clock className="w-2.5 h-2.5" /> Auto-syncs
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-purple-500/20 flex flex-wrap items-center justify-between text-[0.7rem] text-purple-300/70 gap-2">
            <div>
              <span>Last Cached: </span>
              <span className="text-white font-mono">
                {stats?.lastCachedAt ? new Date(stats.lastCachedAt).toLocaleTimeString() : 'Active session'}
              </span>
            </div>
            <div className="text-purple-400/80">
              Database: <span className="font-mono text-purple-200">rakshika_safety_offline_db</span> (IndexedDB v2 Local-First Storage)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
