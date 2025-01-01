import { app, ipcMain } from 'electron';
import { createTray } from './tray';
import { initDatabase, searchTweets, getMediaForTweet } from './storage/db';
import { createWindow } from './window';
import fs from 'fs/promises';
import { collectLikes } from './collection/collector';

// Collection state
let collectionState = {
  isCollecting: false,
  lastCollection: null as Date | null,
  error: null as string | null
};

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
    if (collectionState.isCollecting) {
      throw new Error('Collection already in progress');
    }

    // Start collection in background
    collectionState.isCollecting = true;
    collectionState.error = null;

    // Run collection in background
    collectLikes(mode)
      .then(() => {
        collectionState.lastCollection = new Date();
      })
      .catch(error => {
        console.error('Collection failed:', error);
        collectionState.error = error.message;
      })
      .finally(() => {
        collectionState.isCollecting = false;
      });

    // Return immediately to not block UI
    return true;
  });

  ipcMain.handle('stop-collection', async () => {
    collectionState.isCollecting = false;
    return true;
  });

  ipcMain.handle('get-stats', async () => {
    return {
      isCollecting: collectionState.isCollecting,
      lastCollection: collectionState.lastCollection,
      error: collectionState.error
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

  // Add media serving handler
  ipcMain.handle('get-media-data', async (event, filePath) => {
    try {
      // Verify file exists first
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      if (!exists) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Read file with timeout
      const readWithTimeout = new Promise<Buffer>(async (resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('File read timeout'));
        }, 3000); // 3 second timeout

        try {
          const buffer = await fs.readFile(filePath);
          clearTimeout(timeout);
          resolve(buffer);
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      });

      const buffer = await readWithTimeout;
      const extension = filePath.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = extension === 'mp4' ? 'video/mp4' : 
                      extension === 'gif' ? 'image/gif' : 
                      extension === 'png' ? 'image/png' : 
                      extension === 'webp' ? 'image/webp' : 
                      'image/jpeg';
      
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    } catch (error) {
      console.error('Error reading media file:', error);
      // Return a data URL for an error placeholder instead of throwing
      const errorSvg = `
        <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
          <rect width="100" height="100" fill="#fee2e2"/>
          <text x="50" y="50" font-family="Arial" font-size="10" text-anchor="middle" fill="#dc2626">
            Error Loading Media
          </text>
        </svg>
      `;
      return 'data:image/svg+xml;base64,' + Buffer.from(errorSvg, 'utf-8').toString('base64');
    }
  });

  // Add handler for getting thread tweets
  ipcMain.handle('get-thread-tweets', async (event, threadId) => {
    try {
      const { getThreadTweets } = await import('./storage/db');
      return await getThreadTweets(threadId);
    } catch (error) {
      console.error('Error getting thread tweets:', error);
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