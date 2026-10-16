import fs from 'node:fs';
import path from 'node:path';
import { MEDIA_DIR, MAX_UPLOADED_MEDIA_BYTES, MAX_REMOTE_MEDIA_BYTES } from '../config';
import { generateId, normalizePositiveInt } from '../utils';
import { fetchPublicUrl, readBodyWithLimit } from './remote-fetch';

function normalizeMimeType(mimeType) {
    return String(mimeType || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
}

export function parseBase64DataUrl(dataUrl) {
    if (typeof dataUrl !== 'string') return null;
    const match = dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (!match) return null;

    const mimeType = normalizeMimeType(match[1]);
    const base64 = String(match[2] || '').replace(/\s+/g, '');
    if (!mimeType || !base64) return null;

    try {
        const buffer = Buffer.from(base64, 'base64');
        if (!buffer || buffer.length === 0) return null;
        return { mimeType, buffer };
    } catch {
        return null;
    }
}

function mediaExtensionForMimeType(mimeType) {
    switch (normalizeMimeType(mimeType)) {
        case 'image/png':
            return 'png';
        case 'image/jpeg':
        case 'image/jpg':
            return 'jpg';
        case 'image/webp':
            return 'webp';
        case 'image/gif':
            return 'gif';
        case 'video/mp4':
            return 'mp4';
        case 'video/webm':
            return 'webm';
        case 'video/quicktime':
            return 'mov';
        default:
            return null;
    }
}

function mediaTypeForMimeType(mimeType) {
    const normalized = normalizeMimeType(mimeType);
    if (normalized.startsWith('image/')) return 'image';
    if (normalized.startsWith('video/')) return 'video';
    return null;
}

function buildMediaUrl(fileName) {
    return `/app/media/${encodeURIComponent(fileName)}`;
}

export async function storeMediaBuffer(buffer, mimeType, maxBytes = MAX_UPLOADED_MEDIA_BYTES) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error('Media content was empty.');
    }

    if (buffer.length > maxBytes) {
        throw new Error('Media file is too large to store.');
    }

    const normalizedMimeType = normalizeMimeType(mimeType);
    const mediaType = mediaTypeForMimeType(normalizedMimeType);
    const ext = mediaExtensionForMimeType(normalizedMimeType);
    if (!mediaType || !ext) {
        throw new Error('Only png, jpg, webp, gif, mp4, webm, or mov files are supported.');
    }

    const fileName = `${Date.now()}-${generateId()}.${ext}`;
    const filePath = path.join(MEDIA_DIR, fileName);
    await fs.promises.writeFile(filePath, buffer);

    return {
        url: buildMediaUrl(fileName),
        mimeType: normalizedMimeType,
        mediaType,
        sizeBytes: buffer.length
    };
}

const REMOTE_MEDIA_TIMEOUT_MS = 60 * 1000;

// Drops an unused response so its connection is released before the error is raised.
function rejectRemoteResponse(response: Response, message: string): never {
    void response.body?.cancel().catch(() => undefined);
    throw new Error(message);
}

export async function importRemoteMedia(remoteUrl) {
    const response = await fetchPublicUrl(remoteUrl, {
        method: 'GET',
        timeoutMs: REMOTE_MEDIA_TIMEOUT_MS,
        followRedirects: true
    });
    if (!response.ok) {
        rejectRemoteResponse(response, `Failed to fetch remote media (${response.status}).`);
    }

    const contentLength = normalizePositiveInt(
        response.headers.get('content-length'),
        0,
        0,
        Number.MAX_SAFE_INTEGER
    );
    if (contentLength > MAX_REMOTE_MEDIA_BYTES) {
        rejectRemoteResponse(response, 'Remote media file is too large to import.');
    }

    const mimeType = normalizeMimeType(response.headers.get('content-type'));
    if (!mediaTypeForMimeType(mimeType)) {
        rejectRemoteResponse(response, 'Remote media type is not supported.');
    }

    const buffer = await readBodyWithLimit(response, MAX_REMOTE_MEDIA_BYTES);
    return storeMediaBuffer(buffer, mimeType, MAX_REMOTE_MEDIA_BYTES);
}
