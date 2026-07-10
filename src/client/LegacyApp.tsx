import { useEffect } from 'react';
import shellHtml from './app-shell.html?raw';

export function LegacyApp() {
    useEffect(() => {
        document.body.classList.add('legacy-app-active', 'overflow-hidden');
        void import('./legacy-main.js');
        return () => document.body.classList.remove('legacy-app-active');
    }, []);

    return <div className="legacy-app-root" dangerouslySetInnerHTML={{ __html: shellHtml }} />;
}
