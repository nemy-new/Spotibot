import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', color: 'white', background: '#AA0000', height: '100vh', overflow: 'auto', zIndex: 9999, position: 'relative' }}>
          <h1 style={{ fontSize: '32px', marginBottom: '10px' }}>System Error</h1>
          <h2 style={{ color: '#ffffff', background: 'black', padding: '10px', fontFamily: 'monospace' }}>
            {this.state.error && this.state.error.toString()}
          </h2>
          <details style={{ whiteSpace: 'pre-wrap', marginTop: '20px', background: 'black', padding: '10px', borderRadius: '5px' }}>
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
          <button onClick={() => window.location.href = window.location.origin} style={{ marginTop: '20px', padding: '10px 20px' }}>
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
