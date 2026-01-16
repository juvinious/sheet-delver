'use client';

import { SYSTEM_REGISTRY } from './sheets/registry';
import GenericSheet from './sheets/GenericSheet';

interface SheetRouterProps {
    systemId: string;
    actor: any;
    foundryUrl?: string;
    onRoll: (type: string, key: string, options?: any) => void;
    onUpdate: (path: string, value: any) => void;
    onToggleEffect: (effectId: string, enabled: boolean) => void;
    onDeleteEffect: (effectId: string) => void;
    onDeleteItem: (itemId: string) => void;
    onCreatePredefinedEffect: (effectKey: string) => void;
}

export default function SheetRouter(props: SheetRouterProps) {
    const { systemId, ...sheetProps } = props;

    // Dynamic Lookup with Fallback
    const SheetComponent = SYSTEM_REGISTRY[systemId] || GenericSheet;

    return <SheetComponent {...sheetProps} />;
}
