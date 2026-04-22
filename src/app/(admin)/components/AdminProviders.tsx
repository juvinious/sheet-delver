'use client';

import React from 'react';
import { AdminAuthProvider } from '../context/AdminAuthContext';
import { AdminThemeProvider, useAdminTheme } from '../context/AdminThemeContext';

export default function AdminProviders({ children }: { children: React.ReactNode }) {
  return (
    <AdminThemeProvider>
      <AdminShell>
        <AdminAuthProvider>{children}</AdminAuthProvider>
      </AdminShell>
    </AdminThemeProvider>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const { theme } = useAdminTheme();

  return (
    <div className="admin-shell min-h-screen" data-admin-theme={theme}>
      {children}
    </div>
  );
}
