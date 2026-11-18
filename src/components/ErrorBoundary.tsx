import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application error caught by ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F7F8FB] text-[#0A1045] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-[#E1E5EE] rounded-xl p-8 text-center shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8E6B2E] mb-2">
              Storefront Notice
            </p>
            <h1 className="font-display text-2xl font-semibold text-[#0A1045] mb-3">
              Something went wrong
            </h1>
            <p className="text-sm text-[#59607A] mb-6">
              Please reload the page to reconnect to the storefront.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 text-sm font-medium text-white bg-[#000066] hover:bg-[#091285] rounded-lg transition-colors cursor-pointer"
            >
              Reload Storefront
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
