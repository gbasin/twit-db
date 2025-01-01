import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  getTweets: async (params: { query: string; filters: any }) => {
    return await ipcRenderer.invoke('get-tweets', params);
  },
  startCollection: async (mode: 'incremental' | 'historical') => {
    return await ipcRenderer.invoke('start-collection', mode);
  },
  stopCollection: async () => {
    return await ipcRenderer.invoke('stop-collection');
  },
  getSettings: async () => {
    return await ipcRenderer.invoke('get-settings');
  },
  updateSettings: async (settings: any) => {
    return await ipcRenderer.invoke('update-settings', settings);
  },
  getStats: async () => {
    return await ipcRenderer.invoke('get-stats');
  },
  getMediaForTweet: async (tweetId: string) => {
    return await ipcRenderer.invoke('get-media-for-tweet', tweetId);
  },
  getMediaData: async (filePath: string) => {
    return await ipcRenderer.invoke('get-media-data', filePath);
  },
  getThreadTweets: async (threadId: string) => {
    return await ipcRenderer.invoke('get-thread-tweets', threadId);
  }
});