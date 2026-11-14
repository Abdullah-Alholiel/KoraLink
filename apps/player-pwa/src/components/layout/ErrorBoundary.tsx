'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { captureError } from '@/providers/ObservabilityProvider';

type BoundaryVariant = 'page' | 'surface';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** 'page' (default) = full-height card; 'surface' = fills the (main) scroll slot so app chrome survives. */
  variant?: BoundaryVariant;
  /** Key in the `routeError` namespace (default 'title'). */
  titleKey?: string;
  /** Key in the `routeError` namespace (default 'description'). */
  descriptionKey?: string;
  /** Key in the `common` namespace (default 'retry'). */
  retryKey?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // P2-16: ship to Sentry (console kept for local dev visibility).
    captureError(error, {
      scope: 'errorBoundary',
      componentStack: errorInfo.componentStack ?? undefined,
    });
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <FallbackCard
          variant={this.props.variant ?? 'page'}
          titleKey={this.props.titleKey ?? 'title'}
          descriptionKey={this.props.descriptionKey ?? 'description'}
          retryKey={this.props.retryKey ?? 'retry'}
          onRetry={this.handleReset}
          details={this.state.error?.message ?? 'Unknown error'}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Localized fallback card. Function component so it can read next-intl —
 * class components cannot call hooks.
 */
function FallbackCard({
  variant,
  titleKey,
  descriptionKey,
  retryKey,
  onRetry,
  details,
}: {
  variant: BoundaryVariant;
  titleKey: string;
  descriptionKey: string;
  retryKey: string;
  onRetry: () => void;
  details?: string;
}) {
  const t = useTranslations('routeError');
  const tc = useTranslations('common');

  const card = (
    <div className="max-w-sm w-full bg-white rounded-3xl shadow-card p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-brand-red/10 flex items-center justify-center mx-auto mb-4">
        <AlertTriangle className="w-8 h-8 text-brand-red" strokeWidth={1.5} />
      </div>
      <h2 className="text-lg font-bold text-brand-black mb-2">
        {t(titleKey)}
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        {t(descriptionKey)}
      </p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-6 py-3 bg-brand-green text-white rounded-full text-sm font-bold active:scale-95 transition-transform"
      >
        <RefreshCw className="w-4 h-4" strokeWidth={2} />
        {tc(retryKey)}
      </button>
      {details !== undefined && (
        <details className="mt-6 text-start">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-500">
            {t('details')}
          </summary>
          <pre className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-xl p-3 overflow-auto max-h-32">
            {details}
          </pre>
        </details>
      )}
    </div>
  );

  if (variant === 'surface') {
    return (
      <main className="flex-1 overflow-y-auto scroll-container bg-brand-bg flex items-center justify-center p-6">
        {card}
      </main>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-brand-bg p-6">
      {card}
    </div>
  );
}
