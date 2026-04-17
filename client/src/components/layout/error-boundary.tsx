import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';

interface State {
  hasError: boolean;
  error: Error | null;
}

interface Props {
  children: React.ReactNode;
  panelName?: string;
  /** Render a compact inline error instead of the full-panel fallback */
  inline?: boolean;
}

/**
 * Per-panel error boundary — isolates failures so one broken chart cannot
 * crash the entire dashboard.
 *
 * This is a class component because React's componentDidCatch API does not
 * yet have a hook equivalent.
 */
export class PanelErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In production this would be shipped to an error tracking service
    console.error(`[Panel Error: ${this.props.panelName}]`, error, info.componentStack);
  }

  private reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.inline) {
      return (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Something went wrong in this panel.</span>
          <button onClick={this.reset} className="underline">
            Retry
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center gap-4 h-full min-h-[200px] p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
        </div>
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">
            {this.props.panelName ?? 'Panel'} failed to render
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={this.reset}>
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </Button>
      </div>
    );
  }
}
