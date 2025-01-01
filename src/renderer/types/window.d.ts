interface Window {
  api: {
    getTweets: (params: { query: string; filters: any }) => Promise<any[]>;
    startCollection: (mode: 'incremental' | 'historical') => Promise<void>;
    stopCollection: () => Promise<void>;
    getSettings: () => Promise<any>;
    updateSettings: (settings: any) => Promise<void>;
    getStats: () => Promise<any>;
    getMediaForTweet: (tweetId: string) => Promise<Array<{
      id: string;
      mediaType: string;
      localPath: string;
      originalUrl: string;
    }>>;
    getMediaData: (filePath: string) => Promise<string>;
    getThreadTweets: (threadId: string) => Promise<any[]>;
  }
} 