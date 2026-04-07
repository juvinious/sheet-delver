import React, { Suspense } from 'react';
import { getUIModule } from '@modules/registry';

interface SystemToolsProps {
    systemId: string;
    setLoading: (loading: boolean) => void;
    setLoginMessage: (msg: string) => void;
    theme: any;
    token: string | null;
}

export default function SystemTools({ systemId, setLoading, setLoginMessage, theme, token }: SystemToolsProps) {
    const ui = getUIModule(systemId);
    const ToolsComponent = ui?.dashboardTools;
    const LoadingComponent = ui?.dashboardLoading;

    if (ToolsComponent) {
        return (
            <Suspense fallback={LoadingComponent ? <LoadingComponent /> : null}>
                <ToolsComponent
                    setLoading={setLoading}
                    setLoginMessage={setLoginMessage}
                    theme={theme}
                    token={token}
                />
            </Suspense>
        );
    }

    return null;
}
