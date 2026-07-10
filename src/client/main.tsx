import { createRoot } from 'react-dom/client';
import '../../css/styles.css';
import { fetchBootstrapUser, resolveUiMode } from './ui-mode.js';

const rootElement = document.getElementById('root');

if (!rootElement) {
    throw new Error('React root element was not found.');
}

async function bootstrap() {
    const user = await fetchBootstrapUser();
    if (!user) {
        window.location.href = '/';
        return;
    }

    const mode = resolveUiMode(user.id);
    if (mode === 'legacy') {
        const { LegacyApp } = await import('./LegacyApp.js');
        createRoot(rootElement).render(<LegacyApp />);
        return;
    }

    const { ModernApp } = await import('./modern/ModernApp.js');
    createRoot(rootElement).render(<ModernApp user={user} />);
}

void bootstrap();
