import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { MEDIA_DIR, MAX_UPLOADED_MEDIA_BYTES, MAX_REMOTE_MEDIA_BYTES } from '../config';
import { generateId, normalizePositiveInt } from '../utils';

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

function isBlockedRemoteHost(hostname) {
    const host = String(hostname || '')
        .trim()
        .toLowerCase();
    if (!host) return true;
    if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host.endsWith('.local')) {
        return true;
    }

    const normalized = host.replace(/^\[|\]$/g, '');
    if (net.isIP(normalized) === 4) {
        return /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.)/.test(normalized);
    }
    if (net.isIP(normalized) === 6) {
        return (
            normalized === '::1' ||
            normalized.startsWith('fc') ||
            normalized.startsWith('fd') ||
            normalized.startsWith('fe80:')
        );
    }

    return false;
}

export function validateRemoteMediaUrl(rawUrl) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new Error('A valid remote URL is required.');
    }

    if (!/^https?:$/i.test(parsed.protocol)) {
        throw new Error('Only http or https media URLs are supported.');
    }

    if (isBlockedRemoteHost(parsed.hostname)) {
        throw new Error('Importing media from local or private addresses is not allowed.');
    }

    return parsed;
}

export async function importRemoteMedia(remoteUrl) {
    const parsed = validateRemoteMediaUrl(remoteUrl);
    const response = await fetch(parsed.toString());
    if (!response.ok) {
        throw new Error(`Failed to fetch remote media (${response.status}).`);
    }

    const contentLength = normalizePositiveInt(
        response.headers.get('content-length'),
        0,
        0,
        Number.MAX_SAFE_INTEGER
    );
    if (contentLength > MAX_REMOTE_MEDIA_BYTES) {
        throw new Error('Remote media file is too large to import.');
    }

    const mimeType = normalizeMimeType(response.headers.get('content-type'));
    if (!mediaTypeForMimeType(mimeType)) {
        throw new Error('Remote media type is not supported.');
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return storeMediaBuffer(buffer, mimeType, MAX_REMOTE_MEDIA_BYTES);
}
