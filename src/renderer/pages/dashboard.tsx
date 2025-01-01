import React, { useEffect, useState } from 'react';

interface Tweet {
  id: string;
  text_content: string;
  author: string;
  display_name: string;
  handle: string;
  created_at: string;
  like_order: number;
  has_media: boolean;
  has_links: boolean;
  html: string;
  metrics: {
    replies: string;
    retweets: string;
    likes: string;
    views: string;
  };
  links: Array<{
    originalUrl: string;
    resolvedUrl: string;
  }>;
  in_reply_to_id?: string;
  conversation_id?: string;
  is_thread_start?: boolean;
  thread_length?: number;
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
  const now = new Date();
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
  
  if (diffInHours < 24) {
    // For tweets less than 24h old, show relative time
    if (diffInHours < 1) {
      const minutes = Math.floor(diffInHours * 60);
      return `${minutes}m`;
    }
    return `${Math.floor(diffInHours)}h`;
  } else if (diffInHours < 24 * 7) {
    // For tweets less than a week old, show days
    return `${Math.floor(diffInHours / 24)}d`;
  } else {
    // For older tweets, show the date
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }
}

const ThreadView: React.FC<{ tweet: Tweet }> = ({ tweet }) => {
  const [threadTweets, setThreadTweets] = useState<Tweet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadThreadTweets = async () => {
      if (!tweet.is_thread_start) {
        console.log('ThreadView: Not a thread start tweet', { 
          tweetId: tweet.id, 
          is_thread_start: tweet.is_thread_start,
          thread_length: tweet.thread_length 
        });
        return;
      }
      
      console.log('ThreadView: Loading thread tweets', { 
        threadId: tweet.id,
        expectedLength: tweet.thread_length
      });
      
      setIsLoading(true);
      try {
        const tweets = await window.api.getThreadTweets(tweet.id);
        console.log('ThreadView: Loaded thread tweets', {
          threadId: tweet.id,
          loadedTweets: tweets.length,
          tweets: tweets.map(t => ({ 
            id: t.id, 
            position: t.thread_position,
            author: t.author
          }))
        });
        setThreadTweets(tweets);
      } catch (err) {
        console.error('ThreadView: Failed to load thread', {
          threadId: tweet.id,
          error: err
        });
        setError(err instanceof Error ? err.message : 'Failed to load thread');
      } finally {
        setIsLoading(false);
      }
    };

    loadThreadTweets();
  }, [tweet.id]);

  if (!tweet.is_thread_start) return null;
  if (isLoading) return <div className="text-gray-500">Loading thread...</div>;
  if (error) return <div className="text-red-500">{error}</div>;

  return (
    <div className="mt-4 space-y-4">
      <div className="border-l-2 border-blue-200 pl-4 space-y-4">
        {threadTweets.slice(1).map((threadTweet) => (
          <div key={threadTweet.id} className="relative">
            <div className="absolute -left-4 top-0 w-2 h-2 bg-blue-200 rounded-full"></div>
            <TweetCard tweet={threadTweet} isThreadItem />
          </div>
        ))}
      </div>
    </div>
  );
};

const TweetCard: React.FC<{ tweet: Tweet; isThreadItem?: boolean }> = ({ tweet, isThreadItem = false }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [media, setMedia] = useState<Media[]>([]);
  const [mediaData, setMediaData] = useState<Record<string, string>>({});
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const shouldTruncate = tweet.text_content.length > 280;

  // Extract display name and handle from author string
  const authorParts = tweet.author.match(/^(.*?)(@[\w]+)?$/);
  const displayName = authorParts?.[1]?.trim() || tweet.author;
  const handle = authorParts?.[2]?.trim() || '';

  // Clean up text content by removing trailing metrics
  const cleanedText = tweet.text_content
    .replace(/\n+[0-9]+(\n+[0-9]+)*\s*$/, '') // Remove trailing numbers/metrics
    .replace(/\n+[0-9]+\s+[0-9]+\s*$/, '') // Remove engagement numbers
    .replace(/\n{3,}/g, '\n\n') // Normalize multiple newlines
    .trim();

  // Convert text with clickable links
  const textWithLinks = () => {
    let lastIndex = 0;
    const parts = [];
    const linkPattern = /https?:\/\/[^\s)]+/g;
    let match;

    while ((match = linkPattern.exec(cleanedText)) !== null) {
      // Add text before the link
      if (match.index > lastIndex) {
        parts.push(cleanedText.slice(lastIndex, match.index));
      }
      // Add the link as a clickable element
      parts.push(
        <a
          key={match.index}
          href={match[0]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-700"
        >
          {match[0]}
        </a>
      );
      lastIndex = linkPattern.lastIndex;
    }
    // Add remaining text after last link
    if (lastIndex < cleanedText.length) {
      parts.push(cleanedText.slice(lastIndex));
    }
    return parts;
  };

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
    <div className={`border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors shadow-sm ${
      isThreadItem ? 'border-l-0 rounded-l-none' : ''
    }`}>
      {/* Author */}
      <div className="flex items-center gap-2 mb-2">
        <div className="font-bold text-gray-900">{displayName}</div>
        {handle && <div className="text-gray-500">{handle}</div>}
        <span className="text-gray-500">·</span>
        <div 
          className="text-gray-500"
          title={new Date(tweet.created_at).toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          })}
        >
          {formatTimestamp(new Date(tweet.created_at))}
        </div>
        {tweet.is_thread_start && (
          <div className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
            Thread ({tweet.thread_length} tweets)
          </div>
        )}
      </div>

      {/* Tweet Content */}
      <div className="mb-3">
        <div 
          className={`${!isExpanded && shouldTruncate ? 'line-clamp-4' : ''} text-gray-800 whitespace-pre-wrap`}
        >
          {textWithLinks()}
        </div>
        {shouldTruncate && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-blue-600 hover:text-blue-700 text-sm mt-1"
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      {/* Links Section */}
      {tweet.links && tweet.links.length > 0 && (
        <div className="mb-3">
          <div className="flex flex-col gap-2">
            {tweet.links.map((link, index) => (
              <div key={index} className="text-sm">
                <a
                  href={link.resolvedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 block truncate"
                >
                  {link.resolvedUrl}
                </a>
                {link.originalUrl !== link.resolvedUrl && (
                  <div className="text-gray-500 text-xs truncate">
                    Short URL: {link.originalUrl}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Thread View */}
      {!isThreadItem && <ThreadView tweet={tweet} />}

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
          {tweet.links && tweet.links.length > 0 && (
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
        <div className="flex items-center gap-4">
          {/* Engagement Metrics */}
          {tweet.metrics && (
            <>
              <div className="flex items-center gap-1" title="Replies">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                {formatNumber(parseInt(tweet.metrics.replies))}
              </div>
              <div className="flex items-center gap-1" title="Retweets">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                {formatNumber(parseInt(tweet.metrics.retweets))}
              </div>
              <div className="flex items-center gap-1" title="Likes">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                {formatNumber(parseInt(tweet.metrics.likes))}
              </div>
              <div className="flex items-center gap-1" title="Views">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                {formatNumber(parseInt(tweet.metrics.views))}
              </div>
            </>
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