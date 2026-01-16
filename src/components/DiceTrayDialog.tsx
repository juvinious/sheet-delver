
'use client';

import { useEffect, useRef } from 'react';
import DiceTray from './DiceTray';

interface DiceTrayDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSend?: (msg: string) => void;
}

export default function DiceTrayDialog({ isOpen, onClose, onSend }: DiceTrayDialogProps) {
    const popupRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div
                ref={popupRef}
                className="w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200"
            >
                <div className="relative">
                    <button
                        onClick={onClose}
                        className="absolute -top-3 -right-3 z-10 bg-black text-white w-8 h-8 rounded-full border-2 border-white flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                        </svg>
                    </button>
                    <DiceTray onSend={(msg) => { if (onSend) onSend(msg); onClose(); }} variant="shadowdark" />
                </div>
            </div>
        </div>
    );
}
