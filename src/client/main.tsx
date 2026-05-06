import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import '../../css/styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
    throw new Error('React root element was not found.');
}

document.body.classList.add('overflow-hidden');

flushSync(() => {
    createRoot(rootElement).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
});

void import('./legacy-main.js');
