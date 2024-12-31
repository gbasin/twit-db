import React, { useState } from 'react';

interface SearchFilters {
  dateRange?: { start: Date; end: Date };
  hasMedia?: boolean;
  hasLinks?: boolean;
  author?: string;
}

const Search: React.FC = () => {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({});
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async () => {
    setIsLoading(true);
    try {
      // TODO: Call the preload API to search tweets
      const searchResults = await window.api.getTweets({
        query,
        filters,
      });
      setResults(searchResults);
    } catch (error) {
      console.error('Search failed:', error);
      // TODO: Show error notification
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Input */}
      <div className="flex gap-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tweets..."
          className="flex-1 px-4 py-2 rounded-lg border"
        />
        <button
          onClick={handleSearch}
          disabled={isLoading}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg"
        >
          {isLoading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Filters Panel */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-semibold mb-4">Filters</h3>
        {/* TODO: Implement date range picker */}
        {/* TODO: Implement media/links toggles */}
        {/* TODO: Implement author filter */}
      </div>

      {/* Results */}
      <div className="bg-white rounded-lg shadow">
        {results.length > 0 ? (
          <div className="divide-y">
            {/* TODO: Implement tweet result cards */}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            {query ? 'No results found' : 'Enter a search query to begin'}
          </div>
        )}
      </div>
    </div>
  );
};

export default Search; 