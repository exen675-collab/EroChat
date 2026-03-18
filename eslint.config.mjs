import js from '@eslint/js';
import globals from 'globals';

const sharedRules = {
    'no-console': 'off'
};

export default [
    {
        ignores: ['coverage/**', 'data/**', 'node_modules/**']
    },
    js.configs.recommended,
    {
        files: ['server.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                fetch: 'readonly'
            }
        },
        rules: sharedRules
    },
    {
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: globals.browser
        },
        rules: sharedRules
    },
    {
        files: ['tests/**/*.js', 'eslint.config.mjs', 'vitest.config.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.browser
            }
        },
        rules: sharedRules
    }
];
