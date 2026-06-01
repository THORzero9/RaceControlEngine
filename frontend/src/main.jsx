import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Global fetch interceptor to prepend VITE_API_URL in production for relative API routes
const apiUrl = import.meta.env.VITE_API_URL;
if (apiUrl) {
  const originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    let url = input;
    if (typeof input === 'string') {
      if (input.startsWith('/api/') || input.startsWith('/health')) {
        url = `${apiUrl}${input}`;
      }
    } else if (input instanceof URL) {
      if (input.pathname.startsWith('/api/') || input.pathname.startsWith('/health')) {
        url = `${apiUrl}${input.pathname}${input.search}`;
      }
    } else if (input && typeof input === 'object' && 'url' in input) {
      if (input.url.startsWith('/api/') || input.url.startsWith('/health')) {
        url = `${apiUrl}${input.url}`;
      }
    }
    return originalFetch(url, init);
  };
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
