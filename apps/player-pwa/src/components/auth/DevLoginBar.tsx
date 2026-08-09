'use client';

import { useState } from 'react';
import { fetcher } from '@/lib/fetcher';

/**
 * Dev-only quick-login buttons for seeded users.
 * Only renders when API_URL is localhost.
 */
export default function DevLoginBar() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1');

  if (!isLocalhost) return null;

  const seededPhones = [
    { phone: '+966500000001', name: 'Ahmed Al-Rashid' },
    { phone: '+966500000002', name: 'Khalid Al-Otaibi' },
    { phone: '+966500000003', name: 'Faisal Al-Harbi' },
    { phone: '+966500000004', name: 'Omar Al-Shahrani' },
    { phone: '+966500000005', name: 'Yousef Al-Qahtani' },
  ];

  const devLogin = async (phone: string) => {
    setLoading(phone);
    setError(null);
    try {
      await fetcher('/auth/dev-login', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      });
      // Reload so the cookie is picked up by middleware
      window.location.href = `/${document.documentElement.lang || 'en'}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dev login failed');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="mt-6 border-t border-dashed border-amber-300 pt-4">
      <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2 text-center">
        🔧 Dev Quick Login
      </p>
      <div className="space-y-2">
        {seededPhones.map((u) => (
          <button
            key={u.phone}
            onClick={() => devLogin(u.phone)}
            disabled={loading !== null}
            className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all active:scale-[0.98] ${
              loading === u.phone
                ? 'bg-amber-100 border-amber-300 text-amber-700'
                : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
            }`}
          >
            {loading === u.phone ? (
              'Signing in...'
            ) : (
              <>
                Login as <strong>{u.name}</strong>
              </>
            )}
          </button>
        ))}
      </div>
      {error && (
        <p className="text-xs text-brand-red text-center mt-2">{error}</p>
      )}
    </div>
  );
}
