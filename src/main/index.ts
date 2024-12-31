import { app } from 'electron';
import { createTray } from './tray';
import { initDatabase } from './storage/db';
import { createWindow } from './window';

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

app.whenReady().then(async () => {
  try {
    console.log('App is ready, initializing...');
    
    // Initialize database first
    await initDatabase();
    console.log('Database initialized');
    
    // Create tray
    const trayInstance = createTray();
    if (!trayInstance) {
      throw new Error('Failed to create tray');
    }
    console.log('Tray created successfully');
    
    // Create window
    await createWindow();
    console.log('Window created');
    
    // Hide dock on macOS only in production
    if (process.platform === 'darwin' && process.env.NODE_ENV !== 'development') {
      app.dock?.hide();
      console.log('Dock hidden on macOS (production mode)');
    }
    
    console.log('App initialization complete');
  } catch (error) {
    console.error('Failed to initialize app:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  createWindow();
});

app.on('before-quit', () => {
  console.log('App is quitting...');
});