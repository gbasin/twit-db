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

import { app, BrowserWindow, Tray, Menu, ipcMain } from 'electron';
import path from 'path';
import { initDatabase, searchTweets } from './storage/db';
import { collectLikes } from './collection/collector';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isCollecting = false;

// For demonstration, store in-memory settings
let appSettings = {
  notifications: {
    enabled: true,
    normal: true,
    critical: true,
  },
  collectionInterval: 60, // in minutes
  browserProfilePath: '/path/to/chrome/profile'
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
  });
  // Load React dev server or local build
  mainWindow.loadURL('http://localhost:3000');
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Dashboard',
      click: () => {
        if (!mainWindow) {
          createWindow();
        } else {
          mainWindow.show();
        }
      },
    },
    {
      label: 'Start Collection',
      click: () => {
        collectLikes('incremental');
      },
    },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]);
  tray.setToolTip('Twitter Likes Archive');
  tray.setContextMenu(contextMenu);
}

async function registerIpcHandlers() {
  // Handle tweet searching
  ipcMain.handle('get-tweets', async (_event, { query, filters }) => {
    return await searchTweets(query, filters);
  });

  // Start collection
  ipcMain.handle('start-collection', async (_event, mode) => {
    if (!isCollecting) {
      isCollecting = true;
      try {
        await collectLikes(mode);
      } finally {
        isCollecting = false;
      }
    }
    return true;
  });

  // Stop collection (simple placeholder)
  ipcMain.handle('stop-collection', async () => {
    // Not fully implemented, but you'd store a flag or forcibly close browser context
    // For now, let's just set isCollecting = false
    isCollecting = false;
    return true;
  });

  // Get settings
  ipcMain.handle('get-settings', async () => {
    return appSettings;
  });

  // Update settings
  ipcMain.handle('update-settings', async (_event, newSettings) => {
    appSettings = { ...appSettings, ...newSettings };
    return appSettings;
  });

  // Simple stats
  ipcMain.handle('get-stats', async () => {
    // Example: Just return random placeholders
    return {
      totalTweets: 1234,
      lastRun: new Date().toLocaleString(),
      collectionInterval: appSettings.collectionInterval
    };
  });
}

app.whenReady().then(async () => {
  await initDatabase();
  await registerIpcHandlers();
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});