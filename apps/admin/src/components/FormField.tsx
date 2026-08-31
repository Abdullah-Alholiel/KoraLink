'use client';

import { cn } from '@/lib/utils';

interface FormFieldProps {
  label: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Labeled form field wrapper — replaces the placeholder-only input pattern.
 * Label sits ABOVE the control, with a hint slot and a red validation
 * message slot below.
 */
export default function FormField({ label, error, hint, required, className, children }: FormFieldProps) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-700">
        {label}
        {required && <span className="text-brand-red">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-[11px] text-gray-400">{hint}</span>}
      {error && <span className="mt-1 block text-[11px] text-brand-red">{error}</span>}
    </label>
  );
}
