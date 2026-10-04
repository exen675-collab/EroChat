import type { Express } from 'express';
import { requireApiAuth } from '../middleware/auth';
import { requestGrokChat } from '../../grok-provider';
import { proxyNanoGptJsonRequest } from '../services/nanogpt';

export function registerProviderRoutes(app: Express) {
    app.post('/api/nanogpt/images/models', requireApiAuth, async (req, res) => {
        const baseUrl = typeof req.body?.baseUrl === 'string' ? req.body.baseUrl.trim() : '';
        const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';

        try {
            const proxied = await proxyNanoGptJsonRequest({
                baseUrl,
                apiKey,
                pathname: '/api/v1/image-models?detailed=true'
            });

            res.status(proxied.status).json(proxied.payload);
        } catch (error) {
            console.error('Failed to proxy NanoGPT image models:', error);
            res.status(400).json({
                error: error.message || 'Failed to fetch NanoGPT image models.'
            });
        }
    });

    app.post('/api/nanogpt/images', requireApiAuth, async (req, res) => {
        const baseUrl = typeof req.body?.baseUrl === 'string' ? req.body.baseUrl.trim() : '';
        const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
        const payload =
            req.body?.payload &&
            typeof req.body.payload === 'object' &&
            !Array.isArray(req.body.payload)
                ? req.body.payload
                : null;

        if (!apiKey) {
            res.status(400).json({ error: 'NanoGPT API key is required.' });
            return;
        }

        if (!payload) {
            res.status(400).json({ error: 'NanoGPT image payload is required.' });
            return;
        }

        try {
            const proxied = await proxyNanoGptJsonRequest({
                baseUrl,
                apiKey,
                pathname: '/api/v1/images/generations',
                method: 'POST',
                body: payload
            });

            res.status(proxied.status).json(proxied.payload);
        } catch (error) {
            console.error('Failed to proxy NanoGPT image generation:', error);
            res.status(400).json({ error: error.message || 'Failed to generate NanoGPT image.' });
        }
    });

    // All signed-in users share the server owner’s local Grok subscription.
    app.post('/api/experimental/grok/chat', requireApiAuth, async (req, res) => {
        const abort = new AbortController();
        const onClose = () => {
            if (!res.writableEnded) abort.abort();
        };
        res.on('close', onClose);
        try {
            const content = await requestGrokChat(req.body, abort.signal);
            if (!res.destroyed)
                res.json({ choices: [{ message: { role: 'assistant', content } }] });
        } catch (error) {
            if (!res.destroyed)
                res.status(error.status || 502).json({
                    error: error.message || 'Grok request failed.'
                });
        } finally {
            res.off('close', onClose);
        }
    });
}
