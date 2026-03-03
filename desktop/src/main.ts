import { app, BrowserWindow, globalShortcut, Tray, Menu } from 'electron';
import { fork, ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import http from 'node:http';

const SERVER_PORT = 8143;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverProcess: ChildProcess | null = null;

const isPacked = app.isPackaged;
const resourcesPath = isPacked
  ? resolve(process.resourcesPath, 'server')
  : resolve(__dirname, '../../server');

function startServer(): ChildProcess {
  const serverEntry = resolve(resourcesPath, 'dist/index.js');
  const env = { ...process.env };
  if (isPacked) {
    env.WEAVER_CLIENT_DIST = resolve(process.resourcesPath, 'client/dist');
  }
  const child = fork(serverEntry, [], { stdio: 'ignore', env });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Server exited with code ${code}`);
    }
  });
  return child;
}

function waitForServer(retries = 30): Promise<void> {
  return new Promise((resolve, reject) => {
    const attempt = (remaining: number) => {
      http.get(`${SERVER_URL}/api/health`, (res) => {
        if (res.statusCode === 200) return resolve();
        retry(remaining);
      }).on('error', () => retry(remaining));
    };

    const retry = (remaining: number) => {
      if (remaining <= 0) return reject(new Error('Server failed to start'));
      setTimeout(() => attempt(remaining - 1), 200);
    };

    attempt(retries);
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 900,
    height: 600,
    show: false,
    alwaysOnTop: false,
    titleBarStyle: 'hidden',
    skipTaskbar: true,
    type: 'panel',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  window.loadURL(SERVER_URL);

  window.on('close', (e) => {
    e.preventDefault();
    window.hide();
  });

  return window;
}

function toggleWindow(): void {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
  } else {
    win.show();
    win.focus();
  }
}

function createTray(): Tray {
  const iconPath = isPacked
    ? resolve(process.resourcesPath, 'assets/tray-iconTemplate.png')
    : resolve(__dirname, '../assets/tray-iconTemplate.png');
  const newTray = new Tray(iconPath);
  newTray.setToolTip('Weaver');
  newTray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show/Hide', click: toggleWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.exit(); } },
  ]));
  newTray.on('click', toggleWindow);
  return newTray;
}

app.on('ready', async () => {
  if (app.dock) app.dock.hide();

  serverProcess = startServer();

  try {
    await waitForServer();
  } catch {
    console.error('Could not connect to server');
    app.exit(1);
    return;
  }

  win = createWindow();
  tray = createTray();

  globalShortcut.register('F5', toggleWindow);

  win.show();
  win.focus();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (serverProcess) serverProcess.kill();
});

app.on('window-all-closed', () => {
  // No-op: keep app alive via tray
});
