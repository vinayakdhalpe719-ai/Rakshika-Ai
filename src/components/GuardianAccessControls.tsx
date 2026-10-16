import React, { useState } from 'react';
import { Camera, Mic, MapPin, Shield, Check, Lock, AlertTriangle, RefreshCw, Eye } from 'lucide-react';
import { GuardianAccessPermissions, GuardianAccessRequests } from '../types/safety';

interface GuardianAccessControlsProps {
  userPhone: string;
  userName?: string;
  guardianName?: string;
  isGuardianMode?: boolean;
  guardianPhone?: string;
  permissions: GuardianAccessPermissions;
  pendingRequests?: GuardianAccessRequests;
  onUpdatePermissions?: (updated: Partial<GuardianAccessPermissions>) => Promise<void>;
  onRequestPermission?: (target: 'camera' | 'microphone' | 'location') => Promise<void>;
  t?: (key: string, fallback?: string) => string;
}

export default function GuardianAccessControls({
  userPhone,
  userName = 'User',
  guardianName = 'Guardian',
  isGuardianMode = false,
  guardianPhone = '',
  permissions,
  pendingRequests,
  onUpdatePermissions,
  onRequestPermission,
  t = (_k, def) => def || '',
}: GuardianAccessControlsProps) {
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const handleToggleByUser = async (key: 'camera' | 'microphone' | 'location') => {
    if (!onUpdatePermissions) return;
    setUpdatingKey(key);
    try {
      const nextVal = !permissions[key];
      await onUpdatePermissions({ [key]: nextVal });
      setActionNotice(
        nextVal
          ? `${key.toUpperCase()} sharing enabled for your guardian.`
          : `${key.toUpperCase()} sharing revoked for your guardian.`
      );
      setTimeout(() => setActionNotice(null), 3500);
    } catch (e) {
      console.error('Error updating permission:', e);
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleToggleOrRequestByGuardian = async (key: 'camera' | 'microphone' | 'location') => {
    setUpdatingKey(key);
    try {
      if (permissions[key]) {
        // If guardian turns it OFF, they can voluntarily disengage access
        if (onUpdatePermissions) {
          await onUpdatePermissions({ [key]: false });
          setActionNotice(`${key.toUpperCase()} monitoring paused.`);
        }
      } else {
        // If permission is currently revoked/disabled by user, send a real-time request to user
        if (onRequestPermission) {
          await onRequestPermission(key);
          setActionNotice(`Access request sent to ${userName} for ${key.toUpperCase()}.`);
        }
      }
      setTimeout(() => setActionNotice(null), 3500);
    } catch (e) {
      console.error('Error toggling/requesting permission:', e);
    } finally {
      setUpdatingKey(null);
    }
  };

  const permissionItems = [
    {
      key: 'camera' as const,
      label: t('Camera Stream', 'Live Camera Stream'),
      desc: isGuardianMode
        ? `Real-time 4 FPS surveillance frames from ${userName}'s device.`
        : `Allows your guardian to view live video frames in emergencies.`,
      icon: Camera,
      badgeColor: 'from-pink-500 to-rose-500',
    },
    {
      key: 'microphone' as const,
      label: t('Microphone Audio', 'Live Microphone Audio'),
      desc: isGuardianMode
        ? `Ultra-low latency audio listening from ${userName}'s surroundings.`
        : `Allows your guardian to tap speaker and listen to your live environment.`,
      icon: Mic,
      badgeColor: 'from-purple-500 to-pink-500',
    },
    {
      key: 'location' as const,
      label: t('Live GPS Location', 'Live GPS Location'),
      desc: isGuardianMode
        ? `Continuously updated high-precision GPS coordinates & geofences.`
        : `Allows your guardian to see your real-time location on the map.`,
      icon: MapPin,
      badgeColor: 'from-fuchsia-500 to-purple-500',
    },
  ];

  return (
    <div className="rakshika-card border border-purple-500/25 rounded-2xl p-5 shadow-lg shadow-purple-950/40 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-purple-500/20 pb-3.5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-900/60 to-pink-900/40 border border-purple-500/30 flex items-center justify-center text-pink-300 shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
              <span>{t('Bidirectional Access Controls', 'Bidirectional Access Permissions')}</span>
              <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30 font-semibold font-mono">
                {isGuardianMode ? 'GUARDIAN CONSOLE' : 'USER PRIVACY SHIELD'}
              </span>
            </h3>
            <p className="text-xs text-purple-300/70 mt-0.5">
              {isGuardianMode
                ? `Monitor granted permissions from ${userName} or request on-demand access.`
                : `Explicitly grant or revoke Camera, Microphone, and GPS Location access for your guardian.`}
            </p>
          </div>
        </div>

        {/* Live sync badge */}
        <div className="flex items-center gap-1.5 text-[0.7rem] font-mono text-purple-300/80 bg-purple-950/60 px-2.5 py-1 rounded-lg border border-purple-500/20">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Synced</span>
        </div>
      </div>

      {/* Action Notice feedback banner */}
      {actionNotice && (
        <div className="p-3 bg-pink-950/50 border border-pink-500/40 rounded-xl text-xs text-pink-200 flex items-center gap-2 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Pending Access Request from Guardian Notice (Shown on User side) */}
      {!isGuardianMode && pendingRequests && Object.keys(pendingRequests).length > 0 && (
        <div className="p-3.5 bg-amber-950/40 border border-amber-500/40 rounded-xl text-xs text-amber-200 space-y-2">
          <div className="flex items-center gap-2 font-bold text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Guardian Access Request Received</span>
          </div>
          <p className="text-[0.75rem] text-amber-200/90 leading-relaxed">
            Your guardian requested access to:{' '}
            <strong>
              {[
                pendingRequests.camera && 'Camera',
                pendingRequests.microphone && 'Microphone',
                pendingRequests.location && 'Live Location',
              ]
                .filter(Boolean)
                .join(', ')}
            </strong>
            . You can approve or decline using the toggles below.
          </p>
        </div>
      )}

      {/* Grid of the 3 Permissions: Camera, Microphone, Live Location */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {permissionItems.map((item) => {
          const Icon = item.icon;
          const isGranted = Boolean(permissions[item.key]);
          const isPending = Boolean(pendingRequests && pendingRequests[item.key]);
          const isBusy = updatingKey === item.key;

          return (
            <div
              key={item.key}
              className={`p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3.5 ${
                isGranted
                  ? 'bg-[#0c0722]/90 border-purple-500/35 shadow-md shadow-purple-950/30'
                  : 'bg-[#090518]/70 border-purple-500/15 opacity-90'
              }`}
            >
              {/* Item Top Label & Icon */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${
                        isGranted
                          ? `bg-gradient-to-r ${item.badgeColor} shadow-md`
                          : 'bg-purple-950/60 text-purple-400 border border-purple-500/20'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-white text-xs sm:text-sm">{item.label}</span>
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`text-[0.65rem] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                      isGranted
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : isPending
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse'
                        : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    {isGranted ? 'GRANTED' : isPending ? 'REQUESTED' : 'REVOKED'}
                  </span>
                </div>

                <p className="text-[0.72rem] text-purple-300/70 leading-relaxed min-h-[36px]">
                  {item.desc}
                </p>
              </div>

              {/* Action Buttons / Toggles */}
              <div className="pt-2 border-t border-purple-500/15 flex items-center justify-between">
                {!isGuardianMode ? (
                  /* USER SIDE: Direct Grant / Revoke Switch */
                  <div className="w-full flex items-center justify-between">
                    <span className="text-[0.7rem] font-medium text-purple-300">
                      {isGranted ? 'Sharing Active' : 'Sharing Disabled'}
                    </span>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleToggleByUser(item.key)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer focus:outline-none ${
                        isGranted ? 'bg-gradient-to-r from-purple-600 to-pink-600' : 'bg-purple-950/80 border border-purple-500/30'
                      }`}
                      title={isGranted ? `Revoke ${item.label}` : `Grant ${item.label}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isGranted ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                ) : (
                  /* GUARDIAN SIDE: Request access if revoked, or Pause if active */
                  <div className="w-full flex items-center justify-between gap-2">
                    <span className="text-[0.7rem] font-medium text-purple-300/80">
                      {isGranted ? 'Access Ready' : isPending ? 'Pending User Approval' : 'Access Denied'}
                    </span>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleToggleOrRequestByGuardian(item.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                        isGranted
                          ? 'bg-purple-950/70 hover:bg-rose-500/20 text-purple-200 hover:text-rose-300 border border-purple-500/30'
                          : isPending
                          ? 'bg-amber-950/50 hover:bg-amber-900/60 text-amber-200 border border-amber-500/40'
                          : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-md shadow-pink-950/50'
                      }`}
                    >
                      {isBusy ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : isGranted ? (
                        <>
                          <Lock className="w-3 h-3" />
                          <span>Pause</span>
                        </>
                      ) : isPending ? (
                        <>
                          <RefreshCw className="w-3 h-3" />
                          <span>Re-request</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3 h-3" />
                          <span>Request Access</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
