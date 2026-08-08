import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const WORKSPACE_DIR = path.resolve(__dirname, '..');
const TSX_CLI = path.join(WORKSPACE_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const SERVER_ENTRY = path.join(WORKSPACE_DIR, 'src', 'server.ts');

let serverProcess: ChildProcessWithoutNullStreams;
let openRouterServer: Server;
let temporaryDataDir = '';
let baseUrl = '';
let openRouterUrl = '';
let adminCookie = '';
let selectedReferenceId = 0;
const openRouterRequests: Array<{
    authorization: string;
    body: Record<string, any>;
}> = [];

const generatedDraft = {
    name: 'Provider Generated Character',
    avatar: '✨',
    description: 'An original adult navigator created by the provider stub.',
    appearance: 'Silver-streaked hair, a dark flight coat, and an antique compass.',
    background: 'A fictional 31-year-old navigator mapping impossible routes between cities.',
    greeting: 'The road changed again. Are you coming with me?',
    systemPrompt: 'Roleplay as the fictional adult Provider Generated Character.',
    contextMessageCount: 24
};

async function startOpenRouterStub() {
    openRouterServer = createServer((request, response) => {
        const chunks: Buffer[] = [];
        request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        request.on('end', () => {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
            openRouterRequests.push({
                authorization: String(request.headers.authorization || ''),
                body
            });
            response.setHeader('Content-Type', 'application/json');

            if (body.model === 'test/provider-error') {
                response.statusCode = 500;
                response.end(JSON.stringify({ error: { message: 'stub failure' } }));
                return;
            }
            if (body.model === 'test/rate-limit') {
                response.statusCode = 429;
                response.end(JSON.stringify({ error: { message: 'stub limit' } }));
                return;
            }
            if (body.model === 'test/malformed') {
                response.end(
                    JSON.stringify({ choices: [{ message: { content: 'not valid json' } }] })
                );
                return;
            }
            if (body.model === 'test/timeout') {
                setTimeout(() => {
                    if (!response.destroyed) {
                        response.end(
                            JSON.stringify({
                                choices: [{ message: { content: JSON.stringify(generatedDraft) } }]
                            })
                        );
                    }
                }, 250);
                return;
            }

            response.end(
                JSON.stringify({
                    choices: [{ message: { content: JSON.stringify(generatedDraft) } }]
                })
            );
        });
    });
    await new Promise<void>((resolve) => openRouterServer.listen(0, '127.0.0.1', resolve));
    const address = openRouterServer.address() as AddressInfo;
    openRouterUrl = `http://127.0.0.1:${address.port}/api/v1/chat/completions`;
}

function waitForServer(child: ChildProcessWithoutNullStreams): Promise<string> {
    return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        const timeout = setTimeout(() => {
            reject(new Error(`Timed out waiting for test server. ${stderr}`));
        }, 20_000);

        child.stdout.on('data', (chunk) => {
            stdout += String(chunk);
            const match = stdout.match(/listening on http:\/\/localhost:(\d+)/);
            if (match) {
                clearTimeout(timeout);
                resolve(`http://127.0.0.1:${match[1]}`);
            }
        });
        child.stderr.on('data', (chunk) => {
            stderr += String(chunk);
        });
        child.once('exit', (code) => {
            clearTimeout(timeout);
            reject(new Error(`Test server exited with code ${code}. ${stderr}`));
        });
    });
}

