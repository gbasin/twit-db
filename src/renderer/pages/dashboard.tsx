import React, { useEffect, useState } from 'react';

interface Tweet {
  id: string;
  text_content: string;
  author: string;
  liked_at: string;
  has_media: boolean;
  has_links: boolean;
  html: string;
}

interface Media {
  id: string;
  mediaType: string;
  localPath: string;
  originalUrl: string;
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

function formatTimestamp(date: Date): string {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

const TweetCard: React.FC<{ tweet: Tweet }> = ({ tweet }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [media, setMedia] = useState<Media[]>([]);
  const [mediaData, setMediaData] = useState<Record<string, string>>({});
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const shouldTruncate = tweet.text_content.length > 280;

  // Parse author string -> displayName, handle
  const [displayName, handle] = tweet.author.split(/(@\w+)/).filter(Boolean);

  useEffect(() => {
    if (tweet.has_media) {
      setIsLoadingMedia(true);
      
      // First get the media items
      window.api.getMediaForTweet(tweet.id)
        .then(async mediaItems => {
          setMedia(mediaItems);
          
          // Load media data sequentially instead of all at once
          const mediaDataMap: Record<string, string> = {};
          for (const item of mediaItems) {
            try {
              // Add a timeout to each media load
              const mediaDataPromise = window.api.getMediaData(item.localPath);
              const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Media load timeout')), 5000);
              });
              
              const mediaData = await Promise.race([mediaDataPromise, timeoutPromise]);
              mediaDataMap[item.id] = mediaData as string;
              // Update state incrementally as each media loads
              setMediaData(current => ({...current, [item.id]: mediaData as string}));
            } catch (error) {
              console.error(`Failed to load media ${item.id}:`, error);
              // Continue with other media items even if one fails
            }
          }
        })
        .catch(error => {
          console.error('Failed to load media metadata:', error);
        })
        .finally(() => {
          setIsLoadingMedia(false);
        });
    }
  }, [tweet.id]);

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors shadow-sm">
      {/* Author */}
      <div className="flex items-center gap-2 mb-2">
        <div className="font-bold text-gray-900" title="Display Name">{displayName}</div>
        {handle && <div className="text-gray-500" title="Twitter Handle">{handle}</div>}
        <span className="text-gray-500">·</span>
        <div className="text-gray-500" title="When you liked this tweet">
          {formatTimestamp(new Date(tweet.liked_at))}
        </div>
      </div>

