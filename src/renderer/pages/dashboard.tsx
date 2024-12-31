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
  const shouldTruncate = tweet.text_content.length > 280;

  // Parse author info
  const [displayName, handle] = tweet.author.split(/(@\w+)/).filter(Boolean);

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
      {/* Author Info */}
      <div className="flex items-center gap-2 mb-2">
        <div>
          <span className="font-bold text-gray-900">{displayName}</span>
          {handle && <span className="text-gray-500 ml-1">{handle}</span>}
        </div>
        <span className="text-gray-500">·</span>
        <div className="text-gray-500">
          {formatTimestamp(new Date(tweet.liked_at))}
        </div>
      </div>

      {/* Tweet Content */}
      <div className="mb-3">
        <div className={`text-gray-900 ${!isExpanded && shouldTruncate ? 'line-clamp-4' : ''}`}>
          {tweet.text_content.split('\n\n').map((block, i) => (
            <p key={i} className="mb-2 last:mb-0">
              {block}
            </p>
          ))}
        </div>
        {shouldTruncate && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-blue-500 hover:text-blue-600 text-sm mt-1"
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      {/* Media Preview */}
      {tweet.has_media && (
        <div className="relative w-full h-48 mb-3 rounded-lg overflow-hidden bg-gray-100">
          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <div className="flex items-center gap-4">
          {tweet.has_media && (
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Media
            </div>
          )}
          {tweet.has_links && (
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Links
            </div>
          )}
        </div>
        <button 
          onClick={() => window.open(`https://twitter.com/i/status/${tweet.id}`, '_blank')}
          className="text-blue-500 hover:text-blue-600"
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