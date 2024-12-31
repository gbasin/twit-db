/**
 * Main entry point for the Electron application.
 * 
 * This file handles:
 * - Launching the main dashboard window (BrowserWindow)
 * - Setting up the system tray with context menu options
 * - Initializing the database on startup
 * - Managing application lifecycle events
 * 
 * The system tray provides quick access to:
 * - Opening/showing the dashboard
 * - Starting the likes collection process
 * - Quitting the application
 */

import { app } from 'electron';
import { createTray } from './tray';
import { initDatabase } from './storage/db';
import { createWindow, getMainWindow } from './window';

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// Wait for app to be ready
app.whenReady().then(async () => {
  try {
    console.log('App is ready, initializing...');
    
    // Create tray first, before anything else
    console.log('Creating tray...');
    const trayInstance = createTray();
    if (!trayInstance) {
      throw new Error('Failed to create tray');
    }
    console.log('Tray created successfully');
    
    // Initialize database
    await initDatabase();
    console.log('Database initialized');
    
    // Hide from dock on macOS since this is a menu bar app
    if (process.platform === 'darwin') {
      app.dock?.hide();
      console.log('Dock hidden on macOS');
    }
    
    // Create window last
    console.log('Creating window...');
    await createWindow();
    console.log('Window created');
    
    console.log('App initialization complete');
  } catch (error) {
    console.error('Failed to initialize app:', error);
    app.quit();
  }
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (getMainWindow() === null) {
    createWindow();
  }
});

// Clean up when quitting
app.on('before-quit', () => {
  console.log('App is quitting...');
});