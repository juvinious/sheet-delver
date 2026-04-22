'use client';

import ModuleLifecycleControl from '../components/ModuleLifecycleControl';

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-gray-600 mb-8">System administration and lifecycle management</p>

        <div className="space-y-8">
          <section className="bg-white rounded-lg shadow p-6">
            <ModuleLifecycleControl />
          </section>
        </div>
      </div>
    </main>
  );
}
