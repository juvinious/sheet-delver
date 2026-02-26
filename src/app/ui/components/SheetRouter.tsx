'use client';

import { getSheet } from '@/modules/core/registry';

interface SheetRouterProps {
    systemId: string;
    actor: any;
    isOwner: boolean;
    // Core handlers (required for all modules)
    onRoll: (type: string, key: string, options?: any) => Promise<void>;
    onUpdate: (path: string, value: any) => Promise<void>;
    onDeleteItem: (itemId: string) => void;
    onCreateItem: (itemData: any) => Promise<void>;
    // Optional handlers
    onUpdateItem?: (itemData: any, deletedEffectIds?: string[]) => Promise<void>;
    onToggleDiceTray?: () => void;
    isDiceTrayOpen?: boolean;
    foundryUrl?: string;
    token?: string | null;
    // Module-specific: Shadowdark effect handlers (optional)
    onToggleEffect?: (effectId: string, enabled: boolean) => void;
    onDeleteEffect?: (effectId: string) => void;
    onAddPredefinedEffect?: (effectId: string) => Promise<void>;
    // Module-specific: Mork Borg handlers (optional)
    onBrewDecoctions?: () => void;
}

export default function SheetRouter(props: SheetRouterProps) {
    const { systemId, ...sheetProps } = props;

    // Dynamic Lookup with Fallback
    const SheetComponent = getSheet(systemId);

    if (!SheetComponent) {
        return (
            <div className="p-8 text-center text-white">
                <h1 className="text-2xl font-bold mb-4">Unsupported System</h1>
                <p>System &quot;{systemId}&quot; does not have a registered sheet.</p>
            </div>
        );
    }

    // eslint-disable-next-line
    return <SheetComponent {...sheetProps} />;
}
