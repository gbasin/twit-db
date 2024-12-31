import React from 'react';

const Dashboard: React.FC = () => {
  return (
    <div className="space-y-8">
      {/* Stats Section */}
      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold mb-4">Statistics</h2>
        {/* TODO: Implement stats grid */}
        {/* - Total tweets archived */}
        {/* - Last collection run */}
        {/* - Storage usage */}
      </section>

      {/* Search Section */}
      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold mb-4">Search</h2>
        {/* TODO: Implement search bar */}
        {/* TODO: Implement filters panel */}
        {/* TODO: Implement results grid */}
      </section>
    </div>
  );
};

export default Dashboard; 