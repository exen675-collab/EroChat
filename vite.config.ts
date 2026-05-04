import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    build: {
        outDir: 'dist/client',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                app: resolve(__dirname, 'index.html'),
                login: resolve(__dirname, 'login.html')
            }
        }
    },
    server: {
        port: 5173,
        strictPort: false,
        proxy: {
            '/api': 'http://localhost:20121',
            '/app/media': 'http://localhost:20121'
        }
    }
});
