import { BrowserWindow } from 'electron';
import path from 'path';
import { net } from 'electron';

let mainWindow: BrowserWindow | null = null;

// Helper to check if dev server is ready
async function waitForDevServer(url: string, maxAttempts = 20): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      console.log(`Checking dev server (attempt ${i + 1}/${maxAttempts})...`);
      const request = net.request(url);
      const response = await new Promise<boolean>((resolve) => {
        request.on('response', () => resolve(true));
        request.on('error', () => resolve(false));
        request.end();
      });
      if (response) {
        console.log('Dev server is ready!');
        return true;
      }
    } catch (error) {
      console.log('Dev server not ready, retrying...');
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  console.log('Dev server failed to start after maximum attempts');
  return false;
}

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
    },
    show: false
  });

  const isDev = process.env.NODE_ENV === 'development';
  console.log(`Running in ${isDev ? 'development' : 'production'} mode`);

  try {
    if (isDev) {
      const devServerUrl = 'http://localhost:3000';
      console.log('Waiting for dev server to start...');
      const isDevServerReady = await waitForDevServer(devServerUrl);
      
      if (!isDevServerReady) {
        throw new Error('Dev server failed to start');
      }

      console.log('Loading dev server URL:', devServerUrl);
      await mainWindow.loadURL(devServerUrl);
      mainWindow.webContents.openDevTools();
    } else {
      const prodPath = path.join(__dirname, '../../dist/renderer/index.html');
      console.log('Loading production file:', prodPath);
      await mainWindow.loadFile(prodPath);
    }

    mainWindow.on('ready-to-show', () => {
      mainWindow?.show();
      mainWindow?.focus();
    });
  } catch (error) {
    console.error('Failed to load window:', error);
    if (mainWindow) {
      const errorHtml = `
        <html>
          <head>
            <title>Error</title>
            <style>
              body { font-family: sans-serif; padding: 2rem; }
              pre { background: #f0f0f0; padding: 1rem; border-radius: 4px; }
            </style>
          </head>
          <body>
            <h2>Failed to load app</h2>
            <pre>${error}</pre>
          </body>
        </html>
      `;
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
      mainWindow.show();
    }
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