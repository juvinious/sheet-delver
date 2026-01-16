import React from 'react';
import ShadowdarkSheet from './sheets/ShadowdarkSheet';
import MorkBorgSheet from './sheets/MorkBorgSheet';
import GenericSheet from './sheets/GenericSheet';

interface SheetRouterProps {
    systemId: string;
    actor: any;
    foundryUrl?: string;
    messages: any[];
    onRoll: (type: string, key: string, options?: any) => void;
    onChatSend: (message: string) => void;
    onUpdate: (path: string, value: any) => void;
    onToggleEffect: (effectId: string, enabled: boolean) => void;
    onDeleteEffect: (effectId: string) => void;
    onDeleteItem: (itemId: string) => void;
    onCreatePredefinedEffect: (effectKey: string) => void;
}

export default function SheetRouter(props: SheetRouterProps) {
    const { systemId, ...sheetProps } = props;
    console.log('[SheetRouter] Rendering sheet for system:', systemId);

    if (systemId === 'shadowdark') {
        return <ShadowdarkSheet {...sheetProps} />;
    }

    if (systemId === 'morkborg') {
        return <MorkBorgSheet {...sheetProps} />;
    }

    // Default to Generic Sheet for unknown systems
    return <GenericSheet actor={sheetProps.actor} onUpdate={sheetProps.onUpdate} />;
}
