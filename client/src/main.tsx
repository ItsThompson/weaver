import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@cloudscape-design/global-styles/index.css';
import { NotificationProvider } from './context/NotificationContext';
import { WindowProvider } from './context/WindowContext';

import { App } from './App';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <BrowserRouter>
        <NotificationProvider>
          <WindowProvider>
            <App />
          </WindowProvider>
        </NotificationProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}
