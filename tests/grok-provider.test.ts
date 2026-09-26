// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile, access } from 'node:fs/promises';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));
import { execFile } from 'node:child_process';
import { runGrokChat, validateGrokRequest } from '../src/grok-provider.ts';

const request = {
    messages: [{ role: 'user', content: 'hello $(touch /tmp/nope)' }],
    model: 'grok-build'
};

afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
});

describe('Grok subscription bridge', () => {
    it('rejects malformed messages, oversized history, and model flags', () => {
        for (const input of [
            null,
            {},
            { messages: [] },
            { messages: [{ role: 'tool', content: 'x' }] },
            { ...request, model: '--always-approve' }
        ]) {
            expect(() => validateGrokRequest(input)).toThrow();
        }
        expect(() =>
            validateGrokRequest({ messages: [{ role: 'user', content: 'x'.repeat(512 * 1024) }] })
        ).toThrow('512 KB');
    });

    it('passes prompts through a private file, disables tools, removes API keys and cleans up', async () => {
        vi.stubEnv('XAI_API_KEY', 'never-forward');
        let directory = '';
        vi.mocked(execFile).mockImplementation(((
            _file: string,
            args: string[],
            options: any,
            callback: any
        ) => {
            directory = options.cwd;
            expect(args).toContain('--prompt-file');
            expect(args).not.toContain(request.messages[0].content);
            expect(args.slice(args.indexOf('--tools'), args.indexOf('--tools') + 2)).toEqual([
                '--tools',
                ''
            ]);
            expect(options.env.XAI_API_KEY).toBeUndefined();
            expect(options.timeout).toBe(120000);
            void readFile(args[1], 'utf8').then((prompt) => {
                expect(prompt).toContain(request.messages[0].content);
                callback(null, 'Hello!\n');
            });
            return {};
        }) as any);
        expect(await runGrokChat(request)).toBe('Hello!');
        await expect(access(directory)).rejects.toThrow();
    });

    it('reports missing CLI and does not leak CLI diagnostics', async () => {
        vi.mocked(execFile).mockImplementation(((
            _file: any,
            _args: any,
            _options: any,
            callback: any
        ) => {
            callback(Object.assign(new Error('secret diagnostic'), { code: 'ENOENT' }), '');
            return {};
        }) as any);
        await expect(runGrokChat(request)).rejects.toThrow('not installed');
        vi.mocked(execFile).mockImplementation(((
            _file: any,
            _args: any,
            _options: any,
            callback: any
        ) => {
            callback(new Error('secret diagnostic'), '');
            return {};
        }) as any);
        await expect(runGrokChat(request)).rejects.toThrow('Check grok login');
    });

    it('bounds concurrency and releases the slot after failure', async () => {
        let finish: any;
        vi.mocked(execFile).mockImplementation(((
            _file: any,
            _args: any,
            _options: any,
            callback: any
        ) => {
            finish = callback;
            return {};
        }) as any);
        const pending = runGrokChat(request);
        await vi.waitFor(() => expect(finish).toBeDefined());
        await expect(runGrokChat(request)).rejects.toMatchObject({ status: 429 });
        finish(null, '');
        await expect(pending).rejects.toThrow('empty response');
        vi.mocked(execFile).mockImplementation(((
            _file: any,
            _args: any,
            _options: any,
            callback: any
        ) => {
            callback(null, 'ok');
            return {};
        }) as any);
        expect(await runGrokChat(request)).toBe('ok');
    });
});
