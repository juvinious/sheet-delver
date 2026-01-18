'use client';

import { getSheet } from '@/modules/core/registry';
import { useMemo } from 'react';

interface SheetRouterProps {
    systemId: string;
    actor: any;
    isOwner: boolean;
    onToggleEffect: (effectId: string, enabled: boolean) => void;
    onDeleteEffect: (effectId: string) => void;
    onDeleteItem: (itemId: string) => void;
    onCreatePredefinedEffect: (effectKey: string) => void;
    onToggleDiceTray?: () => void;
    foundryUrl?: string;
    onRoll: (type: string, key: string, options?: any) => Promise<void>;
    onUpdate: (path: string, value: any) => Promise<void>;
}

/* eslint-disable react/no-unstable-nested-components */
export default function SheetRouter(props: SheetRouterProps) {
    const { systemId, ...sheetProps } = props;

    // Dynamic Lookup with Fallback - Memoized to prevent "component creation in render" lint error
    const SheetComponent = useMemo(() => getSheet(systemId), [systemId]);

    if (!SheetComponent) {
        return (
            <div className="p-8 text-center text-white">
                <h1 className="text-2xl font-bold mb-4">Unsupported System</h1>
                <p>System &quot;{systemId}&quot; does not have a registered sheet.</p>
            </div>
        );
    }

    return <SheetComponent {...sheetProps} />;
}
