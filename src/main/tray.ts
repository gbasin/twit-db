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

    // Create a simple template image (white for dark mode, black for light mode)
    console.log('Creating tray icon...');
    const icon = nativeImage.createFromDataURL(`
      data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAA
      7AAAAOwBeShxvQAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAMbSURBVFiF7ZZNiFZlGIav85kzX2M5
      kWNp5YyVFUVF9LNQUbSJFhUtahG0aGEQFAThIoKgIIiCaBG0CqJNi6BFPxRJRYWrMCIKKnTUyfxpxkYd52dmnJ5z3/feFm8Y
      zceM9tEmuuHhfTjnPtd9zvs8z3nhl3UBkO6Nfw8BVwKPAhNAL9AH9ACdQAZ8C3wGvA68B5zdDnB3RORuEZkWkTkROSMikyIy
      ISKnRWRWRGZFZFpEPhSRu0SkYzvAd4vI+yJSEZGSiEyJyBsi8qCIXC8ivSLSIyIDIjIkIveIyJiIlEWkKiLvisjAVoEfFpGK
      P/S0iDwuIt0t5naJyKiInBeRuoi8KiK7NgveLyIficgFEZkQkf2bAQbYLyKTIlITkQ9EpG8z4LeKyDkRmRORx0SkY6vAAHtF
      5FkRmReRT0VkaKPgz4hIXUQOi0jnVoEb1SkiR0SkIiLPrQc+IiJlEXlkO6CNOioiFRF5qt31D4pIVUQe2G7wBvyjIlITkQfb
      gR8UkXkROSYi2Q6AA3BURM6LyP524AURmRGRwzsEDsAREZkVkYPtwPMiMi0ig9n2KwOQAW8Bj7UT5VLgFLAHyG0zOEAOGAae
      BzpaJxSBk8DuXwE4gEFgHOhvnVAATgADvxJwH/Ay0NU6YRdwHOj9FYG7gVeA/a0TeoHXgJ2qQAC+Ap4E6q0TeoAvgKt+ZvhZ
      4BRwHFhuHV8CvgQGgVwz+JvAM0ClzcYV4DPgBmDbwGeBz4ETwELr+ArwKXA10JkBHwCPAYvtNi4Dp4HrgZ5NgM8BnwMngPnW
      8YvA+8BVQCED3gMeBxa22rgKfA3cDFzaBriAU8A4MNduwyrwDnAZ0JkBJ4HHgfntBG8CrwJvt44vA28DlwPdGfAp8ASw2G7j
      GvAtcBuw7jUFfgBOAjOt4xeBN4EraMSBDHgfeAQorLVxHfgeuBO4uA34PPAlMAYUWseLwOvAENCTAR8CTwHFtTauA98DdwGX
      /AB8ATgNvAQstI4vAa8BVwK9GfAR8DRQWmvjOnAGuBu4tAX8e+A54Fzr+DLwInAp0J8BHwPPAuW1Nv4f9A+gv2RzJHzWDwAA
      AABJRU5ErkJggg==
    `.replace(/\s/g, ''));
    
    console.log('Creating tray instance...');
    tray = new Tray(icon.resize({ width: 20, height: 20 }));
    
    // macOS specific settings
    if (process.platform === 'darwin') {
      console.log('Setting macOS specific settings...');
      tray.setIgnoreDoubleClickEvents(true);
      // Try to make the icon template (automatically handles dark/light mode)
      icon.setTemplateImage(true);
      tray.setImage(icon.resize({ width: 20, height: 20 }));
    }
    
    console.log('Setting tray title...');
    tray.setTitle(''); // Remove the text label since we have a clear icon
    
    console.log('Setting up tray menu...');
    function updateMenu() {
      const contextMenu = Menu.buildFromTemplate([
        {
          label: `Status: ${isCollecting ? 'Collecting...' : 'Idle'}`,
          enabled: false
        },
        { type: 'separator' },
        {
          label: 'Start Collection',
          click: async () => {
            if (!isCollecting) {
              console.log('Starting incremental collection...');
              isCollecting = true;
              updateMenu();
              try {
                await collectLikes('incremental');
              } finally {
                isCollecting = false;
                updateMenu();
              }
            }
          },
          enabled: !isCollecting
        },
        {
          label: 'Historical Collection',
          click: async () => {
            if (!isCollecting) {
              console.log('Starting historical collection...');
              isCollecting = true;
              updateMenu();
              try {
                await collectLikes('historical');
              } finally {
                isCollecting = false;
                updateMenu();
              }
            }
          },
          enabled: !isCollecting
        },
        { type: 'separator' },
        {
          label: 'Open Dashboard',
          click: () => {
            console.log('Opening dashboard...');
            showWindow();
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            console.log('Quitting app...');
            app.quit();
          }
        }
      ]);

      console.log('Setting tray context menu...');
      tray!.setContextMenu(contextMenu);
    }

    console.log('Setting tray tooltip...');
    tray!.setToolTip('Twitter Likes Archive');
    updateMenu();

    console.log('Tray creation complete');
    return tray;
  } catch (error) {
    console.error('Failed to create tray:', error);
    throw error;
  }
}
