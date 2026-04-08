// TTS DISABLED — depends on Grok API which has been removed (issue #16).
// This file is kept intact for future reimplementation with an alternative TTS provider (issue #17).
// Do not import this module until TTS support is restored.

import { elements } from './dom.js';
import { state } from './state.js';
import {
    DEFAULT_GROK_TTS_OUTPUT_FORMAT,
    fetchGrokTtsVoices,
    generateGrokSpeechBlob
} from './api-grok.js';
import {
    DEFAULT_GROK_TTS_VOICE_ID,
    GROK_TTS_FALLBACK_VOICES,
    MAX_GROK_TTS_TEXT_LENGTH,
    getAssistantReadableText,
    normalizeTtsVoiceId
} from './utils.js';

const ttsAudioCache = new Map();
let availableTtsVoices = [...GROK_TTS_FALLBACK_VOICES];
let activeAudio = null;
let activeAudioUrl = null;
let activeMessageId = null;
let loadingMessageId = null;
let playbackRequestSequence = 0;
const TTS_CACHE_FORMAT_KEY = `${DEFAULT_GROK_TTS_OUTPUT_FORMAT.codec}:${DEFAULT_GROK_TTS_OUTPUT_FORMAT.sample_rate}:${DEFAULT_GROK_TTS_OUTPUT_FORMAT.bit_rate}`;

function getAvailableVoiceIds() {
    return availableTtsVoices.map((voice) => voice.voice_id);
}

function getSelectedVoiceId() {
    const selectedVoiceId = normalizeTtsVoiceId(
        elements.ttsVoiceId?.value || state.settings.ttsVoiceId,
        getAvailableVoiceIds(),
        DEFAULT_GROK_TTS_VOICE_ID
    );

    state.settings.ttsVoiceId = selectedVoiceId;

    if (elements.ttsVoiceId) {
        elements.ttsVoiceId.value = selectedVoiceId;
    }

    return selectedVoiceId;
}

function setAvailableVoices(voices) {
    if (!Array.isArray(voices) || voices.length === 0) {
        availableTtsVoices = [...GROK_TTS_FALLBACK_VOICES];
        return;
    }

    const normalizedVoices = voices
        .map((voice) => ({
            voice_id: String(voice.voice_id || '')
                .trim()
                .toLowerCase(),
            name: String(voice.name || voice.voice_id || '').trim(),
            language: String(voice.language || 'multilingual').trim()
        }))
        .filter((voice) => voice.voice_id && voice.name);

    availableTtsVoices =
        normalizedVoices.length > 0 ? normalizedVoices : [...GROK_TTS_FALLBACK_VOICES];
}

function renderVoiceOptions() {
    if (!elements.ttsVoiceId) return;

    elements.ttsVoiceId.innerHTML = availableTtsVoices
        .map((voice) => `<option value="${voice.voice_id}">${voice.name}</option>`)
        .join('');

    getSelectedVoiceId();
}

function getTtsButtonState(messageId) {
    if (loadingMessageId === messageId) return 'loading';
    if (activeMessageId === messageId) return 'playing';
    return 'idle';
}

function getTtsButtonInnerMarkup(stateName) {
    if (stateName === 'loading') {
        return `
            <div class="spinner tts-inline-spinner"></div>
            <span>Loading...</span>
        `;
    }

    if (stateName === 'playing') {
        return `
            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6h4v12H6zm8 0h4v12h-4z"></path>
            </svg>
            <span>Stop Voice</span>
        `;
    }

    return `
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M11 5 6 9H3v6h3l5 4V5zm4.5 4.5a5 5 0 0 1 0 5m2.5-7.5a8.5 8.5 0 0 1 0 10">
            </path>
        </svg>
        <span>Play Voice</span>
    `;
}

function updateTtsButton(button) {
    const messageId = button.getAttribute('data-message-id');
    const stateName = getTtsButtonState(messageId);

    button.setAttribute('data-state', stateName);
    button.disabled = stateName === 'loading';
    button.classList.toggle('hover:text-emerald-400', stateName !== 'playing');
    button.classList.toggle('opacity-70', stateName === 'loading');
    button.classList.toggle('cursor-not-allowed', stateName === 'loading');
    button.style.color = stateName === 'playing' ? '#6ee7b7' : '';
    button.innerHTML = getTtsButtonInnerMarkup(stateName);
}

