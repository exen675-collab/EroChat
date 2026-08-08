import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const backendTarget = process.env.VITE_BACKEND_TARGET || 'http://localhost:20121';
const usePolling = process.env.VITE_USE_POLLING === 'true';

export default defineConfig({
    base: '/app/',
    plugins: [react()],
    server: {
        host: '0.0.0.0',
        port: Number(process.env.VITE_PORT || 5173),
        strictPort: true,
        watch: {
            usePolling
        },
        proxy: {
            '/api': backendTarget,
            '/app/media': backendTarget,
            '^/$': backendTarget
        }
    },
    build: {
        outDir: 'dist/client',
        emptyOutDir: true
    }
});
