import type { Config } from 'tailwindcss';

export default {
    content: ['./index.html', './login.html', './src/client/**/*.{html,ts,tsx}'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
            }
        }
    },
    plugins: []
} satisfies Config;
