// TTS is currently disabled, but tts.ts is kept for a future provider.
export const DEFAULT_GROK_TTS_OUTPUT_FORMAT = {
    codec: 'mp3',
    sample_rate: 24000,
    bit_rate: 48000
};

export async function fetchGrokTtsVoices() {
    return [];
}

export async function generateGrokSpeechBlob() {
    throw new Error('Grok TTS support has been removed.');
}
