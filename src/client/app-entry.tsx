import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

import './tailwind.css';
import '../../css/styles.css';
import legacyAppHtml from './legacy-app.html?raw';

function getLegacyBodyMarkup() {
    const parsed = new DOMParser().parseFromString(legacyAppHtml, 'text/html');
    parsed.body.querySelectorAll('script').forEach((script) => script.remove());
    return parsed.body.innerHTML;
}

function showStartupError(error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown startup error.';
    const errorBox = document.createElement('div');
    errorBox.className =
        'fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 rounded-lg border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-100 shadow-xl';
    errorBox.textContent = `Failed to start EroChat: ${message}`;
    document.body.appendChild(errorBox);
}

function App() {
    const hostRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let cancelled = false;
        document.body.classList.add('overflow-hidden');

        if (hostRef.current && hostRef.current.childElementCount === 0) {
            hostRef.current.innerHTML = getLegacyBodyMarkup();
        }

        import('./main')
            .then(({ initEroChatClient }) => initEroChatClient())
            .catch((error: unknown) => {
                console.error('Failed to start EroChat:', error);
                if (!cancelled) {
                    showStartupError(error);
                }
            });

        return () => {
            cancelled = true;
            document.body.classList.remove('overflow-hidden');
        };
    }, []);

    return <div ref={hostRef} />;
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
