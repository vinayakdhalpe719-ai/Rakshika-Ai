import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Volume2, VolumeX, PhoneCall, X, 
  ShieldAlert, Radio, MapPin
} from 'lucide-react';
import { audioAlert } from '../utils/audioAlert';
import { translate } from '../translations';

interface FlashSosModalProps {
  isOpen: boolean;
  onClose: () => void;
  userData: {
    fullName: string;
    bloodGroup?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
  };
  currentLocation?: {
    latitude: number;
    longitude: number;
  } | null;
  t?: (key: string, def?: string) => string;
}

export default function FlashSosModal({
  isOpen,
  onClose,
  userData,
  currentLocation,
  t,
}: FlashSosModalProps) {
  const tr = (k: string, def?: string) => (t ? t(k, def) : translate(k, 'en', def));
  const [isSirenMuted, setIsSirenMuted] = useState(false);
  const [volume, setVolume] = useState<number>(0.35);
  const [strobeSpeed, setStrobeSpeed] = useState<'fast' | 'pulse' | 'steady'>('fast');
  const [strobeState, setStrobeState] = useState(false);

  // When modal opens/closes, handle audio siren lifecycle
  useEffect(() => {
    if (isOpen) {
      setIsSirenMuted(false);
      audioAlert.startSiren(volume);
    } else {
      audioAlert.stopSiren();
    }

    return () => {
      audioAlert.stopSiren();
    };
  }, [isOpen]);

  // Toggle Mute / Unmute handler
  const handleToggleMute = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const muted = audioAlert.toggleMute();
    setIsSirenMuted(muted);
  };

  // Change Volume handler
  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    audioAlert.setVolume(newVol);
  };

  // Handle keyboard Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        audioAlert.stopSiren();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Visual strobe timer effect
  useEffect(() => {
    if (!isOpen || strobeSpeed === 'steady') {
      setStrobeState(false);
      return;
    }

    const intervalMs = strobeSpeed === 'fast' ? 180 : 500;
    const strobeInterval = window.setInterval(() => {
      setStrobeState((prev) => !prev);
    }, intervalMs);

    return () => clearInterval(strobeInterval);
  }, [isOpen, strobeSpeed]);

  if (!isOpen) return null;

  // Background visual color classes based on strobe mode
  const getBackgroundColor = () => {
    if (strobeSpeed === 'steady') return 'bg-rose-700';
    if (strobeSpeed === 'fast') {
      return strobeState ? 'bg-rose-600' : 'bg-red-950';
    }
    // pulse
    return strobeState ? 'bg-rose-600' : 'bg-neutral-950';
  };

  const handleClose = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    audioAlert.stopSiren();
    onClose();
  };

  return (
    <div 
      className={`fixed inset-0 z-50 flex flex-col items-center justify-between p-4 sm:p-6 select-none transition-colors duration-150 overflow-y-auto ${getBackgroundColor()}`}
      onClick={() => {
        // Ensure audio is resumed if browser was waiting for interaction
        audioAlert.resume();
      }}
    >
      {/* Top Header Bar */}
      <div 
        className="w-full max-w-2xl flex items-center justify-between z-10 pt-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 bg-black/50 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/20 text-white shadow-lg">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-ping"></span>
          <span className="text-xs font-black tracking-widest uppercase flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-rose-300" />
            <span>{tr('FLASH SOS BEACON', 'FLASH SOS BEACON')}</span>
          </span>
        </div>

        {/* Exit Button */}
        <button
          type="button"
          onClick={handleClose}
          className="p-2 sm:px-3 sm:py-2 bg-black/60 hover:bg-black/80 active:scale-95 text-white rounded-full border border-white/25 flex items-center gap-1.5 text-xs font-bold transition-all shadow-xl cursor-pointer"
          title={tr('Exit Flash SOS', 'Exit Flash SOS')}
        >
          <X className="w-5 h-5" />
          <span className="hidden sm:inline">{tr('Exit Flash SOS', 'Exit Flash SOS')}</span>
        </button>
      </div>

      {/* Center Emergency Content Card */}
      <div 
        className="w-full max-w-lg my-auto py-4 flex flex-col items-center z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Giant Attention-Grabbing SOS Badge */}
        <div className="text-center mb-4 sm:mb-6">
          <motion.div
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ repeat: Infinity, duration: 1 }}
            className="inline-flex items-center justify-center w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-white text-rose-700 shadow-2xl border-4 border-rose-300 mb-3"
          >
            <ShieldAlert className="w-14 h-14 sm:w-16 sm:h-16" />
          </motion.div>
          <h1 className="text-6xl sm:text-8xl font-black text-white tracking-tighter drop-shadow-md">
            SOS
          </h1>
          <p className="text-sm sm:text-base font-bold text-rose-100 tracking-wider uppercase mt-1 drop-shadow">
            {tr('EMERGENCY DISTRESS BEACON ACTIVE', 'EMERGENCY DISTRESS BEACON ACTIVE')}
          </p>
        </div>

        {/* Siren Controls (Mute / Unmute & Volume) */}
        <div className="w-full bg-black/65 backdrop-blur-md rounded-2xl p-4 border border-white/20 text-white shadow-2xl space-y-3 mb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {isSirenMuted ? (
                <div className="p-2.5 rounded-xl bg-neutral-800 text-neutral-400 border border-neutral-700 shrink-0">
                  <VolumeX className="w-5 h-5" />
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-rose-600/40 text-rose-300 border border-rose-500/50 animate-pulse shrink-0">
                  <Volume2 className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-bold tracking-wide uppercase flex items-center gap-1.5 truncate">
                  <span>{tr('Audio Siren:', 'Audio Siren:')}</span>
                  <span className={isSirenMuted ? 'text-amber-400' : 'text-emerald-400'}>
                    {isSirenMuted ? tr('Muted', 'Muted') : tr('Sounding Piercing Wail', 'Sounding Piercing Wail')}
                  </span>
                </div>
                <div className="text-[0.68rem] text-neutral-300 truncate">
                  {isSirenMuted 
                    ? tr('Audio muted. Visual strobe active.', 'Audio muted. Visual strobe active.') 
                    : tr('Loud alternating emergency siren playing.', 'Loud alternating emergency siren playing.')}
                </div>
              </div>
            </div>

            {/* Main Mute / Unmute Toggle Button */}
            <button
              type="button"
              id="flash-sos-mute-button"
              onClick={handleToggleMute}
              className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md cursor-pointer select-none active:scale-95 border shrink-0 ${
                isSirenMuted
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/60 shadow-emerald-950/50'
                  : 'bg-rose-700/80 hover:bg-rose-600 text-white border-rose-400/50 shadow-rose-950/50'
              }`}
            >
              {isSirenMuted ? (
                <>
                  <Volume2 className="w-4 h-4" />
                  <span>{tr('Unmute Siren', 'Unmute Siren')}</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-4 h-4" />
                  <span>{tr('Mute Siren', 'Mute Siren')}</span>
                </>
              )}
            </button>
          </div>

          {/* Strobe speed & Volume controls */}
          <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-[0.68rem] text-neutral-400 uppercase font-semibold">{tr('Strobe Mode:', 'Strobe Mode:')}</span>
              <div className="inline-flex rounded-lg bg-black/50 p-0.5 border border-white/15">
                <button
                  type="button"
                  onClick={() => setStrobeSpeed('fast')}
                  className={`px-2 py-1 rounded-md text-[0.65rem] font-bold transition-colors cursor-pointer ${
                    strobeSpeed === 'fast' ? 'bg-rose-600 text-white' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {tr('Rapid', 'Rapid')}
                </button>
                <button
                  type="button"
                  onClick={() => setStrobeSpeed('pulse')}
                  className={`px-2 py-1 rounded-md text-[0.65rem] font-bold transition-colors cursor-pointer ${
                    strobeSpeed === 'pulse' ? 'bg-rose-600 text-white' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {tr('Pulse', 'Pulse')}
                </button>
                <button
                  type="button"
                  onClick={() => setStrobeSpeed('steady')}
                  className={`px-2 py-1 rounded-md text-[0.65rem] font-bold transition-colors cursor-pointer ${
                    strobeSpeed === 'steady' ? 'bg-rose-600 text-white' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {tr('Solid', 'Solid')}
                </button>
              </div>
            </div>

            {/* Volume Adjustment */}
            {!isSirenMuted && (
              <div className="flex items-center gap-2">
                <span className="text-[0.68rem] text-neutral-400 uppercase font-semibold">{tr('Volume:', 'Volume:')}</span>
                <input
                  type="range"
                  min="0.05"
                  max="0.5"
                  step="0.05"
                  value={volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-20 accent-rose-500 cursor-pointer"
                  title={tr('Adjust siren volume', 'Adjust siren volume')}
                />
              </div>
            )}
          </div>
        </div>

        {/* User Emergency Profile & Medical Card */}
        <div className="w-full bg-black/55 backdrop-blur-md rounded-2xl p-4 sm:p-5 border border-white/20 text-white shadow-2xl space-y-3">
          <div className="text-center pb-2 border-b border-white/10">
            <h2 className="text-xl sm:text-2xl font-black text-white">{userData.fullName || tr('Citizen in Distress', 'Citizen in Distress')}</h2>
            <div className="flex items-center justify-center gap-3 mt-1 text-xs text-rose-200">
              <span>{tr('Blood Group:', 'Blood Group:')} <strong className="text-white font-bold">{userData.bloodGroup || 'O+'}</strong></span>
              {currentLocation && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-emerald-400" />
                  <strong className="text-emerald-300 font-mono">
                    {currentLocation.latitude.toFixed(4)}, {currentLocation.longitude.toFixed(4)}
                  </strong>
                </span>
              )}
            </div>
          </div>

          {/* Quick Direct Helplines */}
          <div>
            <div className="text-[0.7rem] uppercase tracking-wider text-neutral-400 font-bold mb-2">
              {tr('Direct Emergency Calls (1-Tap):', 'Direct Emergency Calls (1-Tap):')}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <a
                href="tel:112"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-center gap-1.5 py-2.5 px-2 bg-neutral-900/90 hover:bg-neutral-800 border border-white/20 rounded-xl text-xs font-bold text-rose-300 transition-colors shadow"
              >
                <PhoneCall className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                <span>112 {tr('Police', 'Police')}</span>
              </a>

              <a
                href="tel:1091"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-center gap-1.5 py-2.5 px-2 bg-neutral-900/90 hover:bg-neutral-800 border border-white/20 rounded-xl text-xs font-bold text-purple-300 transition-colors shadow"
              >
                <PhoneCall className="w-3.5 h-3.5 shrink-0 text-purple-400" />
                <span>1091 {tr('Women', 'Women')}</span>
              </a>

              {userData.emergencyContactPhone ? (
                <a
                  href={`tel:${userData.emergencyContactPhone.replace(/\s+/g, '')}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-2 bg-neutral-900/90 hover:bg-neutral-800 border border-white/20 rounded-xl text-xs font-bold text-emerald-300 transition-colors shadow truncate"
                >
                  <PhoneCall className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                  <span className="truncate">{userData.emergencyContactName || tr('Contact', 'Contact')}</span>
                </a>
              ) : (
                <a
                  href="tel:108"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-2 bg-neutral-900/90 hover:bg-neutral-800 border border-white/20 rounded-xl text-xs font-bold text-amber-300 transition-colors shadow"
                >
                  <PhoneCall className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                  <span>108 {tr('Medical', 'Medical')}</span>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Exit Action Button */}
        <div className="mt-5 w-full flex justify-center">
          <button
            type="button"
            onClick={handleClose}
            className="w-full max-w-sm py-3 px-6 rounded-2xl bg-black/60 hover:bg-black/80 active:scale-95 text-white font-bold text-sm border border-white/30 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xl"
          >
            <X className="w-4 h-4" />
            <span>{tr('Close & Turn Off Flash SOS', 'Close & Turn Off Flash SOS')}</span>
          </button>
        </div>
      </div>

      {/* Footer hint */}
      <div 
        className="w-full text-center pb-2 text-[0.72rem] text-white/70 font-medium z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <span>{tr('Hold up screen towards crowd or traffic to attract immediate help • Tap ', 'Hold up screen towards crowd or traffic to attract immediate help • Tap ')}</span>
        <button 
          type="button" 
          onClick={handleToggleMute} 
          className="underline font-bold text-white hover:text-rose-200 cursor-pointer ml-1"
        >
          {isSirenMuted ? tr('Unmute Siren', 'Unmute Siren') : tr('Mute Siren', 'Mute Siren')}
        </button>
      </div>
    </div>
  );
}
