import React from 'react';

const AdminDashboard = () => {
  return (
    <div>
      <h2 className="text-xl font-semibold text-zinc-800">Overview</h2>
      <p className="mt-2 text-zinc-600">
        Welcome to the admin dashboard. Here you can manage the application's content.
      </p>
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg border border-zinc-200">
          <h3 className="font-semibold text-lg text-zinc-800">Manage Topics</h3>
          <p className="mt-2 text-sm text-zinc-600">
            Create, edit, and delete topics to organize vocabulary sets by CEFR level.
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-zinc-200">
          <h3 className="font-semibold text-lg text-zinc-800">Manage Sets</h3>
          <p className="mt-2 text-sm text-zinc-600">
            Review, publish, and manage all vocabulary sets, both public and user-created.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
