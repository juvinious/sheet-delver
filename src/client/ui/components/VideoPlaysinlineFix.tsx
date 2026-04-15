'use client';

import { useEffect } from 'react';

/**
 * Global component that prevents videos from going fullscreen on mobile (iOS)
 * by adding playsinline and webkit-playsinline attributes to all video elements.
 * 
 * This component uses a MutationObserver to watch for new video elements being
 * added to the DOM and automatically fixes them.
 */
export default function VideoPlaysinlineFix() {
    useEffect(() => {
        // Fix all existing videos on mount
        const fixAllVideos = () => {
            const videos = document.querySelectorAll('video');
            videos.forEach(video => {
                video.setAttribute('playsinline', '');
                video.setAttribute('webkit-playsinline', '');
            });
        };

        // Initial fix
        fixAllVideos();

        // Watch for new videos being added to the DOM
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                // Check if any added nodes are videos or contain videos
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement) {
                        // Check if the node itself is a video
                        if (node.tagName === 'VIDEO') {
                            node.setAttribute('playsinline', '');
                            node.setAttribute('webkit-playsinline', '');
                        }
                        // Check if the node contains any videos
                        const videos = node.querySelectorAll('video');
                        videos.forEach(video => {
                            video.setAttribute('playsinline', '');
                            video.setAttribute('webkit-playsinline', '');
                        });
                    }
                });
            });
        });

        // Start observing the entire document for changes
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Cleanup
        return () => {
            observer.disconnect();
        };
    }, []);

    // This component doesn't render anything
    return null;
}
