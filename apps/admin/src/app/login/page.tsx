'use client';

import { useTranslations } from 'next-intl';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Loader2, ShieldAlert } from 'lucide-react';
import { api, defaultRoute, setToken } from '@/lib/api';

export default function LoginPage() {
  const t = useTranslations('hq');
  const router = useRouter();
  const [phone, setPhone] = useState('+966500000000');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Surface the "players have no console" redirect reason as a banner.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'player') {
      setError(
        'This console is for admins and venue owners only. Players use the KoraLink app.',
      );
    }
  }, []);

  async function handleDevLogin() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ token: string }>('/auth/dev-login', { phone, surface: 'ops' });
      setToken(res.token);
      router.replace(defaultRoute());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOtp() {
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/send-otp', { phone });
      setOtpSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ token?: string }>('/auth/verify-otp', { phone, code, surface: 'ops' });
      if (res.token) {
        setToken(res.token);
        router.replace(defaultRoute());
      } else {
        setError('OTP verified but no token returned (production uses cookies).');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600">
            <Activity className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="text-lg font-semibold text-gray-900">KoraLink</div>
            <div className="text-xs text-gray-500">{t('loginTitle')}</div>
          </div>
        </div>

        <label className="mb-1 block text-sm font-medium text-gray-700">{t('phoneNumber')}</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="+966500000000"
        />

        {!otpSent ? (
          <div className="space-y-2">
            <button
              onClick={handleDevLogin}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in (dev)
            </button>
            <button
              onClick={handleSendOtp}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Send OTP
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="6-digit code"
              maxLength={6}
            />
            <button
              onClick={handleVerifyOtp}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Verify &amp; sign in
            </button>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <div className="mt-6 rounded-lg bg-gray-50 px-3 py-2.5 text-xs leading-relaxed text-gray-500">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-gray-700">
            <ShieldAlert className="h-3.5 w-3.5" /> Roles
          </div>
          <div>
            <span className="font-medium text-gray-700">Admin</span> — HQ console (users, matches, disputes, money)
          </div>
          <div>
            <span className="font-medium text-gray-700">{t('roleVenueOwner')}</span> — partner portal (venues, pitches, earnings)
          </div>
          <div className="mt-1 text-gray-400">{t('playersSignInNote')}</div>
        </div>
      </div>
    </div>
  );
}
