import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    // Database Operations
    getTweets: async (query: string) => {
      // TODO: Implement tweet search/retrieval
      return await ipcRenderer.invoke('get-tweets', query);
    },
    
    // Collection Control
    startCollection: async (mode: 'incremental' | 'historical') => {
      // TODO: Implement collection start
      return await ipcRenderer.invoke('start-collection', mode);
    },
    
    stopCollection: async () => {
      // TODO: Implement collection stop
      return await ipcRenderer.invoke('stop-collection');
    },
    
    // Settings Management
    getSettings: async () => {
      // TODO: Implement settings retrieval
      return await ipcRenderer.invoke('get-settings');
    },
    
    updateSettings: async (settings: any) => {
      // TODO: Implement settings update
      return await ipcRenderer.invoke('update-settings', settings);
    },
    
    // Stats and Status
    getStats: async () => {
      // TODO: Implement stats retrieval
      return await ipcRenderer.invoke('get-stats');
    }
  }
); 