import React from 'react';
import { getSystemToolsComponent } from '@/modules/core/component-registry';

interface SystemToolsProps {
    systemId: string;
    setLoading: (loading: boolean) => void;
    setLoginMessage: (msg: string) => void;
    theme: any;
}

export default function SystemTools({ systemId, setLoading, setLoginMessage, theme }: SystemToolsProps) {

    const ToolsComponent = getSystemToolsComponent(systemId);

    if (ToolsComponent) {
        return (
            <ToolsComponent
                setLoading={setLoading}
                setLoginMessage={setLoginMessage}
                theme={theme}
            />
        );
    }

    return null;
}
