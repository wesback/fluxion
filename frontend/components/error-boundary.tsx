"use client";

import { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trackError } from '@/lib/telemetry';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error boundary caught:', error, errorInfo);
    }

    // Track error with OpenTelemetry
    trackError(error, {
      component: 'ErrorBoundary',
      componentStack: errorInfo.componentStack?.substring(0, 500) || 'unknown',
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div role="alert" className="flex flex-col items-center justify-center min-h-[400px] p-8">
          <AlertTriangle className="w-12 h-12 text-status-error mb-4" aria-hidden="true" />
          <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
          <p className="text-status-error mb-4 text-center max-w-md">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <Button
            variant="outline"
            onClick={() => this.setState({ hasError: false, error: undefined })}
          >
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
