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

app.whenReady().then(async () => {
  try {
    // Initialize database
    await initDatabase();
    
    // Create tray
    createTray();
    
    app.dock?.hide(); // Hide from dock on macOS since this is a menu bar app
  } catch (error) {
    console.error('Failed to initialize app:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Keep the app running even when all windows are closed
  // We're a menu bar app, so we only quit when the user explicitly chooses to
});

// Quit when all windows are closed, except on macOS
app.on('before-quit', () => {
  // Clean up any background processes or connections here
});