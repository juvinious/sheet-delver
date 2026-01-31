import { useState, useRef, useCallback } from 'react';

export type NotificationType = 'info' | 'success' | 'error';

export interface Notification {
    id: number;
    content: string;
    type: NotificationType;
    html?: boolean;
}

interface NotificationOptions {
    html?: boolean;
    duration?: number;
}

export const useNotifications = (defaultDuration = 5000) => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const notificationIdRef = useRef(0);

    const addNotification = useCallback((content: string, type: NotificationType = 'info', options?: NotificationOptions) => {
        const id = ++notificationIdRef.current;
        const duration = options?.duration || defaultDuration;

        setNotifications(prev => [...prev, { id, content, type, html: options?.html }]);

        // Auto-dismiss
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, duration);
    }, [defaultDuration]);

    const removeNotification = useCallback((id: number) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    return { notifications, addNotification, removeNotification };
};

export const NotificationContainer = ({ notifications, removeNotification }: { notifications: Notification[], removeNotification: (id: number) => void }) => {
    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
            {notifications.map(n => (
                <div
                    key={n.id}
                    className={`relative p-4 rounded-lg shadow-2xl border-l-4 transform transition-all animate-in slide-in-from-right fade-in duration-300 pointer-events-auto ${n.type === 'success' ? 'bg-slate-800 border-green-500 text-green-100' :
                        n.type === 'error' ? 'bg-slate-800 border-red-500 text-red-100' :
                            'bg-slate-800 border-blue-500 text-blue-100'
                        }`}
                >
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            removeNotification(n.id);
                        }}
                        className="absolute top-2 right-2 text-current opacity-50 hover:opacity-100 p-1 rounded hover:bg-black/20 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    <div
                        className="text-sm pr-6 break-words [&_img]:max-h-16 [&_img]:w-auto [&_img]:object-contain [&_img]:rounded [&_img]:inline-block [&_img]:mr-2 [&_img]:align-middle [&_header]:font-bold [&_header]:mb-1 [&_header]:border-b [&_header]:border-white/20 [&_h3]:inline [&_h3]:m-0 [&_p]:m-0"
                    >
                        {n.html ? (
                            <div dangerouslySetInnerHTML={{ __html: n.content }} />
                        ) : (
                            <p className="font-medium">{n.content}</p>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};
