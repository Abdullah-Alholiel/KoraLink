'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useAppStore, selectToast } from '@/store/useAppStore';

export default function Toast() {
  const toast = useAppStore(selectToast);
  const dismissToast = useAppStore((s) => s.dismissToast);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (toast) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(() => dismissToast(), 300);
      }, 3000);
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
  }[toast.type];

  return (
    <div
      className={`fixed top-[calc(1.5rem+env(safe-area-inset-top))] inset-x-0 z-[100] flex justify-center px-4 pointer-events-none transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      }`}
    >
      <div
        className={`pointer-events-auto flex items-center gap-2.5 ${config.bg} text-white rounded-2xl px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.2)] max-w-sm w-full animate-scale-in`}
      >
        {config.icon}
        <span className="text-sm font-medium flex-1">{toast.message}</span>
        <button
          onClick={() => {
            setVisible(false);
            setTimeout(() => dismissToast(), 300);
          }}
          className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center active:scale-90 transition-transform"
        >
          <X className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
