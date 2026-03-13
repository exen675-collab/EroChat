const DATA_URL_PREFIX = 'data:';
const APP_MEDIA_PREFIX = '/app/media/';

function isDataUrl(mediaUrl) {
    return typeof mediaUrl === 'string' && mediaUrl.startsWith(DATA_URL_PREFIX);
}

function isStoredMediaUrl(mediaUrl) {
    return typeof mediaUrl === 'string' && mediaUrl.startsWith(APP_MEDIA_PREFIX);
}

function isRemoteHttpUrl(mediaUrl) {
    return typeof mediaUrl === 'string' && /^https?:\/\//i.test(mediaUrl);
}

function isLocalishUrl(mediaUrl) {
    if (typeof mediaUrl !== 'string' || !mediaUrl) return true;
    if (mediaUrl.startsWith('blob:') || mediaUrl.startsWith('file:') || mediaUrl.startsWith('/')) {
        return true;
    }

    if (!isRemoteHttpUrl(mediaUrl)) {
        return true;
    }

    try {
        const parsed = new URL(mediaUrl, window.location.href);
        const host = parsed.hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') return true;
        if (host.endsWith('.local')) return true;
        return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
    } catch {
        return true;
    }
}

async function parseJson(response) {
    return response.json().catch(() => ({}));
}

export async function uploadFileForStorage(file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData
    });

    const payload = await parseJson(response);
    if (!response.ok) {
        throw new Error(payload.error || `Failed to upload media (${response.status})`);
    }

    return payload;
}

export async function uploadBlobForStorage(blob, fileName = 'upload.bin') {
    const file = new File([blob], fileName, {
        type: blob.type || 'application/octet-stream'
    });
    return uploadFileForStorage(file);
}

export async function importRemoteMediaForStorage(url) {
    const response = await fetch('/api/media/import-remote', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url })
    });

    const payload = await parseJson(response);
    if (!response.ok) {
        throw new Error(payload.error || `Failed to import remote media (${response.status})`);
    }

    return payload;
}

async function storeDataUrl(dataUrl) {
    const response = await fetch('/api/media/store', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ dataUrl })
    });

    const payload = await parseJson(response);
    if (!response.ok) {
        throw new Error(payload.error || `Failed to store media (${response.status})`);
    }

    return payload;
}

async function fetchAsBlob(mediaUrl) {
    const response = await fetch(new URL(mediaUrl, window.location.href).toString());
    if (!response.ok) {
        throw new Error(`Could not fetch media (${response.status}).`);
    }
    return response.blob();
}

export async function persistMediaForStorage(mediaUrl, options = {}) {
    if (!mediaUrl || typeof mediaUrl !== 'string') {
        throw new Error('A media URL is required.');
    }

    if (isStoredMediaUrl(mediaUrl)) {
        return mediaUrl;
    }

    if (isDataUrl(mediaUrl)) {
        const stored = await storeDataUrl(mediaUrl);
        return stored.url;
    }

    if (isRemoteHttpUrl(mediaUrl) && !isLocalishUrl(mediaUrl) && options.preferRemoteImport !== false) {
        const stored = await importRemoteMediaForStorage(mediaUrl);
        return stored.url;
    }

    const blob = await fetchAsBlob(mediaUrl);
    const stored = await uploadBlobForStorage(blob, options.fileName || 'generated-media');
    return stored.url;
}

export async function persistImageForStorage(imageUrl) {
    try {
        return await persistMediaForStorage(imageUrl, { fileName: 'generated-image' });
    } catch (error) {
        console.warn('Failed to persist generated image on server:', error);
        return imageUrl;
    }
}

export async function persistVideoForStorage(videoUrl) {
    try {
        return await persistMediaForStorage(videoUrl, {
            fileName: 'generated-video',
            preferRemoteImport: true
        });
    } catch (error) {
        console.warn('Failed to persist generated video on server:', error);
        return videoUrl;
    }
}

export function isGeneratorStoredMedia(mediaUrl) {
    return isStoredMediaUrl(mediaUrl);
}
