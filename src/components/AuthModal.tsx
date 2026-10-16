import React, { useState } from 'react';
import { Shield, User, Lock, Mail, Phone, Users, CheckCircle2, ArrowRight, HeartPulse } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { UserRole } from '../types/safety';

interface AuthModalProps {
  onSuccess: (userData: {
    fullName: string;
    phone: string;
    email: string;
    role: UserRole;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
  }) => void;
  initialRole?: UserRole;
  lang: string;
  t: (key: string, def?: string) => string;
}

export default function AuthModal({
  onSuccess,
  initialRole = 'user',
  lang,
  t,
}: AuthModalProps) {
  const [role, setRole] = useState<UserRole>(initialRole);
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!phone.trim() || (!fullName.trim() && authMode === 'signup')) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Attempt Supabase Auth if email and password are provided
      if (email.trim() && password.trim()) {
        try {
          if (authMode === 'signup') {
            const { data: authData, error: authErr } = await supabase.auth.signUp({
              email: email.trim(),
              password: password.trim(),
              options: {
                data: {
                  full_name: fullName.trim(),
                  phone: phone.trim(),
                  role: role,
                },
              },
            });
            if (authErr && !authErr.message?.includes('fetch failed')) {
              console.warn("Supabase Auth notice:", authErr.message);
            }
          } else {
            const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
              email: email.trim(),
              password: password.trim(),
            });
            if (authErr && !authErr.message?.includes('fetch failed')) {
              console.warn("Supabase Auth notice:", authErr.message);
            }
          }
        } catch {
          // Gracefully continue with local-first profile creation if auth host is unreachable
        }
      }

      // 2. Persist profile to backend & Supabase profiles table
      const profileRes = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          fullName: fullName.trim() || (role === 'guardian' ? 'Guardian' : 'User'),
          email: email.trim(),
          role: role,
          emergencyContactName: emergencyContactName.trim(),
          emergencyContactPhone: emergencyContactPhone.trim(),
        }),
      });

      const profileData = await profileRes.json();

      onSuccess({
        fullName: fullName.trim() || (role === 'guardian' ? 'Guardian' : 'User'),
        phone: phone.trim(),
        email: email.trim(),
        role: role,
        emergencyContactName: emergencyContactName.trim(),
        emergencyContactPhone: emergencyContactPhone.trim(),
      });
    } catch (err: any) {
      console.error("Auth submit error:", err);
      // Fallback: Proceed with local profile
      onSuccess({
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        role: role,
        emergencyContactName: emergencyContactName.trim(),
        emergencyContactPhone: emergencyContactPhone.trim(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Quick Demo fill for evaluation
  const handleQuickDemo = (demoRole: UserRole) => {
    if (demoRole === 'user') {
      setRole('user');
      setFullName('Priya Sharma');
      setPhone('+91 98765 43210');
      setEmail('priya.safety@rakshika.ai');
      setEmergencyContactName('Father (Rajesh)');
      setEmergencyContactPhone('+91 98111 22334');
    } else {
      setRole('guardian');
      setFullName('Rajesh Sharma');
      setPhone('+91 98111 22334');
      setEmail('rajesh.guardian@rakshika.ai');
    }
  };

  return (
    <div className="w-full max-w-md rakshika-card rounded-3xl p-6 sm:p-8 shadow-2xl border border-purple-500/30">
      {/* Role Toggle */}
      <div className="flex gap-2 mb-6 bg-[#0c0722]/90 p-1.5 rounded-2xl border border-purple-500/25">
        <button
          type="button"
          onClick={() => setRole('user')}
          className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            role === 'user'
              ? 'bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 text-white shadow-lg shadow-fuchsia-950/80 font-bold'
              : 'text-purple-300/70 hover:text-white'
          }`}
        >
          {t('User (Women)', 'User (Women)')}
        </button>
        <button
          type="button"
          onClick={() => setRole('guardian')}
          className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            role === 'guardian'
              ? 'bg-gradient-to-r from-purple-700 to-indigo-700 text-white shadow-lg shadow-purple-950/80 font-bold border border-purple-400/30'
              : 'text-purple-300/70 hover:text-white'
          }`}
        >
          {t('Guardian', 'Guardian')}
        </button>
      </div>

      {/* Header */}
      <div className="mb-5">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-1 tracking-tight">
          {role === 'user' ? t('Rakshika User Safety', 'Rakshika User Safety') : t('Guardian Protection Console', 'Guardian Protection Console')}
        </h2>
        <p className="text-xs text-purple-200/70">
          {role === 'user'
            ? t('Set up your encrypted safety profile and emergency contacts.', 'Set up your encrypted safety profile and emergency contacts.')
            : t('Access real-time safety monitoring for your authorized users.', 'Access real-time safety monitoring for your authorized users.')}
        </p>
      </div>

      {/* Auth Mode Toggle (Signup vs Login) */}
      <div className="flex items-center gap-4 mb-5 border-b border-purple-500/20 pb-3">
        <button
          type="button"
          onClick={() => setAuthMode('signup')}
          className={`text-xs font-bold transition-colors cursor-pointer ${
            authMode === 'signup'
              ? role === 'user' ? 'text-pink-400 border-b-2 border-pink-500 pb-1 -mb-3.5' : 'text-purple-300 border-b-2 border-purple-400 pb-1 -mb-3.5'
              : 'text-purple-400/60 hover:text-purple-200'
          }`}
        >
          {t('Create New Profile', 'Create New Profile')}
        </button>
        <button
          type="button"
          onClick={() => setAuthMode('login')}
          className={`text-xs font-bold transition-colors cursor-pointer ${
            authMode === 'login'
              ? role === 'user' ? 'text-pink-400 border-b-2 border-pink-500 pb-1 -mb-3.5' : 'text-purple-300 border-b-2 border-purple-400 pb-1 -mb-3.5'
              : 'text-purple-400/60 hover:text-purple-200'
          }`}
        >
          {t('Sign In', 'Sign In')}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {authMode === 'signup' && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-purple-200/90 mb-1.5">
              {t('Full Name *', 'Full Name *')}
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-purple-400/70 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={role === 'user' ? 'e.g. Priya Sharma' : 'e.g. Rajesh Sharma'}
                required
                className="w-full bg-[#0c0722]/80 border border-purple-500/25 focus:border-fuchsia-400 focus:ring-1 focus:ring-fuchsia-400/40 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm outline-none transition-all placeholder:text-purple-300/30"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-purple-200/90 mb-1.5">
            {t('Mobile Phone Number *', 'Mobile Phone Number *')}
          </label>
          <div className="relative">
            <Phone className="w-4 h-4 text-purple-400/70 absolute left-3.5 top-3.5" />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              required
              className="w-full bg-[#0c0722]/80 border border-purple-500/25 focus:border-fuchsia-400 focus:ring-1 focus:ring-fuchsia-400/40 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm outline-none transition-all placeholder:text-purple-300/30"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-purple-200/90 mb-1.5">
            {t('Account Email (Optional)', 'Account Email (Optional)')}
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-purple-400/70 absolute left-3.5 top-3.5" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full bg-[#0c0722]/80 border border-purple-500/25 focus:border-fuchsia-400 focus:ring-1 focus:ring-fuchsia-400/40 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm outline-none transition-all placeholder:text-purple-300/30"
            />
          </div>
        </div>

        {/* Emergency contact (for User role only) */}
        {role === 'user' && authMode === 'signup' && (
          <div className="p-3.5 bg-[#0c0722]/80 border border-purple-500/25 rounded-xl space-y-3">
            <span className="text-[0.7rem] uppercase tracking-wider text-pink-300 font-bold flex items-center gap-1.5">
              <HeartPulse className="w-3.5 h-3.5 text-pink-400" />
              {t('Primary Emergency Contact', 'Primary Emergency Contact')}
            </span>
            <div>
              <input
                type="text"
                value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)}
                placeholder={t('Primary Emergency Contact Name', 'Contact Name (e.g. Mom, Brother, Spouse)')}
                className="w-full bg-[#130b2e] border border-purple-500/20 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-fuchsia-400 placeholder:text-purple-300/30"
              />
            </div>
            <div>
              <input
                type="tel"
                value={emergencyContactPhone}
                onChange={(e) => setEmergencyContactPhone(e.target.value)}
                placeholder={t('Primary Emergency Contact Phone', 'Contact Phone (+91 ...)')}
                className="w-full bg-[#130b2e] border border-purple-500/20 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-fuchsia-400 placeholder:text-purple-300/30"
              />
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-300">
            {errorMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className={`w-full py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer ${
            role === 'user'
              ? 'rakshika-gradient-btn'
              : 'bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 hover:from-purple-600 hover:to-indigo-600 shadow-purple-950/80 border border-purple-400/30'
          }`}
        >
          <span>
            {isLoading 
              ? t('Refreshing...', 'Connecting...') 
              : authMode === 'signup' 
                ? (role === 'user' ? t('Start Protected Session', 'Start Safety Session') : t('Launch Guardian Console', 'Launch Guardian Console'))
                : t('Sign In', 'Sign In')}
          </span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      {/* Quick 1-Click Demo Fill */}
      <div className="mt-5 pt-4 border-t border-purple-500/20 flex items-center justify-between text-xs">
        <span className="text-purple-300/60">{t('Quick Evaluation:', 'Quick Evaluation:')}</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleQuickDemo('user')}
            className="px-2.5 py-1 rounded-lg bg-purple-950/60 hover:bg-purple-900/60 border border-pink-500/30 text-pink-300 text-[0.7rem] font-medium transition-colors cursor-pointer"
          >
            {t('Quick Demo (User / Priya)', 'Demo User')}
          </button>
          <button
            type="button"
            onClick={() => handleQuickDemo('guardian')}
            className="px-2.5 py-1 rounded-lg bg-purple-950/60 hover:bg-purple-900/60 border border-purple-500/30 text-purple-300 text-[0.7rem] font-medium transition-colors cursor-pointer"
          >
            {t('Quick Demo (Guardian / Rajesh)', 'Demo Guardian')}
          </button>
        </div>
      </div>
    </div>
  );
}
