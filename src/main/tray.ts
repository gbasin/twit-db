import { Tray, Menu, app, nativeImage } from 'electron';
import path from 'path';
import { collectLikes } from './collection/collector';
import { showWindow } from './window';

let tray: Tray | null = null;

export function createTray() {
  if (tray !== null) {
    return tray;
  }

  try {
    // Use app.isPackaged to determine if we're in production
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath, 'assets', 'icon.png')
      : path.join(__dirname, '../../assets', 'icon.png');

    console.log('Loading tray icon from:', iconPath);
    
    const icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      throw new Error(`Failed to load icon from path: ${iconPath}`);
    }

    const trayIcon = icon.resize({ width: 16, height: 16 });
    trayIcon.setTemplateImage(true);

    tray = new Tray(trayIcon);
    tray.setToolTip('Twitter Likes Archive');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Dashboard',
        click: () => showWindow()
      },
      {
        label: 'Start Collection',
        click: () => collectLikes('incremental')
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => app.quit()
      }
    ]);

    tray.setContextMenu(contextMenu);
    console.log('Tray created successfully');
    return tray;
  } catch (error) {
    console.error('Failed to create tray:', error);
    // Create a fallback tray with default icon
    tray = new Tray(nativeImage.createEmpty());
    tray.setToolTip('Twitter Likes Archive (Error)');
    return tray;
  }
}