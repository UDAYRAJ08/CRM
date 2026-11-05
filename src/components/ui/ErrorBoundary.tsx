import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface Props {
  children: ReactNode;
}

const CHUNK_RELOAD_KEY = 'crm_chunk_reload';
// Browser wording for a lazy chunk that no longer exists after a deploy (Chrome / Safari / Firefox)
const CHUNK_ERROR_RE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  private clearFlagTimer?: ReturnType<typeof setTimeout>;

  /** Reload the page once per failure streak; returns false if we already tried. */
  public static reloadOnce(): boolean {
    try {
      if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return false;
      sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    } catch {
      return false;
    }
    window.location.reload();
    return true;
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidMount() {
    // Clear the flag only once the app has run for a while without crashing, so a chunk
    // that is still missing after the reload shows this screen instead of a reload loop.
    this.clearFlagTimer = setTimeout(() => {
      if (this.state.hasError) return;
      try {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      } catch {
        // storage blocked: nothing to clear
      }
    }, 10000);
  }

  public componentWillUnmount() {
    clearTimeout(this.clearFlagTimer);
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (CHUNK_ERROR_RE.test(error?.message || '') && ErrorBoundary.reloadOnce()) return;
    console.error('Uncaught CRM Error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-lg">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Something went wrong</h2>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              {this.state.error?.message || 'An unexpected error occurred while updating CRM view.'}
            </p>

            <div className="mt-6 flex items-center justify-center gap-3">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<RefreshCw className="w-4 h-4" />}
                onClick={this.handleReset}
              >
                Reload CRM
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
