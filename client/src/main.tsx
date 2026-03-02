import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@cloudscape-design/global-styles/index.css';
import { SessionsProvider } from './context/SessionsContext';
import { App } from './App';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <BrowserRouter>
        <SessionsProvider>
          <App />
        </SessionsProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}
