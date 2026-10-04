import type { Express } from 'express';
import { requireApiAuth } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { MAX_INLINE_MEDIA_BYTES, MAX_UPLOADED_MEDIA_BYTES } from '../config';
import { parseBase64DataUrl, storeMediaBuffer, importRemoteMedia } from '../services/media';

export function registerMediaRoutes(app: Express) {
    app.post('/api/media/store', requireApiAuth, async (req, res) => {
        const parsed = parseBase64DataUrl(req.body?.dataUrl);
        if (!parsed) {
            res.status(400).json({ error: 'A valid Base64 data URL is required.' });
            return;
        }

        try {
            const stored = await storeMediaBuffer(
                parsed.buffer,
                parsed.mimeType,
                MAX_INLINE_MEDIA_BYTES
            );
            res.status(201).json(stored);
        } catch (error) {
            console.error('Failed to store media from data URL:', error);
            res.status(400).json({ error: error.message || 'Failed to store media.' });
        }
    });

    app.post('/api/media/upload', requireApiAuth, upload.single('file'), async (req, res) => {
        if (!req.file) {
            res.status(400).json({ error: 'A media file is required.' });
            return;
        }

        try {
            const stored = await storeMediaBuffer(
                req.file.buffer,
                req.file.mimetype,
                MAX_UPLOADED_MEDIA_BYTES
            );
            res.status(201).json(stored);
        } catch (error) {
            console.error('Failed to store uploaded media:', error);
            res.status(400).json({ error: error.message || 'Failed to store uploaded media.' });
        }
    });

    app.post('/api/media/import-remote', requireApiAuth, async (req, res) => {
        const remoteUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
        if (!remoteUrl) {
            res.status(400).json({ error: 'A remote URL is required.' });
            return;
        }

        try {
            const stored = await importRemoteMedia(remoteUrl);
            res.status(201).json(stored);
        } catch (error) {
            console.error('Failed to import remote media:', error);
            res.status(400).json({ error: error.message || 'Failed to import remote media.' });
        }
    });
}
