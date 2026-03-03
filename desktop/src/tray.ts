import { Tray, Menu, app } from 'electron';
import { resolve } from 'node:path';

let tray: Tray | null = null;

export function createTray(onToggle: () => void, onGhostToggle: () => boolean): void {
  const iconPath = app.isPackaged
    ? resolve(process.resourcesPath, 'assets/tray-iconTemplate.png')
    : resolve(__dirname, '../assets/tray-iconTemplate.png');

  tray = new Tray(iconPath);
  tray.setToolTip('Weaver');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show/Hide', click: onToggle },
    { label: 'Ghost Mode', type: 'checkbox', checked: false, click: (menuItem) => {
      const nowEnabled = onGhostToggle();
      menuItem.checked = nowEnabled;
    }},
    { type: 'separator' },
    { label: 'Quit', click: () => { app.exit(); } },
  ]));
  tray.on('click', onToggle);
}
