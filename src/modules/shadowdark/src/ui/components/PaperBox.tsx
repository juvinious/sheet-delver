'use client';

import React from 'react';

interface PaperBoxProps {
    title?: string;
    children: React.ReactNode;
    className?: string;
    badge?: string; // For small labels like "HP" in the corner
}

export default function PaperBox({ title, children, className = '', badge }: PaperBoxProps) {
    return (
        <div className={`relative p-4 ${className}`}>
            {/* Hand-drawn SVG Border */}
            <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    d="M 2,2 Q 50,1 98,2 Q 99,50 98,98 Q 50,99 2,98 Q 1,50 2,2 Z"
                    stroke="black"
                    strokeWidth="0.5"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    className="opacity-80"
                />
                <path
                    d="M 3,3 Q 50,4 97,3 Q 98,50 97,97 Q 50,96 3,97 Q 2,50 3,3 Z"
                    stroke="black"
                    strokeWidth="0.3"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    className="opacity-40"
                />
            </svg>

            {/* Title / Badge Header */}
            <div className="flex justify-between items-start mb-2 relative z-10">
                {title && (
                    <h3 className="text-xs font-bold uppercase tracking-widest text-black font-serif">
                        {title}
                    </h3>
                )}
                {badge && (
                    <div className="bg-black text-white text-[10px] px-2 py-0.5 font-bold uppercase tracking-tighter">
                        {badge}
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="relative z-10">
                {children}
            </div>
        </div>
    );
}
