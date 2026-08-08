import { createRoot } from 'react-dom/client';
import { fetchBootstrapUser } from './auth.js';
import { ModernApp } from './modern/ModernApp.js';

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

    createRoot(rootElement).render(<ModernApp user={user} />);
}

void bootstrap();
