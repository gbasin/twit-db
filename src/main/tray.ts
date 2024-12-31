/**
 * 
 * This module is responsible for:
 * 
 * - Managing the system tray icon
 * - Creating and updating the tray context menu
 * - Handling tray-related actions including:
 *   - Starting/stopping data collection
 *   - Opening the dashboard
 *   - Quitting the application
 */

import { Tray, Menu, app, nativeImage } from 'electron';
import path from 'path';
import { collectLikes } from './collection/collector';

// Keep a global reference to prevent garbage collection
let tray: Tray | null = null;
let isCollecting = false;

export function createTray() {
  // Don't create multiple instances
  if (tray !== null) {
    return tray;
  }

  // Create a 22x22 black icon (standard menu bar size on macOS)
  const icon = nativeImage.createFromDataURL(`data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAApgAAAKYB3X3/OAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAB7SURBVEiJ7ZNBCsAgDATXvvT/f8mDPdRAKWqiPbQDew2YHSWKqKqISKwR2GYVcFBfJ/Tz5QzAA9C9BOtLFZ0DuIl6/TGtKgDJCr1SZZXWXxpbAXOBzuBXwGxgGvwPYCqYBk8DU8FQPxLwdlHrUHn2yR7qXMEEp4pL6A0RCyZcjL4gjwAAAABJRU5ErkJggg==`);
  
  tray = new Tray(icon.resize({ width: 22, height: 22 }));
  tray.setTitle('T'); // Add a text label next to the icon on macOS
  
  function updateMenu() {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: `Status: ${isCollecting ? 'Collecting...' : 'Idle'}`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Start Collection',
        click: async () => {
          if (!isCollecting) {
            isCollecting = true;
            updateMenu();
            try {
              await collectLikes('incremental');
            } finally {
              isCollecting = false;
              updateMenu();
            }
          }
        },
        enabled: !isCollecting
      },
      {
        label: 'Historical Collection',
        click: async () => {
          if (!isCollecting) {
            isCollecting = true;
            updateMenu();
            try {
              await collectLikes('historical');
            } finally {
              isCollecting = false;
              updateMenu();
            }
          }
        },
        enabled: !isCollecting
      },
      { type: 'separator' },
      {
        label: 'Open Dashboard',
        click: () => {
          // TODO: Implement dashboard window
          console.log('Dashboard not implemented yet');
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => app.quit()
      }
    ]);

    tray!.setContextMenu(contextMenu);
  }

  tray!.setToolTip('Twitter Likes Archive');
  updateMenu();

  return tray;
}
