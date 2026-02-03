import React from 'react';
import { getSystemToolsComponent } from '@/modules/core/component-registry';

interface SystemToolsProps {
    systemId: string;
    setLoading: (loading: boolean) => void;
    setLoginMessage: (msg: string) => void;
    theme: any;
    token: string | null;
}

export default function SystemTools({ systemId, setLoading, setLoginMessage, theme, token }: SystemToolsProps) {

    const ToolsComponent = getSystemToolsComponent(systemId);

    if (ToolsComponent) {
        return React.createElement(ToolsComponent, {
            setLoading,
            setLoginMessage,
            theme,
            token
        });
    }

    return null;
}
