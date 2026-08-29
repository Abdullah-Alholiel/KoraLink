'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { captureError } from '@/providers/ObservabilityProvider';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
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
        <div className="min-h-dvh flex items-center justify-center bg-brand-bg p-6">
          <div className="max-w-sm w-full bg-white rounded-3xl shadow-card p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-brand-red/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-brand-red" strokeWidth={1.5} />
            </div>
            <h2 className="text-lg font-bold text-brand-black mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-6 py-3 bg-brand-green text-white rounded-full text-sm font-bold active:scale-95 transition-transform"
            >
              <RefreshCw className="w-4 h-4" strokeWidth={2} />
              Try Again
            </button>
            <details className="mt-6 text-left">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-500">
                Error details
              </summary>
              <pre className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-xl p-3 overflow-auto max-h-32">
                {this.state.error?.message ?? 'Unknown error'}
              </pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
