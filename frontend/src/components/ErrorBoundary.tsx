import React, { Component, ReactNode } from 'react';
import { motion } from 'framer-motion';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass p-8 max-w-2xl w-full"
          >
            <div className="text-center">
              <h1 className="text-4xl font-bold neon-text mb-4">⚠️ System Error</h1>
              <p className="text-white/80 mb-6">
                JARVIS encountered an unexpected error. Please reload the application.
              </p>
              
              <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 mb-6 text-left">
                <p className="text-sm font-mono text-red-300">
                  {this.state.error?.message || 'Unknown error'}
                </p>
              </div>

              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 rounded-lg bg-neon-cyan/20 border-2 border-neon-cyan hover:bg-neon-cyan/30 font-bold transition-all"
              >
                🔄 Reload Application
              </button>
            </div>
          </motion.div>
        </div>
      );
    }

    return this.props.children;
  }
}
