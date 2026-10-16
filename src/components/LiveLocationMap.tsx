import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, Compass, AlertCircle, RefreshCw, ExternalLink, ShieldCheck, ShieldOff } from 'lucide-react';
import { LocationUpdate } from '../types/safety';
import { translate, LanguageCode } from '../translations';

interface LiveLocationMapProps {
  location: LocationUpdate | null;
  isSharing: boolean;
  isOwner?: boolean;
  onToggleSharing?: () => void;
  permissionStatus?: 'prompt' | 'granted' | 'denied' | 'unavailable';
  userName?: string;
  onRequestPermission?: () => void;
  isLoading?: boolean;
  lang?: string;
}

export default function LiveLocationMap({
  location,
  isSharing,
  isOwner = false,
  onToggleSharing,
  permissionStatus = 'granted',
  userName = 'User',
  onRequestPermission,
  isLoading = false,
  lang = 'en',
}: LiveLocationMapProps) {
  const t = (k: string, def?: string) => translate(k, (lang as LanguageCode) || 'en', def);
  const [lastUpdatedText, setLastUpdatedText] = useState('Just now');
  const [isRefreshingGps, setIsRefreshingGps] = useState(false);
  const [gpsRefreshedText, setGpsRefreshedText] = useState<string | null>(null);

  const handleRefreshGps = () => {
    if (!('geolocation' in navigator)) return;
    setIsRefreshingGps(true);
    setGpsRefreshedText(null);
    navigator.geolocation.getCurrentPosition(
      () => {
        setIsRefreshingGps(false);
        setGpsRefreshedText(t('GPS Refreshed!', 'GPS Refreshed!'));
        setTimeout(() => setGpsRefreshedText(null), 2500);
      },
      () => {
        setIsRefreshingGps(false);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  // Format relative time
  useEffect(() => {
    if (!location?.timestamp) return;

    const updateTime = () => {
      const diffSec = Math.floor((Date.now() - location.timestamp) / 1000);
      if (diffSec < 5) setLastUpdatedText(t('Just now', 'Just now'));
      else if (diffSec < 60) setLastUpdatedText(`${diffSec}s ago`);
      else if (diffSec < 3600) setLastUpdatedText(`${Math.floor(diffSec / 60)}m ago`);
      else setLastUpdatedText(`${Math.floor(diffSec / 3600)}h ago`);
    };

    updateTime();
    const interval = setInterval(updateTime, 5000);
    return () => clearInterval(interval);
  }, [location?.timestamp, lang]);

  const googleMapsUrl = location?.latitude && location?.longitude 
    ? `https://www.google.com/maps?q=${location.latitude},${location.longitude}`
    : null;

  // Simple, robust map tile math for OpenStreetMap tile rendering
  const lat = location?.latitude ?? 19.076;
  const lon = location?.longitude ?? 72.8777;
  const zoom = 15;

  const latRad = (lat * Math.PI) / 180;
  const n = Math.pow(2, zoom);
  const xtile = Math.floor(((lon + 180) / 360) * n);
  const ytile = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );

  return (
    <div className="rakshika-card border border-purple-500/25 rounded-2xl p-5 overflow-hidden flex flex-col shadow-lg shadow-purple-950/40">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-pink-400" />
            <h3 className="font-bold text-white text-base">
              {isOwner ? 'Live GPS Location Sharing' : `${userName}'s Live Location`}
            </h3>
          </div>
          <p className="text-xs text-purple-300/70 mt-0.5">
            {isSharing 
              ? 'Consent-based real-time telemetry broadcast'
              : 'Location sharing is paused. Coordinates are not being tracked.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Badge */}
          {isSharing ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>LIVE SHARING ACTIVE</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-950/70 text-purple-300 border border-purple-500/30">
              <ShieldOff className="w-3.5 h-3.5" />
              <span>SHARING PAUSED</span>
            </span>
          )}

          {/* Owner Toggle Button */}
          {isOwner && onToggleSharing && (
            <button
              type="button"
              onClick={onToggleSharing}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer ${
                isSharing
                  ? 'bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-500/30'
                  : 'rakshika-gradient-btn text-white shadow-pink-950'
              }`}
            >
              {isSharing ? 'Stop Sharing Location' : 'Start Sharing Location'}
            </button>
          )}
        </div>
      </div>

      {/* Permission Warning if denied */}
      {permissionStatus === 'denied' && isOwner && (
        <div className="mb-4 p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3 text-xs text-amber-300">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
          <div className="flex-1">
            <strong className="block font-semibold">Location Permission Required</strong>
            <span>GPS access is blocked by your browser settings. Please enable location permission to share live coordinates with your guardians.</span>
            {onRequestPermission && (
              <button
                type="button"
                onClick={onRequestPermission}
                className="mt-2 block px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded-lg text-amber-200 font-medium cursor-pointer"
              >
                Retry Requesting Permission
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Map Box */}
      <div className="relative w-full h-72 sm:h-80 bg-[#0c0722] rounded-xl overflow-hidden border border-purple-500/25 flex items-center justify-center">
        {isSharing && location ? (
          <>
            {/* OpenStreetMap Tile Grid */}
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-75 filter contrast-125 saturate-50">
              {[-1, 0, 1].map((dy) =>
                [-1, 0, 1].map((dx) => (
                  <div key={`${dx}-${dy}`} className="relative w-full h-full bg-[#0c0722] overflow-hidden">
                    <img
                      src={`https://tile.openstreetmap.org/${zoom}/${xtile + dx}/${ytile + dy}.png`}
                      alt="Map Tile"
                      className="w-full h-full object-cover select-none pointer-events-none"
                      onError={(e) => {
                        // Fallback pattern if tile is rate-limited
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                ))
              )}
            </div>

            {/* Dark overlay for contrast with Rakshika AI theme */}
            <div className="absolute inset-0 bg-[#0c0722]/60 backdrop-contrast-125 pointer-events-none"></div>

            {/* Interactive Grid Lines */}
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(#c026d31a_1px,transparent_1px)] [background-size:16px_16px]"></div>

            {/* Radar Sweep & Location Pin */}
            <div className="relative z-10 flex flex-col items-center">
              {/* Radar rings */}
              <div className="relative flex items-center justify-center">
                <span className="absolute w-24 h-24 rounded-full bg-pink-500/25 animate-ping"></span>
                <span className="absolute w-14 h-14 rounded-full bg-fuchsia-500/35 animate-pulse"></span>
                
                {/* Accuracy Radius Indicator */}
                {location.accuracy && (
                  <div className="absolute w-36 h-36 rounded-full border border-pink-400/40 bg-pink-500/10 pointer-events-none flex items-center justify-center">
                    <span className="text-[0.6rem] text-pink-300 font-mono -mt-10">±{Math.round(location.accuracy)}m</span>
                  </div>
                )}

                {/* Pin Head */}
                <div className="relative z-20 w-8 h-8 rounded-full rakshika-gradient-btn border-2 border-white shadow-xl shadow-pink-950 flex items-center justify-center text-white">
                  <Navigation className="w-4 h-4 transform -rotate-45" />
                </div>
              </div>

              {/* Pin Callout Badge */}
              <div className="mt-2 px-3 py-1 bg-[#0c0722]/95 border border-purple-500/30 rounded-lg shadow-xl backdrop-blur-sm text-center">
                <span className="text-xs font-bold text-white block">{userName}</span>
                <span className="text-[0.65rem] font-mono text-emerald-400">
                  {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                </span>
              </div>
            </div>

            {/* Top-Right Accuracy & Speed Overlay */}
            <div className="absolute top-3 right-3 z-20 bg-[#0c0722]/90 backdrop-blur-md border border-purple-500/25 rounded-xl px-3 py-2 text-[0.7rem] space-y-1 shadow-lg">
              <div className="flex items-center justify-between gap-3 text-purple-200">
                <span className="text-purple-400/70">{t('Accuracy:', 'Accuracy:')}</span>
                <span className="font-mono text-emerald-400">
                  {location.accuracy ? `±${Math.round(location.accuracy)} meters` : t('High Precision', 'High Precision')}
                </span>
              </div>
              {location.speed !== null && location.speed !== undefined && (
                <div className="flex items-center justify-between gap-3 text-purple-200">
                  <span className="text-purple-400/70">{t('Speed:', 'Speed:')}</span>
                  <span className="font-mono text-purple-100">
                    {(location.speed * 3.6).toFixed(1)} km/h
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 text-purple-200">
                <span className="text-purple-400/70">{t('Last Synced:', 'Last Synced:')}</span>
                <span className="font-mono text-pink-300">{lastUpdatedText}</span>
              </div>
            </div>

            {/* Bottom Controls */}
            <div className="absolute bottom-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="bg-[#0c0722]/90 backdrop-blur-md border border-purple-500/25 rounded-xl px-3 py-1.5 text-[0.7rem] text-purple-200 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>{t('GPS Fix Established (WGS84)', 'GPS Fix Established (WGS84)')}</span>
                </div>

                {/* Refresh GPS Button */}
                <button
                  type="button"
                  onClick={handleRefreshGps}
                  disabled={isRefreshingGps}
                  className="px-2.5 py-1.5 bg-[#0c0722]/90 hover:bg-[#140b33] text-purple-200 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur-md transition-colors border border-purple-500/30 cursor-pointer"
                  title={t('Refresh GPS', 'Refresh GPS coordinates')}
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-pink-400 ${isRefreshingGps ? 'animate-spin' : ''}`} />
                  <span>{gpsRefreshedText || t('Refresh GPS', 'Refresh GPS')}</span>
                </button>
              </div>

              {googleMapsUrl && (
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rakshika-gradient-btn text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur-md transition-colors"
                >
                  <span>{t('Open in Google Maps', 'Open in Google Maps')}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </>
        ) : (
          /* Empty / Inactive state */
          <div className="text-center p-6 max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-[#140b33] border border-purple-500/30 flex items-center justify-center mx-auto mb-3 text-pink-400">
              <MapPin className="w-7 h-7" />
            </div>
            <h4 className="text-sm font-bold text-white mb-1">
              {isOwner ? t('Location Sharing Inactive', 'Location Sharing Inactive') : t('User Has Not Shared Location', 'User Has Not Shared Location')}
            </h4>
            <p className="text-xs text-purple-300/70 leading-relaxed mb-4">
              {isOwner
                ? t('Your GPS location is private and not being monitored. Click "Start Sharing Location" whenever you are traveling or require guardian tracking.', 'Your GPS location is private and not being monitored. Click "Start Sharing Location" whenever you are traveling or require guardian tracking.')
                : t('Live coordinates are only accessible when explicitly enabled by the user. Coordinates are never simulated or estimated.', 'Live coordinates are only accessible when explicitly enabled by the user. Coordinates are never simulated or estimated.')}
            </p>
            {isOwner && onToggleSharing && (
              <button
                type="button"
                onClick={onToggleSharing}
                className="px-4 py-2 rakshika-gradient-btn text-white rounded-xl text-xs font-bold shadow-lg shadow-pink-950 transition-all cursor-pointer"
              >
                {t('Start Sharing Location', 'Start Sharing Location')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="mt-3 flex items-center justify-between text-[0.7rem] text-purple-400/60">
        <span className="flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>{t('Zero background tracking when sharing is turned off', 'Zero background tracking when sharing is turned off')}</span>
        </span>
        <span>OpenStreetMap • {t('High Precision', 'High Accuracy GPS')}</span>
      </div>
    </div>
  );
}
