import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface ServerProcess {
    base: string;
    stop(): Promise<void>;
}

// Starts src/server.ts in a child process with an isolated data directory and waits for it to
// listen. Node-environment tests use this to exercise real HTTP routes end to end.
export async function startServerProcess(
    directoryPrefix: string,
    sessionSecret: string
): Promise<ServerProcess> {
    const directory = await mkdtemp(path.join(os.tmpdir(), directoryPrefix));
    const child: ChildProcessWithoutNullStreams = spawn(
        process.execPath,
        ['node_modules/tsx/dist/cli.mjs', 'src/server.ts'],
        {
            env: {
                ...process.env,
                PORT: '0',
                NODE_ENV: 'test',
                EROCHAT_TEST_DATA_DIR: directory,
                SESSION_SECRET: sessionSecret
            },
            stdio: 'pipe'
        }
    );

    let base: string;
    try {
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
    } catch (error) {
        await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        throw error;
    }

    return {
        base,
        async stop() {
            if (child.exitCode === null) {
                const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
                child.kill();
                await exited;
            }
            await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    };
}
