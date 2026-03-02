import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@cloudscape-design/global-styles/index.css';
import { applyMode, Mode } from '@cloudscape-design/global-styles';
import { SessionsProvider } from './context/SessionsContext';

applyMode(Mode.Dark);
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
