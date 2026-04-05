import { describe, expect, it } from 'vitest';

import {
    isRemoteSwarmJob,
    shouldExecuteGeneratorJobLocally,
    shouldMarkGeneratorJobInterruptedOnReload
} from '../js/generator-queue.js';

describe('generator queue helpers', () => {
    it('detects remote swarm image jobs', () => {
        expect(isRemoteSwarmJob({ provider: 'swarm', mode: 'image_generate' })).toBe(true);
        expect(isRemoteSwarmJob({ provider: 'swarm', mode: 'video_generate' })).toBe(false);
        expect(isRemoteSwarmJob({ provider: 'comfy', mode: 'image_generate' })).toBe(false);
    });

    it('skips local execution only for remote swarm jobs', () => {
        expect(
            shouldExecuteGeneratorJobLocally({ provider: 'swarm', mode: 'image_generate' })
        ).toBe(false);
        expect(
            shouldExecuteGeneratorJobLocally({ provider: 'comfy', mode: 'image_generate' })
        ).toBe(true);
        expect(
            shouldExecuteGeneratorJobLocally({ provider: 'grok', mode: 'image_generate' })
        ).toBe(true);
    });

    it('does not mark remote swarm running jobs as interrupted on reload', () => {
        expect(
            shouldMarkGeneratorJobInterruptedOnReload({
                provider: 'swarm',
                mode: 'image_generate',
                status: 'running'
            })
        ).toBe(false);
        expect(
            shouldMarkGeneratorJobInterruptedOnReload({
                provider: 'comfy',
                mode: 'image_generate',
                status: 'running'
            })
        ).toBe(true);
        expect(
            shouldMarkGeneratorJobInterruptedOnReload({
                provider: 'swarm',
                mode: 'image_generate',
                status: 'queued'
            })
        ).toBe(false);
    });
});
