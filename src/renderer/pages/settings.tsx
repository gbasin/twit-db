import React from 'react';

const Settings: React.FC = () => {
  return (
    <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-6">Settings</h2>

      {/* Collection Settings */}
      <section className="mb-8">
        <h3 className="text-lg font-semibold mb-4">Collection Settings</h3>
        {/* TODO: Implement collection interval settings */}
        {/* TODO: Implement browser profile selection */}
      </section>

      {/* Storage Settings */}
      <section className="mb-8">
        <h3 className="text-lg font-semibold mb-4">Storage Settings</h3>
        {/* TODO: Implement media storage path config */}
        {/* TODO: Implement database location settings */}
      </section>

      {/* Notification Settings */}
      <section className="mb-8">
        <h3 className="text-lg font-semibold mb-4">Notifications</h3>
        {/* TODO: Implement notification preferences */}
      </section>

      {/* Actions */}
      <section>
        <h3 className="text-lg font-semibold mb-4">Actions</h3>
        {/* TODO: Implement clear cache button */}
        {/* TODO: Implement export data options */}
      </section>
    </div>
  );
};

export default Settings; 