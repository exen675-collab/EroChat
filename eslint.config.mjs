import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const sharedRules = {
    'no-console': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-require-imports': 'off'
};

export default tseslint.config(
    {
        ignores: ['coverage/**', 'data/**', 'dist/**', 'node_modules/**']
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/server.ts', 'src/character-card-import.ts'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                fetch: 'readonly'
            }
        },
        rules: {
            ...sharedRules,
            'no-unused-vars': 'off'
        }
    },
    {
        files: ['src/client/**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: globals.browser
        },
        rules: {
            ...sharedRules,
            'no-unused-vars': 'off'
        }
    },
    {
        files: ['tests/**/*.ts', 'eslint.config.mjs', 'vitest.config.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.browser
            }
        },
        rules: {
            ...sharedRules,
            'no-unused-vars': 'off'
        }
    }
);
