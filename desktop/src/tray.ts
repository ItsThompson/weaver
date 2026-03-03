import { Tray, Menu, app } from 'electron';
import { resolve } from 'node:path';

let tray: Tray | null = null;

export function createTray(onToggle: () => void): void {
  const iconPath = app.isPackaged
    ? resolve(process.resourcesPath, 'assets/tray-iconTemplate.png')
    : resolve(__dirname, '../assets/tray-iconTemplate.png');

  tray = new Tray(iconPath);
  tray.setToolTip('Weaver');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show/Hide', click: onToggle },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.exit(); } },
  ]));
  tray.on('click', onToggle);
}
