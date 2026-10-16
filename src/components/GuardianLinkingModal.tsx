import React, { useState, useEffect } from 'react';
import { Users, Key, Copy, Check, ShieldAlert, Trash2, RefreshCw, Clock, UserCheck, AlertCircle } from 'lucide-react';
import { GuardianRelationship, GuardianInvitation, GuardianAccessPermissions, GuardianAccessRequests } from '../types/safety';
import { translate, LanguageCode } from '../translations';
import GuardianAccessControls from './GuardianAccessControls';

interface GuardianLinkingModalProps {
  userPhone: string;
  userName: string;
  userProfile?: any;
  isGuardianMode?: boolean;
  guardianPhone?: string;
  guardianName?: string;
  onLinkSuccess?: () => void;
  lang?: string;
}

export default function GuardianLinkingModal({
  userPhone,
  userName,
  userProfile,
  isGuardianMode = false,
  guardianPhone = '',
  guardianName = '',
  onLinkSuccess,
  lang = 'en',
}: GuardianLinkingModalProps) {
  const t = (k: string, def?: string) => translate(k, (lang as LanguageCode) || 'en', def);

  // User Mode state
  const [currentInvite, setCurrentInvite] = useState<GuardianInvitation | null>(null);
  const [linkedGuardians, setLinkedGuardians] = useState<GuardianRelationship[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshedMsg, setRefreshedMsg] = useState<string | null>(null);

  // Guardian Mode state
  const [inputCode, setInputCode] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccessMsg, setLinkSuccessMsg] = useState<string | null>(null);

  // Bidirectional Permissions state
  const [permissions, setPermissions] = useState<GuardianAccessPermissions>({
    camera: true,
    microphone: true,
    location: true,
  });
  const [pendingRequests, setPendingRequests] = useState<GuardianAccessRequests>({});

  // Fetch access permissions
  const loadPermissions = async () => {
    const phone = userPhone || (typeof window !== 'undefined' ? localStorage.getItem('rakshika_user_phone') || '' : '');
    if (!phone) return;
    try {
      const res = await fetch(`/api/guardian/permissions/${encodeURIComponent(phone)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.permissions) {
          setPermissions({
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
      }
    } catch (e) {
      console.warn("Error loading permissions:", e);
    }
  };

  const handleUpdatePermissions = async (updated: Partial<GuardianAccessPermissions>) => {
    const phone = userPhone || (typeof window !== 'undefined' ? localStorage.getItem('rakshika_user_phone') || '' : '');
    if (!phone) return;

    const nextPerms = { ...permissions, ...updated };
    setPermissions(nextPerms);

    try {
      await fetch('/api/guardian/permissions/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPhone: phone,
          permissions: nextPerms,
          updatedBy: isGuardianMode ? 'guardian' : 'user',
        }),
      });
      // Clear approved requests
      setPendingRequests((prev) => {
        const copy = { ...prev };
        if (updated.camera) delete copy.camera;
        if (updated.microphone) delete copy.microphone;
        if (updated.location) delete copy.location;
        return copy;
      });
    } catch (e) {
      console.error("Error updating permissions:", e);
    }
  };

  const handleRequestPermission = async (target: 'camera' | 'microphone' | 'location') => {
    const phone = userPhone || (typeof window !== 'undefined' ? localStorage.getItem('rakshika_user_phone') || '' : '');
    if (!phone) return;

    try {
      await fetch('/api/guardian/permissions/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPhone: phone,
          guardianPhone,
          guardianName,
          requestedPermissions: { [target]: true },
        }),
      });
      setPendingRequests((prev) => ({ ...prev, [target]: true }));
    } catch (e) {
      console.error("Error requesting permission:", e);
    }
  };

  // Load active guardians for user
  const loadLinkedGuardians = async () => {
    const phone = userPhone || (typeof window !== 'undefined' ? localStorage.getItem('rakshika_user_phone') || '' : '');
    setIsRefreshing(true);
    setRefreshedMsg(null);
    try {
      if (phone) {
        const res = await fetch(`/api/guardian/linked-guardians?userPhone=${encodeURIComponent(phone)}`);
        if (res.ok) {
          const data = await res.json();
          setLinkedGuardians(data);
        }
      }
      setRefreshedMsg(t('Refreshed!', 'Refreshed!'));
      setTimeout(() => setRefreshedMsg(null), 2500);
    } catch (e) {
      console.error("Error loading linked guardians:", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (userPhone) {
      loadPermissions();
      if (!isGuardianMode) {
        loadLinkedGuardians();
      }
    }
  }, [userPhone, isGuardianMode]);

  // Generate invite code
  const handleGenerateInvite = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/guardian/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userPhone, userName, userProfile }),
      });
      const data = await res.json();
      if (data.invite) {
        setCurrentInvite(data.invite);
      }
    } catch (e) {
      console.error("Error generating invite:", e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyCode = () => {
    if (!currentInvite?.inviteCode) return;
    navigator.clipboard.writeText(currentInvite.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Revoke guardian
  const handleRevokeGuardian = async (relId: string, gPhone: string) => {
    if (!confirm("Are you sure you want to revoke this guardian's access? They will no longer be able to view your location or alerts.")) {
      return;
    }
    setRevokingId(relId);
    try {
      const res = await fetch('/api/guardian/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relationshipId: relId,
          userPhone,
          guardianPhone: gPhone,
        }),
      });
      if (res.ok) {
        loadLinkedGuardians();
      }
    } catch (e) {
      console.error("Error revoking guardian:", e);
    } finally {
      setRevokingId(null);
    }
  };

  // Guardian submits invite code to link
  const handleGuardianSubmitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkError(null);
    setLinkSuccessMsg(null);
    if (!inputCode.trim()) return;

    setIsLinking(true);
    try {
      const res = await fetch('/api/guardian/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guardianPhone,
          guardianName,
          inviteCode: inputCode.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setLinkSuccessMsg(`Successfully linked with ${data.userName || 'user'} (${data.userPhone})!`);
        setInputCode('');
        if (onLinkSuccess) onLinkSuccess();
      } else {
        setLinkError(data.error || 'Failed to authorize invite code. Please verify the code.');
      }
    } catch (err: any) {
      setLinkError('Network connection error. Please try again.');
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <div className="rakshika-card border border-purple-500/25 rounded-2xl p-6 shadow-lg shadow-purple-950/40">
      {/* USER VIEW */}
      {!isGuardianMode ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-pink-400" />
                <h3 className="font-bold text-white text-base">Guardian Linking System</h3>
              </div>
              <p className="text-xs text-purple-300/70 mt-0.5">
                Generate secure 6-character authorization codes to link trusted guardians.
              </p>
            </div>

            <button
              type="button"
              onClick={handleGenerateInvite}
              disabled={isGenerating}
              className="px-4 py-2 rakshika-gradient-btn disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-pink-950 transition-all cursor-pointer"
            >
              <Key className="w-4 h-4" />
              <span>{isGenerating ? 'Generating...' : 'Generate New Invite Code'}</span>
            </button>
          </div>

          {/* Active Invite Code Display */}
          {currentInvite && (
            <div className="p-5 bg-[#0c0722]/90 border border-pink-500/35 rounded-2xl shadow-inner">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <span className="text-[0.7rem] uppercase tracking-wider text-purple-300/80 font-bold block mb-1">
                    Your Active Guardian Invite Code
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-black font-mono tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-pink-300 via-fuchsia-300 to-rose-300">
                      {currentInvite.inviteCode}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="px-3 py-1.5 rounded-lg bg-purple-950/80 hover:bg-purple-900 border border-purple-500/30 text-purple-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied!' : 'Copy Code'}</span>
                    </button>
                  </div>
                </div>

                <div className="text-xs text-purple-200 bg-[#140b33] px-3.5 py-2.5 rounded-xl border border-purple-500/25 text-right">
                  <div className="flex items-center gap-1.5 text-pink-300 font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Valid for 24 hours</span>
                  </div>
                  <span className="text-[0.65rem] text-purple-400/70 mt-0.5 block">
                    Expires at {new Date(currentInvite.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              <p className="text-xs text-purple-300/80 mt-3 pt-3 border-t border-purple-500/15">
                Share this code with your trusted parent, family member, or guardian. Once authorized, they can monitor your live location and receive SOS alerts.
              </p>
            </div>
          )}

          {/* Linked Guardians List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-purple-200 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <span>{t('Authorized Linked Guardians', 'Authorized Linked Guardians')} ({linkedGuardians.length})</span>
              </h4>
              <button
                type="button"
                onClick={loadLinkedGuardians}
                disabled={isRefreshing}
                className="text-purple-300/70 hover:text-white text-xs flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-pink-400' : ''}`} />
                <span>{refreshedMsg || t('Refresh', 'Refresh')}</span>
              </button>
            </div>

            {linkedGuardians.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {linkedGuardians.map((g) => (
                  <div
                    key={g.id}
                    className="p-4 bg-[#0c0722]/85 border border-purple-500/20 rounded-xl flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{g.guardianName}</span>
                        <span className="text-[0.65rem] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
                          Active
                        </span>
                      </div>
                      <span className="text-xs text-purple-300 font-mono block mt-0.5">{g.guardianPhone}</span>
                      <span className="text-[0.65rem] text-purple-400/70 mt-1 block">
                        Linked on {new Date(g.authorizedAt).toLocaleDateString()}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRevokeGuardian(g.id, g.guardianPhone)}
                      disabled={revokingId === g.id}
                      className="p-2 bg-purple-950/70 hover:bg-rose-500/20 text-purple-300 hover:text-rose-400 border border-purple-500/25 hover:border-rose-500/30 rounded-xl transition-all cursor-pointer"
                      title="Revoke Guardian Access"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 bg-[#0c0722]/80 border border-purple-500/20 rounded-xl text-center">
                <Users className="w-8 h-8 text-purple-500/60 mx-auto mb-2" />
                <p className="text-sm font-medium text-purple-300">No Guardians Linked Yet</p>
                <p className="text-xs text-purple-400/70 mt-1 max-w-sm mx-auto">
                  Click "Generate New Invite Code" above and share it with your guardian to establish a secure safety connection.
                </p>
              </div>
            )}
          </div>

          {/* User Side Bidirectional Permissions Card */}
          <GuardianAccessControls
            userPhone={userPhone}
            userName={userName}
            isGuardianMode={false}
            permissions={permissions}
            pendingRequests={pendingRequests}
            onUpdatePermissions={handleUpdatePermissions}
            onRequestPermission={handleRequestPermission}
            t={t}
          />
        </div>
      ) : (
        /* GUARDIAN VIEW: Link User with Invite Code */
        <div className="space-y-6">
          <div>
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">Link User With Invite Code</h3>
              </div>
              <p className="text-xs text-purple-300/70 mt-0.5">
                Enter the 6-character invite code provided by the person you are monitoring.
              </p>
            </div>

            <form onSubmit={handleGuardianSubmitCode} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-purple-200 mb-2">
                  6-Character Invite Code
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                    placeholder="e.g. RAK-8429"
                    maxLength={10}
                    className="flex-1 bg-[#0c0722]/90 border border-purple-500/25 focus:border-pink-500 rounded-xl px-4 py-3 text-white font-mono uppercase tracking-widest text-lg outline-none transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={isLinking || !inputCode.trim()}
                    className="px-6 py-3 rakshika-gradient-btn disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg shadow-pink-950 transition-all cursor-pointer"
                  >
                    {isLinking ? 'Verifying...' : 'Link User'}
                  </button>
                </div>
              </div>

              {linkError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{linkError}</span>
                </div>
              )}

              {linkSuccessMsg && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{linkSuccessMsg}</span>
                </div>
              )}
            </form>
          </div>

          {userPhone && (
            <GuardianAccessControls
              userPhone={userPhone}
              userName={userName}
              guardianPhone={guardianPhone}
              guardianName={guardianName}
              isGuardianMode={true}
              permissions={permissions}
              pendingRequests={pendingRequests}
              onUpdatePermissions={handleUpdatePermissions}
              onRequestPermission={handleRequestPermission}
              t={t}
            />
          )}
        </div>
      )}
    </div>
  );
}
