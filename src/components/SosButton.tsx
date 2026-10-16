import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, AlertTriangle, X, PhoneCall, Check, Volume2, VolumeX, Radio, Phone, BellRing } from 'lucide-react';
import { EmergencyIncident } from '../types/safety';
import { audioAlert } from '../utils/audioAlert';
import { translate } from '../translations';

interface SosButtonProps {
  isSosActive: boolean;
  onActivateSos: (triggerType: string, notes?: string) => void;
  onResolveSos: () => void;
  userPhone: string;
  userName: string;
  emergencyContactPhone?: string;
  emergencyContactName?: string;
  activeIncident?: EmergencyIncident | null;
  location?: { lat: number; lng: number } | null;
  t?: (key: string, def?: string) => string;
  variant?: 'hero' | 'compact';
  isSirenMuted?: boolean;
  onToggleMuteSiren?: () => void;
}

export default function SosButton({
  isSosActive,
  onActivateSos,
  onResolveSos,
  userPhone,
  userName,
  emergencyContactPhone,
  emergencyContactName,
  activeIncident,
  location,
  t,
  variant = 'hero',
  isSirenMuted: externalIsSirenMuted,
  onToggleMuteSiren,
}: SosButtonProps) {
  const tr = (k: string, def?: string) => (t ? t(k, def) : translate(k, 'en', def));
  const [isPressing, setIsPressing] = useState(false);
  const [pressProgress, setPressProgress] = useState(0);
  const [showCountdownModal, setShowCountdownModal] = useState(false);
  const [showActiveModal, setShowActiveModal] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [internalMuted, setInternalMuted] = useState(false);

  const isSirenMuted = externalIsSirenMuted !== undefined ? externalIsSirenMuted : internalMuted;

  const pressTimerRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const hasTriggeredViaHoldRef = useRef(false);
  const pressStartTimestampRef = useRef<number>(0);

  // Toggle Mute handler
  const handleToggleMute = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (onToggleMuteSiren) {
      onToggleMuteSiren();
    } else {
      const nextMuted = audioAlert.toggleMute();
      setInternalMuted(nextMuted);
    }
  };

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (pressTimerRef.current) clearInterval(pressTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  // Press-and-hold logic (1.2 seconds)
  const handlePressStart = (e?: React.SyntheticEvent) => {
    if (isSosActive) return;
    hasTriggeredViaHoldRef.current = false;
    pressStartTimestampRef.current = Date.now();
    setIsPressing(true);
    setPressProgress(0);

    const duration = 1200; // 1.2s hold

    if (pressTimerRef.current) clearInterval(pressTimerRef.current);

    pressTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - pressStartTimestampRef.current;
      const progress = Math.min((elapsed / duration) * 100, 100);
      setPressProgress(progress);

      if (progress >= 100) {
        if (pressTimerRef.current) {
          clearInterval(pressTimerRef.current);
          pressTimerRef.current = null;
        }
        hasTriggeredViaHoldRef.current = true;
        setIsPressing(false);
        setPressProgress(0);
        // Direct trigger on deliberate 1.2s hold
        onActivateSos('manual_sos', 'Manual hold SOS triggered by user.');
      }
    }, 25);
  };

  const handlePressEnd = () => {
    if (pressTimerRef.current) {
      clearInterval(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    setIsPressing(false);
    setPressProgress(0);
  };

  // Immediate Click / Tap handler
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSosActive) {
      setShowActiveModal(true);
      return;
    }

    // If hold already triggered, skip click
    if (hasTriggeredViaHoldRef.current) {
      hasTriggeredViaHoldRef.current = false;
      return;
    }

    // A simple tap/click opens the 5-second countdown modal
    triggerCountdown();
  };

  const triggerCountdown = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setCountdown(5);
    setShowCountdownModal(true);

    countdownIntervalRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          setShowCountdownModal(false);
          onActivateSos('manual_sos', 'Manual high-urgency SOS triggered by user.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelCountdown = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setShowCountdownModal(false);
  };

  const confirmImmediateSos = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setShowCountdownModal(false);
    onActivateSos('manual_sos', 'Manual high-urgency SOS confirmed immediately.');
  };

  return (
    <>
      {/* ------------------------------------------------------------- */}
      {/* COMPACT VARIANT (Optimized for Header / Topbar)               */}
      {/* ------------------------------------------------------------- */}
      {variant === 'compact' && (
        <button
          type="button"
          id="header-sos-button"
          onClick={handleClick}
          className={`relative group inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer select-none active:scale-95 shadow-md ${
            isSosActive
              ? 'bg-rose-600 text-white border-2 border-rose-300 shadow-rose-600/70 animate-pulse'
              : 'bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 hover:from-fuchsia-500 hover:to-rose-500 text-white border border-pink-400/30 shadow-pink-950/70'
          }`}
          title={isSosActive ? tr('Emergency Active - Click to Manage', 'Emergency Active - Click to Manage') : tr('Trigger Emergency SOS', 'Trigger Emergency SOS')}
        >
          <ShieldAlert className={`w-4 h-4 shrink-0 ${isSosActive ? 'animate-bounce' : ''}`} />
          <span className="tracking-wider uppercase font-black">
            {isSosActive ? tr('SOS ACTIVE', 'SOS ACTIVE') : tr('SOS', 'SOS')}
          </span>
          {isSosActive && (
            <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
          )}
        </button>
      )}

      {/* ------------------------------------------------------------- */}
      {/* HERO VARIANT (Full Interactive Console Centerpiece)          */}
      {/* ------------------------------------------------------------- */}
      {variant === 'hero' && (
        <div className="w-full rakshika-card border border-purple-500/30 rounded-3xl p-6 sm:p-8 flex flex-col items-center shadow-2xl shadow-purple-950/50">
          <div className="w-full flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-pink-400" />
              <h3 className="text-sm sm:text-base font-bold text-white tracking-wide">
                {tr('High-Urgency SOS Console', 'High-Urgency SOS Console')}
              </h3>
            </div>
            {isSosActive ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                <span>{tr('EMERGENCY DISPATCH LIVE', 'EMERGENCY DISPATCH LIVE')}</span>
              </span>
            ) : (
              <span className="text-[0.7rem] text-purple-300/80 uppercase tracking-wider font-semibold">
                {tr('Tap or Hold 1.2s', 'Tap or Hold 1.2s')}
              </span>
            )}
          </div>

          {/* Dial and Rings */}
          <div className="relative flex flex-col items-center justify-center my-3">
            {/* Pulsing rings when active */}
            {isSosActive && (
              <>
                <span className="absolute w-52 h-52 rounded-full bg-rose-600/25 animate-ping pointer-events-none"></span>
                <span className="absolute w-44 h-44 rounded-full bg-rose-600/35 animate-pulse pointer-events-none"></span>
              </>
            )}

            {/* Hold progress ring */}
            <div className="relative w-44 h-44 flex items-center justify-center">
              <svg className="absolute inset-0 w-44 h-44 -rotate-90 pointer-events-none">
                <circle
                  cx="88"
                  cy="88"
                  r="74"
                  stroke="#262626"
                  strokeWidth="8"
                  fill="transparent"
                />
                {isPressing && (
                  <circle
                    cx="88"
                    cy="88"
                    r="74"
                    stroke="#e11d48"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray="464.9"
                    strokeDashoffset={464.9 - (464.9 * pressProgress) / 100}
                    strokeLinecap="round"
                    className="transition-all duration-75"
                  />
                )}
              </svg>

              {/* Main Button */}
              <button
                type="button"
                id="main-sos-button"
                onMouseDown={handlePressStart}
                onMouseUp={handlePressEnd}
                onMouseLeave={handlePressEnd}
                onTouchStart={handlePressStart}
                onTouchEnd={handlePressEnd}
                onClick={handleClick}
                className={`w-36 h-36 rounded-full font-black text-white flex flex-col items-center justify-center shadow-2xl transition-transform select-none cursor-pointer active:scale-95 ${
                  isSosActive
                    ? 'bg-rose-600 border-4 border-rose-300 shadow-rose-600/80 animate-pulse'
                    : 'bg-gradient-to-tr from-rose-700 via-pink-600 to-fuchsia-600 hover:from-rose-600 hover:via-pink-500 hover:to-fuchsia-500 shadow-2xl shadow-pink-950/80 hover:shadow-pink-500/50 border-2 border-pink-400/40'
                }`}
              >
                <ShieldAlert className={`w-12 h-12 mb-1 ${isSosActive ? 'animate-bounce' : ''}`} />
                <span className="text-2xl tracking-wider font-extrabold uppercase">
                  {isSosActive ? tr('ACTIVE', 'ACTIVE') : tr('SOS', 'SOS')}
                </span>
                <span className="text-[0.65rem] font-bold tracking-wider text-rose-100 opacity-90 mt-0.5 uppercase">
                  {isSosActive ? tr('EMERGENCY', 'EMERGENCY') : tr('PRESS & HOLD', 'PRESS & HOLD')}
                </span>
              </button>
            </div>
          </div>

          {/* Status and Action Buttons */}
          <div className="mt-3 text-center w-full max-w-sm">
            {isSosActive ? (
              <div className="space-y-3">
                <p className="text-xs text-rose-300 font-medium leading-relaxed">
                  {tr('Linked guardians notified with live GPS coordinates. Siren sounding on this device.', 'Linked guardians notified with live GPS coordinates. Siren sounding on this device.')}
                </p>
                <div className="flex items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border shadow-sm ${
                      isSirenMuted
                        ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-600/30'
                        : 'bg-neutral-800 hover:bg-neutral-700 text-rose-300 border-neutral-700'
                    }`}
                  >
                    {isSirenMuted ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-rose-400 animate-pulse" />}
                    <span>{isSirenMuted ? tr('Unmute Siren', 'Unmute Siren') : tr('Mute Siren', 'Mute Siren')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onResolveSos}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white flex items-center gap-1.5 shadow-lg shadow-emerald-950 transition-all cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>{tr('I Am Safe (Resolve)', 'I Am Safe (Resolve)')}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-neutral-400 font-medium">
                  <strong>{tr('Tap', 'Tap')}</strong> {tr('to launch 5s safety countdown, or', 'to launch 5s safety countdown, or')} <strong>{tr('hold for 1.2s', 'hold for 1.2s')}</strong> {tr('for immediate dispatch.', 'for immediate dispatch.')}
                </p>
                <p className="text-[0.7rem] text-neutral-500">
                  {tr('Sends live GPS location and alerts all authorized guardians.', 'Sends live GPS location and alerts all authorized guardians.')}
                </p>
              </div>
            )}
          </div>

          {/* Quick Direct Helplines */}
          <div className="mt-6 w-full max-w-lg pt-4 border-t border-purple-500/20">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[0.7rem] uppercase tracking-wider text-pink-300 font-bold flex items-center gap-1.5">
                <Phone className="w-3 h-3 text-pink-400" />
                <span>{tr('Immediate 1-Tap Emergency Dials', 'Immediate 1-Tap Emergency Dials')}</span>
              </span>
              <span className="text-[0.65rem] text-purple-400/60">{tr('Direct phone call', 'Direct phone call')}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <a
                href="tel:112"
                className="flex items-center justify-center gap-1.5 py-2.5 px-2 bg-[#0c0722]/80 hover:bg-[#1a0f3d] border border-purple-500/25 rounded-xl text-xs font-bold text-pink-300 transition-colors cursor-pointer shadow-sm"
              >
                <PhoneCall className="w-3.5 h-3.5 shrink-0 text-pink-400" />
                <span>{tr('112 All-In-One', '112 All-In-One')}</span>
              </a>
              <a
                href="tel:1091"
                className="flex items-center justify-center gap-1.5 py-2.5 px-2 bg-[#0c0722]/80 hover:bg-[#1a0f3d] border border-purple-500/25 rounded-xl text-xs font-bold text-fuchsia-300 transition-colors cursor-pointer shadow-sm"
              >
                <PhoneCall className="w-3.5 h-3.5 shrink-0 text-fuchsia-400" />
                <span>1091 {tr('Women', 'Women')}</span>
              </a>
              {emergencyContactPhone ? (
                <a
                  href={`tel:${emergencyContactPhone.replace(/\s+/g, '')}`}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-2 bg-[#0c0722]/80 hover:bg-[#1a0f3d] border border-purple-500/25 rounded-xl text-xs font-bold text-emerald-300 transition-colors cursor-pointer truncate shadow-sm"
                >
                  <PhoneCall className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                  <span className="truncate">{emergencyContactName || tr('Contact', 'Contact')}</span>
                </a>
              ) : (
                <a
                  href="tel:100"
                  className="flex items-center justify-center gap-1.5 py-2.5 px-2 bg-[#0c0722]/80 hover:bg-[#1a0f3d] border border-purple-500/25 rounded-xl text-xs font-bold text-purple-300 transition-colors cursor-pointer shadow-sm"
                >
                  <PhoneCall className="w-3.5 h-3.5 shrink-0 text-purple-400" />
                  <span>{tr('100 Police', '100 Police')}</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 5-SECOND FALSE ALARM CANCEL MODAL                             */}
      {/* ------------------------------------------------------------- */}
      <AnimatePresence>
        {showCountdownModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-neutral-900 border-2 border-rose-500 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl relative"
            >
              <div className="w-20 h-20 mx-auto rounded-full bg-rose-600/20 border-2 border-rose-500 flex items-center justify-center mb-4">
                <span className="text-4xl font-black text-rose-500 animate-pulse">{countdown}</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{tr('Activating Emergency SOS', 'Activating Emergency SOS')}</h3>
              <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
                {tr('Emergency alert and your live GPS location will be broadcast to all authorized guardians in', 'Emergency alert and your live GPS location will be broadcast to all authorized guardians in')} {countdown}s.
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={cancelCountdown}
                  className="flex-1 py-3 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold text-sm border border-neutral-700 transition-colors cursor-pointer"
                >
                  {tr('Cancel (False Alarm)', 'Cancel (False Alarm)')}
                </button>
                <button
                  type="button"
                  onClick={confirmImmediateSos}
                  className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-lg shadow-rose-900/50 transition-colors cursor-pointer"
                >
                  {tr('Confirm SOS Now', 'Confirm SOS Now')}
                </button>
              </div>

              <div className="mt-4 text-[0.65rem] text-neutral-500">
                {tr('Tap cancel if this was clicked accidentally.', 'Tap cancel if this was clicked accidentally.')}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------- */}
      {/* ACTIVE SOS MANAGEMENT MODAL (When tapped in compact mode)     */}
      {/* ------------------------------------------------------------- */}
      <AnimatePresence>
        {showActiveModal && isSosActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-neutral-900 border-2 border-rose-500 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl relative"
            >
              <button
                type="button"
                onClick={() => setShowActiveModal(false)}
                className="absolute top-4 right-4 text-neutral-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="w-16 h-16 mx-auto rounded-full bg-rose-600/20 border-2 border-rose-500 flex items-center justify-center mb-3">
                <ShieldAlert className="w-8 h-8 text-rose-500 animate-pulse" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">{tr('EMERGENCY SOS ACTIVE', 'EMERGENCY SOS ACTIVE')}</h3>
              <p className="text-xs text-rose-300 mb-6 leading-relaxed">
                {tr('Your guardians are receiving live GPS coordinates.', 'Your guardians are receiving live GPS coordinates.')}
              </p>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs border flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                    isSirenMuted
                      ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-600/30'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-rose-300 border-neutral-700'
                  }`}
                >
                  {isSirenMuted ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-rose-400 animate-pulse" />}
                  <span>{isSirenMuted ? tr('Unmute Siren Audio', 'Unmute Siren Audio') : tr('Mute Siren Audio', 'Mute Siren Audio')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onResolveSos();
                    setShowActiveModal(false);
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-950 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{tr('I Am Safe (Resolve Incident)', 'I Am Safe (Resolve Incident)')}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

