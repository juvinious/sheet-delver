'use client';

import { useAdminTheme } from '../context/AdminThemeContext';

export default function AdminThemeToggle() {
  const { theme, toggleTheme } = useAdminTheme();
  const nextThemeLabel = theme === 'dark' ? 'Light' : 'Dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="rounded-full border border-[var(--admin-border-strong)] bg-[var(--admin-surface-strong)] px-3 py-2 text-sm font-semibold text-[var(--admin-text-primary)] shadow-[0_10px_30px_rgba(15,23,42,0.12)] transition hover:bg-[var(--admin-surface-hover)]"
      aria-label={`Switch admin theme to ${nextThemeLabel}`}
    >
      {nextThemeLabel} theme
    </button>
  );
}