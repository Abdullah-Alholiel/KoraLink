'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertCircle, Info, Bell, X } from 'lucide-react';
import { useAppStore, selectToast } from '@/store/useAppStore';

/**
 * App toast — supports system messages and tappable notification toasts
 * (US7): notification type deep-links via router.push on tap, 4s auto-dismiss,
 * single stack (new replaces old).
 */
export default function Toast() {
  const toast = useAppStore(selectToast);
  const dismissToast = useAppStore((s) => s.dismissToast);
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (toast) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(() => dismissToast(), 300);
      }, toast.type === 'notification' ? 4000 : 3000);
      return () => clearTimeout(timer);
    }
  }, [toast, dismissToast]);

  if (!toast) return null;

  const config = {
    success: {
      icon: <CheckCircle2 className="w-5 h-5 text-white" strokeWidth={2} />,
      bg: 'bg-brand-green',
    },
    error: {
      icon: <AlertCircle className="w-5 h-5 text-white" strokeWidth={2} />,
      bg: 'bg-brand-red',
    },
    info: {
      icon: <Info className="w-5 h-5 text-white" strokeWidth={2} />,
      bg: 'bg-brand-black',
    },
    notification: {
      icon: <Bell className="w-5 h-5 text-white" strokeWidth={2} />,
      bg: 'bg-brand-green',
    },
  }[toast.type];

  const handleTap = () => {
    if (toast.meta?.href) {
      router.push(toast.meta.href);
    }
    setVisible(false);
    setTimeout(() => dismissToast(), 300);
  };

  return (
    <div
      className={`fixed top-[calc(1.5rem+env(safe-area-inset-top))] inset-x-0 z-[100] flex justify-center px-4 pointer-events-none transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      }`}
    >
      <div
        role={toast.meta?.href ? 'button' : undefined}
        onClick={toast.meta?.href ? handleTap : undefined}
        className={`pointer-events-auto flex items-center gap-2.5 ${config.bg} text-white rounded-2xl px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.2)] max-w-sm w-full animate-scale-in ${
          toast.meta?.href ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''
        }`}
      >
        {config.icon}
        <span className="text-sm font-medium flex-1">{toast.message}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setVisible(false);
            setTimeout(() => dismissToast(), 300);
          }}
          className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center active:scale-90 transition-transform"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
