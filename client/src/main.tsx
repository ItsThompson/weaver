import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@cloudscape-design/global-styles/index.css';
import { NotificationProvider } from './context/NotificationContext';
import { ActivityLogProvider } from './context/ActivityLogContext';
import { WindowProvider } from './context/WindowContext';
import { ComposeProviders } from './components/ComposeProviders';

import { App } from './App';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <BrowserRouter>
        <ComposeProviders providers={[ActivityLogProvider, NotificationProvider, WindowProvider]}>
          <App />
        </ComposeProviders>
      </BrowserRouter>
    </React.StrictMode>,
  );
}
