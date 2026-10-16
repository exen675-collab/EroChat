// @vitest-environment node
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const MAX_ATTEMPTS = 20;

let child: ChildProcessWithoutNullStreams;
let directory = '';
let base = '';

function login(username: string, password: string, forwardedFor?: string) {
    return fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {})
        },
        body: JSON.stringify({ username, password })
    });
}

describe.sequential('login rate limiting', () => {
    beforeAll(async () => {
        directory = await mkdtemp(path.join(os.tmpdir(), 'wink-rate-limit-'));
        child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/server.ts'], {
            env: {
                ...process.env,
                PORT: '0',
                NODE_ENV: 'test',
                EROCHAT_TEST_DATA_DIR: directory,
                SESSION_SECRET: 'rate-limit-test'
            },
            stdio: 'pipe'
        });
        base = await new Promise<string>((resolve, reject) => {
            let output = '';
            const timeout = setTimeout(() => reject(new Error(output)), 20000);
            child.stdout.on('data', (chunk) => {
                output += chunk;
                const match = output.match(/listening on http:\/\/localhost:(\d+)/);
                if (match) {
                    clearTimeout(timeout);
                    resolve(`http://127.0.0.1:${match[1]}`);
                }
            });
            child.stderr.on('data', (chunk) => {
                output += chunk;
            });
            child.once('exit', (code) => {
                clearTimeout(timeout);
                reject(new Error(`Server exited (${code}): ${output}`));
            });
        });
    }, 25000);

    afterAll(async () => {
        if (child?.exitCode === null) {
            const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
            child.kill();
            await exited;
        }
        if (directory)
            await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    });

    it('locks an account after repeated failures even when the client address changes', async () => {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
            const response = await login(
                'ghost-account',
                'wrong-password',
                `203.0.113.${attempt + 1}`
            );
            expect(response.status).toBe(401);
        }

        const blocked = await login('ghost-account', 'wrong-password', '198.51.100.250');
        expect(blocked.status).toBe(429);
    }, 60000);

    it('locks a client address after repeated failures against different accounts', async () => {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
            const response = await login(`nobody-${attempt}`, 'wrong-password');
            expect(response.status).toBe(401);
        }

        const blocked = await login('another-nobody', 'wrong-password');
        expect(blocked.status).toBe(429);
    }, 60000);
});
