'use client';

/**
 * AdminSidebar
 *
 * Persistent left-hand navigation for the admin control plane (ADR-0030 UX-3).
 * Rendered once in the authenticated layout shell; shows active-route state and
 * groups related areas for lifecycle and public catalog administration.
 */

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavLeaf {
    label: string;
    href: string;
    /** Exact match only (used for the Overview root so child routes don't keep it active). */
    exact?: boolean;
}

interface NavGroup {
    label: string;
    children: NavLeaf[];
}

type NavItem = NavLeaf | NavGroup;

const NAV: NavItem[] = [
    { label: 'Overview', href: '/admin', exact: true },
    {
        label: 'Modules',
        children: [
            { label: 'Installed', href: '/admin/modules', exact: true },
            { label: 'Available', href: '/admin/modules/available' },
            { label: 'Updates', href: '/admin/modules/updates' },
            { label: 'Sources', href: '/admin/modules/sources' },
        ],
    },
    { label: 'World', href: '/admin/world' },
    { label: 'Audit', href: '/admin/audit' },
    { label: 'Cache', href: '/admin/cache' },
];

function isActive(pathname: string, href: string, exact?: boolean): boolean {
    return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ leaf, pathname }: { leaf: NavLeaf; pathname: string }) {
    const active = isActive(pathname, leaf.href, leaf.exact);
    return (
        <Link
            href={leaf.href}
            aria-current={active ? 'page' : undefined}
            className={`block shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition ${
                active
                    ? 'bg-[var(--admin-accent-soft)] text-[var(--admin-text-primary)]'
                    : 'text-[var(--admin-text-secondary)] hover:bg-[var(--admin-surface-hover)]'
            }`}
        >
            {leaf.label}
        </Link>
    );
}

export default function AdminSidebar() {
    const pathname = usePathname() || '/admin';

    return (
        <nav
            aria-label="Admin sections"
            className="w-full shrink-0 overflow-x-auto border-b border-[var(--admin-border)] bg-[var(--admin-surface)] p-2 md:w-52 md:overflow-visible md:border-b-0 md:border-r md:p-3"
        >
            <div className="flex min-w-max gap-1 md:block md:min-w-0 md:space-y-1">
                {NAV.map(item =>
                    'children' in item ? (
                        <div key={item.label} className="contents md:block md:pt-2">
                            <p className="hidden px-3 pb-1 text-xs font-bold uppercase tracking-wider text-[var(--admin-text-muted)] md:block">
                                {item.label}
                            </p>
                            <div className="contents md:block md:space-y-1">
                                {item.children.map(leaf => (
                                    <NavLink key={leaf.href} leaf={leaf} pathname={pathname} />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <NavLink key={item.href} leaf={item} pathname={pathname} />
                    )
                )}
            </div>
        </nav>
    );
}
