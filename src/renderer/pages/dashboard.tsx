import React from 'react';

const Dashboard: React.FC = () => {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-8">Twitter Likes Archive</h1>
      
      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-2">Total Likes</h3>
          <p className="text-2xl">0</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-2">Last Collection</h3>
          <p className="text-2xl">Never</p>
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
        <div className="text-gray-500 text-center py-8">
          No tweets collected yet. Start collection from the menu bar icon.
        </div>
      </div>
    </div>
  );
};

export default Dashboard; 