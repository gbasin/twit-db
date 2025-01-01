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
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (hours < 24) {
    return `${hours}h`;
  }
  return date.toLocaleDateString();
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
        <div className="font-bold text-gray-900">{displayName}</div>
        {handle && <div className="text-gray-500">{handle}</div>}
        <span className="text-gray-500">·</span>
        <div className="text-gray-500">{formatTimestamp(new Date(tweet.liked_at))}</div>
      </div>

      {/* Tweet Content */}
      <div className="mb-3">
        <div className={`${!isExpanded && shouldTruncate ? 'line-clamp-4' : ''} text-gray-800`}>
          {tweet.text_content.split('\n\n').map((block, i) => (
            <p key={i} className="mb-2 last:mb-0">{block}</p>
          ))}
        </div>
        {shouldTruncate && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-blue-600 hover:text-blue-700 text-sm"
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
            <div className={`grid gap-2 ${media.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {media.map(item => (
                <div key={item.id} className="relative aspect-video">
                  {mediaData[item.id] ? (
                    item.mediaType === 'video' || item.mediaType === 'gif' ? (
                      <video
                        src={mediaData[item.id]}
                        controls={item.mediaType === 'video'}
                        autoPlay={item.mediaType === 'gif'}
                        loop={item.mediaType === 'gif'}
                        muted={item.mediaType === 'gif'}
                        className="w-full h-full object-cover rounded"
                      />
                    ) : (
                      <img
                        src={mediaData[item.id]}
                        alt="Tweet media"
                        className="w-full h-full object-cover rounded"
                        loading="lazy"
                      />
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
            <div className="flex items-center gap-1">
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
            <div className="flex items-center gap-1">
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

  useEffect(() => {
    loadTweets();
  }, []);

  const loadTweets = async () => {
    try {
      const results = await window.api.getTweets({ query: '', filters: {} });
      setTweets(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tweets');
    } finally {
      setIsLoading(false);
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
            {tweets.length > 0 
              ? formatTimestamp(new Date(tweets[0].liked_at))
              : 'Never'}
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold mb-2">Collection Status</h3>
          <p className="text-2xl">Idle</p>
        </div>
      </div>

      {/* Search Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm mb-8">
        <div className="flex gap-4 mb-6">
          <input
            type="text"
            placeholder="Search tweets..."
            className="flex-1 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
          <button className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors">
            Search
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <select className="p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
            <option value="">All Media Types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
            <option value="link">Links</option>
          </select>
          <input
            type="date"
            className="p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="From Date"
          />
          <input
            type="date"
            className="p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="To Date"
          />
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