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
import { showWindow } from './window';

// Keep a global reference to prevent garbage collection
let tray: Tray | null = null;
let isCollecting = false;

export function createTray() {
  console.log('Creating tray...');
  
  try {
    // Don't create multiple instances
    if (tray !== null) {
      console.log('Tray already exists, returning existing instance');
      return tray;
    }

    // Load icon from assets
    console.log('Creating tray icon...');
    const iconPath = path.join(process.cwd(), 'assets', 'icon.png');
    console.log('Loading icon from:', iconPath);
    
    const icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      throw new Error(`Failed to load icon from path: ${iconPath}`);
    }
    
    // Resize for menu bar and set as template
    const trayIcon = icon.resize({ width: 16, height: 16 });
    trayIcon.setTemplateImage(true);
    
    console.log('Creating tray with icon...');
    tray = new Tray(trayIcon);
    
    // Create a simple menu
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Test Menu',
        click: () => console.log('Menu clicked')
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => app.quit()
      }
    ]);

    tray.setContextMenu(contextMenu);
    tray.setToolTip('Twitter Likes Archive');

    console.log('Tray creation complete');
    return tray;
  } catch (error) {
    console.error('Failed to create tray:', error);
    throw error;
  }
}
