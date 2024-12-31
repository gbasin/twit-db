import { BrowserWindow } from 'electron';
import path from 'path';

// Keep a global reference of the window object
let mainWindow: BrowserWindow | null = null;

// Create the browser window
export async function createWindow() {
  if (mainWindow !== null) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js')
    }
  });

  // Load the app
  try {
    // During development (npm run dev), always use the dev server
    const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
    console.log('Development mode:', isDev);
    
    if (isDev) {
      console.log('Loading app from dev server...');
      await mainWindow.loadURL('http://localhost:3000');
      mainWindow.webContents.openDevTools();
    } else {
      console.log('Loading app from built files...');
      await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }
  } catch (error) {
    console.error('Failed to load window:', error);
    throw error;
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

export function getMainWindow() {
  return mainWindow;
}

export function showWindow() {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
} 