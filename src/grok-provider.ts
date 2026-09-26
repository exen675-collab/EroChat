import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export class GrokProviderError extends Error {
    constructor(
        message: string,
        public status = 502
    ) {
        super(message);
    }
}

export function validateGrokRequest(body: unknown): {
    messages: Array<{ role: string; content: string }>;
    model: string;
} {
    const input = body as Record<string, unknown> | null;
    if (
        !input ||
        !Array.isArray(input.messages) ||
        !input.messages.length ||
        input.messages.length > 1000
    ) {
        throw new GrokProviderError('Provide between 1 and 1000 chat messages.', 400);
    }
    const messages = input.messages.map((message: unknown) => {
        const item = message as Record<string, unknown> | null;
        if (
            !item ||
            !['system', 'user', 'assistant'].includes(String(item.role)) ||
            typeof item.content !== 'string'
        ) {
            throw new GrokProviderError('Each message needs a valid role and text content.', 400);
        }
        return { role: String(item.role), content: item.content };
    });
    if (Buffer.byteLength(JSON.stringify(messages)) > 512 * 1024) {
        throw new GrokProviderError(
            'Conversation exceeds the experimental Grok limit of 512 KB.',
            413
        );
    }
    const model = input.model == null ? '' : input.model;
    if (
        typeof model !== 'string' ||
        (model !== '' && !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(model))
    ) {
        throw new GrokProviderError('Invalid Grok model ID.', 400);
    }
    return { messages, model };
}

// Only server configuration chooses the bridge address; browsers cannot override it.
export async function requestGrokChat(body: unknown, signal?: AbortSignal): Promise<string> {
    const request = validateGrokRequest(body);
    const url = process.env.EROCHAT_GROK_BRIDGE_URL;
    if (!url) return runGrokChat(request, signal);
    const token = process.env.EROCHAT_GROK_BRIDGE_TOKEN;
    if (!token) throw new GrokProviderError('The Grok host bridge token is missing.', 503);
    try {
        const response = await fetch(new URL('/chat', url), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(request),
            signal: signal
                ? AbortSignal.any([signal, AbortSignal.timeout(125_000)])
                : AbortSignal.timeout(125_000),
            redirect: 'error'
        });
        const payload = (await response.json()) as { content?: string; error?: string };
        if (!response.ok)
            throw new GrokProviderError(
                payload.error || 'Grok host bridge failed.',
                response.status
            );
        if (typeof payload.content !== 'string' || !payload.content.trim())
            throw new GrokProviderError('Grok host bridge returned an empty response.');
        return payload.content;
    } catch (error) {
        if (error instanceof GrokProviderError) throw error;
        if (signal?.aborted) throw new GrokProviderError('Grok request cancelled.', 499);
        throw new GrokProviderError(
            'Cannot reach the Grok bridge on your PC. Start npm run grok:bridge on the host and check the Docker bridge configuration.',
            503
        );
    }
}

let active = false;

// One process per request: EroChat supplies history; CLI sessions are never reused.
export async function runGrokChat(body: unknown, signal?: AbortSignal): Promise<string> {
    const { messages, model } = validateGrokRequest(body);
    if (active)
        throw new GrokProviderError(
            'Grok is busy. Try again when the current response finishes.',
            429
        );
    active = true;
    let directory: string | undefined;
    try {
        directory = await mkdtemp(join(tmpdir(), 'erochat-grok-'));
        const promptFile = join(directory, 'prompt.txt');
        await writeFile(
            promptFile,
            'Continue the following conversation. Follow its system instructions and answer the final user message. Return only the assistant reply. Do not use tools.\n\n' +
                JSON.stringify(messages),
            { mode: 0o600 }
        );
        const args = [
            '--prompt-file',
            promptFile,
            '--output-format',
            'plain',
            '--tools',
            '',
            '--deny',
            '*',
            '--permission-mode',
            'dontAsk',
            '--disable-web-search',
            '--no-subagents',
            '--max-turns',
            '1',
            '--system-prompt-override',
            'You are a conversational assistant. Reply only with the requested answer. Do not access files or execute tools.'
        ];
        if (model) args.push('--model', model);
        // Leave authentication to the official CLI. Never forward application API keys.
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            GROK_DISABLE_AUTOUPDATER: '1',
            GROK_MEMORY: '0'
        };
        delete env.XAI_API_KEY;
        const content = await new Promise<string>((resolve, reject) => {
            execFile(
                process.env.EROCHAT_GROK_BIN || 'grok',
                args,
                {
                    cwd: directory,
                    env,
                    signal,
                    timeout: 120_000,
                    maxBuffer: 2 * 1024 * 1024,
                    encoding: 'utf8'
                },
                (error, stdout) => {
                    if (error) {
                        const code = (error as NodeJS.ErrnoException).code;
                        if (code === 'ENOENT')
                            return reject(
                                new GrokProviderError(
                                    'Grok Build is not installed on the EroChat server. For Docker, start the Grok host bridge on your PC (see README). Otherwise install Grok and run grok login.'
                                )
                            );
                        if (signal?.aborted)
                            return reject(new GrokProviderError('Grok request cancelled.', 499));
                        if (error.killed)
                            return reject(
                                new GrokProviderError(
                                    'Grok timed out. Check your CLI login and subscription allowance.',
                                    504
                                )
                            );
                        // CLI diagnostics may contain credentials or prompt text; do not expose them.
                        return reject(
                            new GrokProviderError(
                                'Grok could not complete the request. Check grok login, subscription allowance, and the selected model on the server.'
                            )
                        );
                    }
                    const text = stdout.trim();
                    if (!text)
                        return reject(new GrokProviderError('Grok returned an empty response.'));
                    resolve(text);
                }
            );
        });
        return content;
    } finally {
        active = false;
        if (directory) await rm(directory, { recursive: true, force: true });
    }
}
