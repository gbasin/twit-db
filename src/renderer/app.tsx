import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// TODO: Import pages once created
// import Dashboard from './pages/Dashboard';
// import Settings from './pages/Settings';

const App: React.FC = () => {
  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        {/* TODO: Add navigation component */}
        <main className="container mx-auto px-4 py-8">
          <Routes>
            {/* TODO: Implement routes */}
            {/* <Route path="/" element={<Dashboard />} /> */}
            {/* <Route path="/settings" element={<Settings />} /> */}
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App; 