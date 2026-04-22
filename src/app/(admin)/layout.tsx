import type { Metadata } from 'next';
import AdminProviders from './components/AdminProviders';

export const metadata: Metadata = {
  title: 'Admin',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminProviders>
      <div>
        {children}
      </div>
    </AdminProviders>
  );
}
