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

// src/main/index.ts
import { app, BrowserWindow, Tray, Menu } from 'electron';
import path from 'path';
import { initDatabase } from './storage/db';
import { collectLikes } from './collection/collector';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

async function createWindow() {
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

  await mainWindow.loadURL('http://localhost:3000'); // If running React dev server
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Dashboard',
      click: () => {
        if (!mainWindow) createWindow();
        else mainWindow.show();
      },
    },
    {
      label: 'Start Collection',
      click: () => collectLikes('incremental'),
    },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]);
  tray.setToolTip('Twitter Likes Archive');
  tray.setContextMenu(contextMenu);
}

app.whenReady().then(async () => {
  await initDatabase();
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});