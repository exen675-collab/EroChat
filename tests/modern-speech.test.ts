import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../src/client/config.ts';
import { generateSpeech } from '../src/client/modern/api.ts';
import type { ModernSettings } from '../src/client/modern/types.ts';

const settings = (patch: Partial<ModernSettings> = {}) =>
    ({ ...defaultSettings, openrouterKey: 'sk-test', ...patch }) as ModernSettings;

class FakeAudio extends EventTarget {
    static instances: FakeAudio[] = [];
    constructor(public src: string) {
        super();
        FakeAudio.instances.push(this);
    }
    play = vi.fn(async () => undefined);
}

describe('read aloud', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        FakeAudio.instances = [];
    });

    it('explains that an OpenRouter key is needed instead of calling the API', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await expect(generateSpeech(settings({ openrouterKey: '' }), 'Hi')).rejects.toThrow(
            /Enter your OpenRouter API key/
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports the provider error message', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(JSON.stringify({ error: { message: 'Voice not found' } }), {
                        status: 400
                    })
            )
        );
        await expect(generateSpeech(settings(), 'Hi')).rejects.toThrow('Voice not found');
    });

    it('releases the audio clip once playback ends', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(new Blob(['mp3'])))
        );
        vi.stubGlobal('Audio', FakeAudio);
        const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:clip');
        const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

        const audio = (await generateSpeech(settings(), 'Hi')) as unknown as FakeAudio;
        expect(create).toHaveBeenCalledOnce();
        expect(audio.play).toHaveBeenCalledOnce();
        expect(revoke).not.toHaveBeenCalled();
        audio.dispatchEvent(new Event('ended'));
        expect(revoke).toHaveBeenCalledWith('blob:clip');
    });
});
