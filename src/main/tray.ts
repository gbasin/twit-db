import { Tray, Menu, app, nativeImage } from 'electron';
import path from 'path';
import { collectLikes } from './collection/collector';
import { showWindow } from './window';
import { existsSync } from 'fs';

let tray: Tray | null = null;

export function createTray() {
    if (tray !== null) {
        return tray;
    }

    try {
        // Get the absolute path to the assets directory
        const isDev = process.env.NODE_ENV === 'development';
        const assetsPath = isDev
            ? path.join(process.cwd(), 'assets')
            : app.isPackaged
                ? path.join(process.resourcesPath, 'assets')
                : path.join(app.getAppPath(), 'assets');

        const iconPath = path.join(assetsPath, 'icon.png');
        if (!existsSync(iconPath)) {
            throw new Error(`Icon file not found at ${iconPath}`);
        }

        const icon = nativeImage.createFromPath(iconPath);
        if (icon.isEmpty()) {
            throw new Error(`Failed to load icon from path: ${iconPath}`);
        }

        // Create smaller icon for macOS menu bar
        const trayIcon = process.platform === 'darwin'
            ? icon.resize({ width: 16, height: 16 })
            : icon;
        trayIcon.setTemplateImage(true);

        // Create the tray
        tray = new Tray(trayIcon);
        tray.setToolTip('Twitter Likes Archive');

        // Create the context menu
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

        // On macOS, clicking the tray icon shows the context menu
        if (process.platform === 'darwin') {
            tray.on('click', () => {
                tray?.popUpContextMenu();
            });
        }

        return tray;
    } catch (error) {
        console.error('Failed to create tray:', error);
        throw error;
    }
}