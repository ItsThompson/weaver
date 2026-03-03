import { app, globalShortcut } from 'electron';
import http from 'node:http';
import { DEFAULT_CONFIG, type WeaverConfig } from '@weaver/shared/types';
import * as server from './server';
import { createWindow, toggleWindow, showWindow, setGhostMode } from './window';
import { createTray } from './tray';

let currentConfig: WeaverConfig = { ...DEFAULT_CONFIG };

function fetchConfig(baseUrl: string): Promise<WeaverConfig> {
  return new Promise((resolve) => {
    http.get(`${baseUrl}/api/config`, (res) => {
      let body = '';
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve((JSON.parse(body) as { config: WeaverConfig }).config);
        } catch {
          resolve({ ...DEFAULT_CONFIG });
        }
      });
    }).on('error', () => resolve({ ...DEFAULT_CONFIG }));
  });
}

function putConfig(baseUrl: string, config: WeaverConfig): void {
  const data = JSON.stringify(config);
  const req = http.request(`${baseUrl}/api/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
  });
  req.on('error', () => {});
  req.end(data);
}

app.on('ready', async () => {
  if (app.dock) app.dock.hide();

  server.killPortOccupant();
  server.start();

  try {
    await server.waitForReady();
  } catch {
    console.error('Could not connect to server');
    app.exit(1);
    return;
  }

  currentConfig = await fetchConfig(server.SERVER_URL);

  createWindow(server.SERVER_URL, currentConfig);
  createTray(toggleWindow, () => {
    currentConfig.ghost_mode = !currentConfig.ghost_mode;
    setGhostMode(currentConfig.ghost_mode, currentConfig.ghost_opacity);
    putConfig(server.SERVER_URL, currentConfig);
    return currentConfig.ghost_mode;
  });
  globalShortcut.register('F5', toggleWindow);
  showWindow();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  server.stop();
});

app.on('window-all-closed', () => {
  // No-op: keep app alive via tray
});