async function post(pathname: string, body: unknown, cookie = '') {
    const response = await fetch(`${baseUrl}${pathname}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(cookie ? { Cookie: cookie } : {})
        },
        body: JSON.stringify(body)
    });
    return response;
}

function getSessionCookie(response: Response): string {
    return String(response.headers.get('set-cookie') || '').split(';')[0];
}

describe.sequential('admin character routes', () => {
    beforeAll(async () => {
        await startOpenRouterStub();
        temporaryDataDir = await mkdtemp(path.join(os.tmpdir(), 'erochat-admin-character-'));
        serverProcess = spawn(process.execPath, [TSX_CLI, SERVER_ENTRY], {
            cwd: WORKSPACE_DIR,
            env: {
                ...process.env,
                PORT: '0',
                NODE_ENV: 'test',
                SESSION_SECRET: 'admin-character-route-test-secret',
                EROCHAT_TEST_DATA_DIR: temporaryDataDir,
                EROCHAT_TEST_OPENROUTER_URL: openRouterUrl,
                EROCHAT_TEST_CHARACTER_GENERATION_TIMEOUT_MS: '75'
            },
            stdio: 'pipe'
        });
        baseUrl = await waitForServer(serverProcess);
    }, 25_000);

    afterAll(async () => {
        if (serverProcess && serverProcess.exitCode == null) {
            const exited = new Promise<void>((resolve) => {
                serverProcess.once('exit', () => resolve());
            });
            serverProcess.kill();
            await Promise.race([
                exited,
                new Promise<void>((resolve) => setTimeout(resolve, 5_000))
            ]);
        }
        if (temporaryDataDir) {
            await rm(temporaryDataDir, { recursive: true, force: true });
        }
        if (openRouterServer) {
            await new Promise<void>((resolve) => openRouterServer.close(() => resolve()));
        }
    });

    it('rejects unauthenticated requests before validating their bodies', async () => {
        const generateResponse = await post('/api/admin/characters/generate', {});
        const publishResponse = await post('/api/admin/characters/publish', {});

        expect(generateResponse.status).toBe(401);
        expect(publishResponse.status).toBe(401);
    });

    it('returns 403 from both routes for an authenticated non-admin', async () => {
        const signupResponse = await post('/api/auth/signup', {
            username: 'route_tester',
            password: 'password123'
        });
        expect(signupResponse.status).toBe(201);
        const cookie = getSessionCookie(signupResponse);
        expect(cookie).toContain('erochat_auth_sid=');

        const generateResponse = await post('/api/admin/characters/generate', {}, cookie);
        const publishResponse = await post('/api/admin/characters/publish', {}, cookie);

        expect(generateResponse.status).toBe(403);
        expect(publishResponse.status).toBe(403);
    });

    it('lets an admin publish a reviewed draft with a server-owned source id', async () => {
        const loginResponse = await post('/api/auth/login', {
            username: 'admin',
            password: 'admin'
        });
        expect(loginResponse.status).toBe(200);
        adminCookie = getSessionCookie(loginResponse);

        const invalidGeneration = await post('/api/admin/characters/generate', {}, adminCookie);
        expect(invalidGeneration.status).toBe(400);

        const publishResponse = await post(
            '/api/admin/characters/publish',
            {
                draft: {
                    name: 'Integration Character',
                    avatar: '🧪',
                    description: 'A complete generated character used by the route test.',
                    appearance: 'An adult traveler in a navy coat.',
                    background: 'A fictional 28-year-old archivist from a distant city.',
                    greeting: 'I have been expecting you.',
                    systemPrompt: 'Roleplay as the fictional adult Integration Character.',
                    contextMessageCount: 20
                }
            },
            adminCookie
        );
        const payload = await publishResponse.json();

        expect(publishResponse.status).toBe(201);
        expect(payload.character).toMatchObject({
            name: 'Integration Character',
            creator: 'admin',
            isOwner: true
        });
        expect(payload.character.sourceCharacterId).toMatch(/^ai-/);
        selectedReferenceId = payload.character.id;
    });

    it('sends only selected canonical profiles and returns a validated draft without publishing', async () => {
        const unselectedResponse = await post(
            '/api/admin/characters/publish',
            {
                draft: {
                    ...generatedDraft,
                    name: 'UNSELECTED_REFERENCE_TOKEN',
                    systemPrompt: 'UNSELECTED_SYSTEM_PROMPT_TOKEN'
                }
            },
            adminCookie
        );
        expect(unselectedResponse.status).toBe(201);

        openRouterRequests.length = 0;
        const generationResponse = await post(
            '/api/admin/characters/generate',
            {
                apiKey: 'sk-route-test',
                model: 'test/success',
                referenceCharacterIds: [selectedReferenceId],
                brief: 'Create a quiet science-fiction explorer.'
            },
            adminCookie
        );
        const payload = await generationResponse.json();

        expect(generationResponse.status).toBe(200);
        expect(payload).toEqual({ draft: generatedDraft });
        expect(JSON.stringify(payload)).not.toContain('sk-route-test');
        expect(openRouterRequests).toHaveLength(1);
        expect(openRouterRequests[0].authorization).toBe('Bearer sk-route-test');
        const messages = JSON.stringify(openRouterRequests[0].body.messages);
        expect(messages).toContain('Integration Character');
        expect(messages).toContain('Create a quiet science-fiction explorer.');
        expect(messages).not.toContain('UNSELECTED_REFERENCE_TOKEN');
        expect(messages).not.toContain('UNSELECTED_SYSTEM_PROMPT_TOKEN');
    });

    it('rejects stale references before calling OpenRouter', async () => {
        const requestCount = openRouterRequests.length;
        const response = await post(
            '/api/admin/characters/generate',
            {
                apiKey: 'sk-route-test',
                model: 'test/success',
                referenceCharacterIds: [Number.MAX_SAFE_INTEGER],
                brief: ''
            },
            adminCookie
        );

        expect(response.status).toBe(400);
        expect(openRouterRequests).toHaveLength(requestCount);
    });

    it('surfaces malformed output, provider failures, rate limits, and timeouts safely', async () => {
        const cases = [
            ['test/malformed', 502],
            ['test/provider-error', 502],
            ['test/rate-limit', 429],
            ['test/timeout', 504]
        ] as const;

        for (const [model, expectedStatus] of cases) {
            const response = await post(
                '/api/admin/characters/generate',
                {
                    apiKey: 'sk-route-test',
                    model,
                    referenceCharacterIds: [],
                    brief: ''
                },
                adminCookie
            );
            const payload = await response.json();

            expect(response.status).toBe(expectedStatus);
            expect(payload.error).toEqual(expect.any(String));
            expect(JSON.stringify(payload)).not.toContain('sk-route-test');
        }
    });
});
