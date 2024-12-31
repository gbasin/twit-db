import React, { useEffect, useState } from 'react';

interface Tweet {
  id: string;
  text_content: string;
  author: string;
  liked_at: string;
  has_media: boolean;
  has_links: boolean;
}

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
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-8">Twitter Likes Archive</h1>
      
      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-2">Total Likes</h3>
          <p className="text-2xl">{tweets.length}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-2">Last Collection</h3>
          <p className="text-2xl">
            {tweets.length > 0 
              ? new Date(tweets[0].liked_at).toLocaleString()
              : 'Never'}
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-2">Collection Status</h3>
          <p className="text-2xl">Idle</p>
        </div>
      </div>

      {/* Search Section */}
      <div className="bg-white p-6 rounded-lg shadow mb-8">
        <div className="flex gap-4 mb-6">
          <input
            type="text"
            placeholder="Search tweets..."
            className="flex-1 p-2 border rounded"
          />
          <button className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
            Search
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-4">
          <select className="p-2 border rounded">
            <option value="">All Media Types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
            <option value="link">Links</option>
          </select>
          <input
            type="date"
            className="p-2 border rounded"
            placeholder="From Date"
          />
          <input
            type="date"
            className="p-2 border rounded"
            placeholder="To Date"
          />
        </div>
      </div>

      {/* Results Section */}
      <div className="bg-white p-6 rounded-lg shadow">
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
              <div key={tweet.id} className="border rounded p-4">
                <div className="flex justify-between mb-2">
                  <span className="font-semibold">{tweet.author}</span>
                  <span className="text-gray-500">
                    {new Date(tweet.liked_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-gray-800">{tweet.text_content}</p>
                <div className="mt-2 flex gap-2">
                  {tweet.has_media && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      Media
                    </span>
                  )}
                  {tweet.has_links && (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                      Links
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard; 