function stopPlaybackOnly() {
    if (activeAudio) {
        activeAudio.pause();
        activeAudio.src = '';
        activeAudio = null;
    }

    if (activeAudioUrl) {
        URL.revokeObjectURL(activeAudioUrl);
        activeAudioUrl = null;
    }

    activeMessageId = null;
}

function handlePlaybackFinished(messageId) {
    if (activeMessageId !== messageId) return;

    stopPlaybackOnly();
    refreshTtsButtons();
}

function buildCacheKey(text, voiceId) {
    return `${voiceId}::${TTS_CACHE_FORMAT_KEY}::${text}`;
}

async function getSpeechBlob(text, voiceId) {
    const cacheKey = buildCacheKey(text, voiceId);

    if (ttsAudioCache.has(cacheKey)) {
        return ttsAudioCache.get(cacheKey);
    }

    const blob = await generateGrokSpeechBlob({
        text,
        voiceId
    });

    ttsAudioCache.set(cacheKey, blob);
    return blob;
}

export function canPlayMessageTts(content) {
    const readableText = getAssistantReadableText(content);
    return readableText.length > 0 && readableText.length <= MAX_GROK_TTS_TEXT_LENGTH;
}

export function getTtsActionButtonMarkup(messageId) {
    return `
        <button onclick="window.playMessageTts('${messageId}')"
            class="play-tts-btn text-xs text-gray-500 hover:text-emerald-400 flex items-center gap-1 transition-colors"
            data-message-id="${messageId}" data-state="idle" type="button">
            ${getTtsButtonInnerMarkup('idle')}
        </button>
    `;
}

export function refreshTtsButtons() {
    document.querySelectorAll('.play-tts-btn').forEach(updateTtsButton);
}

export function stopActiveTtsPlayback() {
    playbackRequestSequence += 1;
    loadingMessageId = null;
    stopPlaybackOnly();
    refreshTtsButtons();
}

export async function initTts() {
    renderVoiceOptions();

    try {
        const voices = await fetchGrokTtsVoices();
        setAvailableVoices(voices);
    } catch (error) {
        console.warn('Falling back to bundled TTS voices:', error);
        setAvailableVoices(GROK_TTS_FALLBACK_VOICES);
    }

    renderVoiceOptions();
}

export async function toggleMessageTts(messageId) {
    const message = state.messages.find(
        (entry) => entry.id === messageId && entry.role === 'assistant'
    );
    if (!message) return;

    const readableText = getAssistantReadableText(message.content);
    if (!readableText) {
        alert('This message does not contain readable text for TTS.');
        return;
    }

    if (readableText.length > MAX_GROK_TTS_TEXT_LENGTH) {
        alert(
            `This message is too long for Grok TTS (${readableText.length}/${MAX_GROK_TTS_TEXT_LENGTH} characters).`
        );
        return;
    }

    if (activeMessageId === messageId) {
        stopActiveTtsPlayback();
        return;
    }

    const requestId = ++playbackRequestSequence;
    loadingMessageId = messageId;
    stopPlaybackOnly();
    refreshTtsButtons();

    try {
        const voiceId = getSelectedVoiceId();
        const blob = await getSpeechBlob(readableText, voiceId);

        if (requestId !== playbackRequestSequence) {
            return;
        }

        loadingMessageId = null;
        activeMessageId = messageId;
        activeAudioUrl = URL.createObjectURL(blob);
        activeAudio = new Audio(activeAudioUrl);
        activeAudio.addEventListener('ended', () => handlePlaybackFinished(messageId), {
            once: true
        });
        activeAudio.addEventListener(
            'error',
            () => {
                if (requestId !== playbackRequestSequence) return;
                const failedMessageId = activeMessageId;
                stopPlaybackOnly();
                refreshTtsButtons();
                if (failedMessageId) {
                    alert('Failed to play the generated speech audio.');
                }
            },
            { once: true }
        );

        await activeAudio.play();
        refreshTtsButtons();
    } catch (error) {
        if (requestId !== playbackRequestSequence) {
            return;
        }

        loadingMessageId = null;
        stopPlaybackOnly();
        refreshTtsButtons();
        alert(`Failed to generate speech: ${error.message}`);
    }
}
