import { validateRemoteMediaUrl } from './media';

function buildNanoGptApiUrl(baseUrl, pathname) {
    const trimmedBaseUrl =
        typeof baseUrl === 'string' && baseUrl.trim() ? baseUrl.trim() : 'https://nano-gpt.com';
    const parsed = validateRemoteMediaUrl(new URL(pathname, trimmedBaseUrl).toString());
    return parsed.toString();
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

    const response = await fetch(targetUrl, {
        method,
        headers,
        body: body != null ? JSON.stringify(body) : undefined
    });
    const payload = await readNanoGptResponse(response);

    return {
        ok: response.ok,
        status: response.status,
        payload
    };
}
