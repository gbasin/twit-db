import { app, ipcMain } from 'electron';
import { createTray } from './tray';
import { initDatabase, searchTweets, getMediaForTweet } from './storage/db';
import { createWindow } from './window';

// Register IPC handlers
function setupIPC() {
  ipcMain.handle('get-tweets', async (event, { query, filters }) => {
    try {
      return await searchTweets(query, filters);
    } catch (error) {
      console.error('Error getting tweets:', error);
      throw error;
    }
  });

  ipcMain.handle('start-collection', async (event, mode) => {
    // TODO: Implement collection status tracking
    return true;
  });

  ipcMain.handle('stop-collection', async () => {
    // TODO: Implement collection status tracking
    return true;
  });

  ipcMain.handle('get-stats', async () => {
    // TODO: Implement stats
    return {
      totalTweets: 0,
      lastCollection: null,
      isCollecting: false
    };
  });

  ipcMain.handle('get-media-for-tweet', async (event, tweetId) => {
    try {
      return await getMediaForTweet(tweetId);
    } catch (error) {
      console.error('Error getting media for tweet:', error);
      throw error;
    }
  });
}

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
    
    // Setup IPC handlers
    setupIPC();
    console.log('IPC handlers registered');
    
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