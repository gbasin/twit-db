interface Window {
  api: {
    getTweets: (params: { query: string; filters: any }) => Promise<any[]>;
    startCollection: (mode: 'incremental' | 'historical') => Promise<void>;
    stopCollection: () => Promise<void>;
    getSettings: () => Promise<any>;
    updateSettings: (settings: any) => Promise<void>;
    getStats: () => Promise<any>;
  }
} 