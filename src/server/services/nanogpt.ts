import { fetchPublicUrl } from './remote-fetch';

// Image generation can run for minutes; this bounds stalled connections rather than typical use.
const NANOGPT_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

function buildNanoGptApiUrl(baseUrl, pathname) {
    const trimmedBaseUrl =
        typeof baseUrl === 'string' && baseUrl.trim() ? baseUrl.trim() : 'https://nano-gpt.com';
    return new URL(pathname, trimmedBaseUrl).toString();
}

async function readNanoGptResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        return response.json().catch(() => ({}));
    }

    const text = await response.text().catch(() => '');
    return text ? { error: text } : {};
}

export async function proxyNanoGptJsonRequest({
    baseUrl,
    apiKey,
    pathname,
    method = 'GET',
    body = null
}) {
    const targetUrl = buildNanoGptApiUrl(baseUrl, pathname);
    const headers: Record<string, string> = {
        Accept: 'application/json'
    };

    if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
    }

    if (body != null) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetchPublicUrl(targetUrl, {
        method,
        headers,
        body: body != null ? JSON.stringify(body) : undefined,
        timeoutMs: NANOGPT_REQUEST_TIMEOUT_MS
    });
    const payload = await readNanoGptResponse(response);

    return {
        ok: response.ok,
        status: response.status,
        payload
    };
}
