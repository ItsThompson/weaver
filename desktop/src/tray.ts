import { Tray, Menu, app } from 'electron';
import { resolve } from 'node:path';

let tray: Tray | null = null;

export function createTray(
  onToggle: () => boolean,
  isVisible: () => boolean,
  onGhostToggle: () => boolean,
  isGhost: () => boolean,
  onMiniToggle: () => void,
  isMini: () => boolean,
): void {
  const iconPath = app.isPackaged
    ? resolve(process.resourcesPath, 'assets/tray-iconTemplate.png')
    : resolve(__dirname, '../assets/tray-iconTemplate.png');

  tray = new Tray(iconPath);
  tray.setToolTip('Weaver');

  const buildMenu = () => Menu.buildFromTemplate([
    { label: 'Show/Hide', type: 'checkbox', checked: isVisible(), click: (menuItem) => {
      const nowVisible = onToggle();
      menuItem.checked = nowVisible;
    }},
    { label: 'Ghost Mode', type: 'checkbox', checked: isGhost(), click: (menuItem) => {
      const nowEnabled = onGhostToggle();
      menuItem.checked = nowEnabled;
    }},
    { label: 'Mini Mode', type: 'checkbox', checked: isMini(), click: () => {
      onMiniToggle();
    }},
    { type: 'separator' },
    { label: 'Quit', click: () => { app.exit(); } },
  ]);

  tray.on('click', () => { tray?.popUpContextMenu(buildMenu()); });
}