      {/* Tweet Content */}
      <div className="mb-3">
        <div 
          className={`${!isExpanded && shouldTruncate ? 'line-clamp-4' : ''} text-gray-800`}
          title={shouldTruncate && !isExpanded ? "Click 'Show more' to see full text" : undefined}
        >
          {tweet.text_content.split('\n\n').map((block, i) => (
            <p key={i} className="mb-2 last:mb-0">{block}</p>
          ))}
        </div>
        {shouldTruncate && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-blue-600 hover:text-blue-700 text-sm"
            title={isExpanded ? "Collapse tweet text" : "Show full tweet text"}
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      {/* Media Preview */}
      {tweet.has_media && (
        <div className="mb-3">
          {isLoadingMedia ? (
            <div className="flex items-center justify-center h-40 bg-gray-100 rounded animate-pulse">
              <span className="text-gray-500">Loading media...</span>
            </div>
          ) : media.length > 0 ? (
            <div className={`grid gap-2 ${
              media.length === 1 ? 'grid-cols-1' : 
              media.length === 2 ? 'grid-cols-2' :
              media.length === 3 ? 'grid-cols-2' :
              'grid-cols-2'
            }`}>
              {media.map((item, index) => (
                <div 
                  key={item.id} 
                  className={`relative ${
                    // For 3 items, make the first one full width
                    media.length === 3 && index === 0 ? 'col-span-2' : ''
                  } ${
                    // Adjust aspect ratio based on media type and count
                    media.length === 1 ? 'aspect-video' :
                    media.length === 2 ? 'aspect-square' :
                    media.length === 3 && index === 0 ? 'aspect-[2/1]' :
                    'aspect-square'
                  }`}
                  title={`${item.mediaType} from tweet`}
                >
                  {mediaData[item.id] ? (
                    item.mediaType === 'video' || item.mediaType === 'gif' ? (
                      <video
                        src={mediaData[item.id]}
                        controls={item.mediaType === 'video'}
                        autoPlay={item.mediaType === 'gif'}
                        loop={item.mediaType === 'gif'}
                        muted={item.mediaType === 'gif'}
                        className="w-full h-full object-contain bg-black rounded"
                        title={item.mediaType === 'video' ? 'Click to play video' : 'Animated GIF'}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-black rounded overflow-hidden">
                        <img
                          src={mediaData[item.id]}
                          alt="Tweet media"
                          className="max-w-full max-h-full object-contain hover:opacity-90 transition-opacity cursor-zoom-in"
                          loading="lazy"
                          title="Click to view full size"
                          onClick={() => {
                            // Open the media data URL directly in a new window
                            const win = window.open('', '_blank');
                            if (win) {
                              win.document.write(`
                                <html>
                                  <head>
                                    <title>Media View</title>
                                    <style>
                                      body {
                                        margin: 0;
                                        padding: 0;
                                        display: flex;
                                        justify-content: center;
                                        align-items: center;
                                        min-height: 100vh;
                                        background: #000;
                                      }
                                      img {
                                        max-width: 100%;
                                        max-height: 100vh;
                                        object-fit: contain;
                                      }
                                    </style>
                                  </head>
                                  <body>
                                    <img src="${mediaData[item.id]}" alt="Full size media" />
                                  </body>
                                </html>
                              `);
                            }
                          }}
                        />
                      </div>
                    )
                  ) : (
                    <div className="w-full h-full bg-gray-100 rounded flex items-center justify-center">
                      <span className="text-gray-500">Failed to load media</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <div className="flex items-center gap-4">
          {tweet.has_media && (
            <div className="flex items-center gap-1" title="This tweet contains media attachments">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01
                  M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              Media
            </div>
          )}
          {tweet.has_links && (
            <div className="flex items-center gap-1" title="This tweet contains external links">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4
                  4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656
                  0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
              Links
            </div>
          )}
        </div>
        <button 
          onClick={() => window.open(`https://twitter.com/i/status/${tweet.id}`, '_blank')}
          className="text-blue-600 hover:text-blue-700"
          title="Open original tweet on Twitter"
        >
          View on Twitter
        </button>
      </div>
    </div>
  );
};

const Dashboard: React.FC = () => {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    isCollecting: boolean;
    lastCollection: string | null;
    error: string | null;
  }>({
    isCollecting: false,
    lastCollection: null,
    error: null
  });

  // Poll for stats while collection is in progress
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;

    if (stats.isCollecting) {
      pollInterval = setInterval(async () => {
        try {
          const newStats = await window.api.getStats();
          setStats(newStats);
          
          // If collection just finished, refresh tweets
          if (stats.isCollecting && !newStats.isCollecting) {
            loadTweets();
          }
        } catch (error) {
          console.error('Failed to get stats:', error);
        }
      }, 1000);
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [stats.isCollecting]);

  // Load initial stats
  useEffect(() => {
    window.api.getStats().then(setStats).catch(console.error);
  }, []);

  const loadTweets = async () => {
    try {
      setIsLoading(true);
      const results = await window.api.getTweets({ query: '', filters: {} });
      setTweets(results);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tweets');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTweets();
  }, []);

  const startCollection = async (mode: 'incremental' | 'historical') => {
    try {
      await window.api.startCollection(mode);
      const newStats = await window.api.getStats();
      setStats(newStats);
    } catch (error) {
      console.error('Failed to start collection:', error);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Twitter Likes Archive</h1>
      
      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold mb-2">Total Likes</h3>
          <p className="text-2xl">{tweets.length}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold mb-2">Last Collection</h3>
          <p className="text-2xl">
            {stats.lastCollection 
              ? formatTimestamp(new Date(stats.lastCollection))
              : 'Never'}
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold mb-2">Collection Status</h3>
          <p className="text-2xl">
            {stats.isCollecting ? (
              <span className="text-blue-500">Collecting...</span>
            ) : stats.error ? (
              <span className="text-red-500">Error</span>
            ) : (
              <span>Idle</span>
            )}
          </p>
          {stats.error && (
            <p className="text-sm text-red-500 mt-2">{stats.error}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white p-6 rounded-lg shadow-sm mb-8">
        <div className="flex gap-4">
          <button
            onClick={() => startCollection('incremental')}
            disabled={stats.isCollecting}
            className={`px-4 py-2 rounded-lg ${
              stats.isCollecting
                ? 'bg-gray-200 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            {stats.isCollecting ? 'Collecting...' : 'Start Collection'}
          </button>
          <button
            onClick={loadTweets}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Results Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Recent Likes</h2>
        {isLoading ? (
          <div className="text-gray-500 text-center py-8">Loading tweets...</div>
        ) : error ? (
          <div className="text-red-500 text-center py-8">{error}</div>
        ) : tweets.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            No tweets collected yet. Start collection from the menu bar icon.
          </div>
        ) : (
          <div className="space-y-4">
            {tweets.map(tweet => (
              <TweetCard key={tweet.id} tweet={tweet} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard; 