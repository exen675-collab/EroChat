import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BootstrapUser } from '../auth.js';
import { extractImagePrompt, getAssistantReadableText, getAssistantVisibleText } from '../utils.js';
import {
    createChatPreview,
    fetchGeneratorHistory,
    generateSpeech,
    sendModernChat,
    sendUtilityRequest
} from './api.js';
import { runMediaGeneration } from './media-generation.js';
import { chatMediaPreset } from './media-presets.js';
import { useDatabaseState } from './useDatabaseState.js';
import type {
    MemorySnapshot,
    ModernCharacter,
    ModernMessage,
    ModernPersistedState,
    ModernSettings,
    MediaJobSource,
    ViewId
} from './types.js';

export interface Notice {
    id: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
}

function id(): string {
    return crypto.randomUUID();
}

function viewFromHash(): ViewId | null {
    const value = window.location.hash.replace('#', '').toLowerCase();
    return ['chat', 'characters', 'browse', 'generator', 'gallery', 'stats'].includes(value)
        ? (value as ViewId)
        : null;
}

const TEXT_UPGRADE_MODEL = 'deepseek/deepseek-v4-flash';
const UPGRADE_INSTRUCTIONS: Record<string, string> = {
    minimal: 'Fix grammar, spelling, punctuation, and obvious wording errors only.',
    normal: 'Improve grammar, clarity, sentence structure, flow, and wording while preserving tone.',
    full: 'Rewrite this into a stronger, more polished and moderately more detailed version.'
};

function buildUpgradeMessages(draft: string, messages: ModernMessage[], mode: string) {
    return [
        {
            role: 'system',
            content:
                'Rewrite a user draft for the current conversation. Preserve names, intent, and tone. Return only the upgraded draft.'
        },
        {
            role: 'user',
            content: `Instruction: ${UPGRADE_INSTRUCTIONS[mode] || UPGRADE_INSTRUCTIONS.normal}\n\nRecent conversation:\n${messages
                .slice(-10)
                .map((message) => `${message.role}: ${getAssistantVisibleText(message.content)}`)
                .join('\n\n')}\n\nDraft:\n${draft.trim()}`
        }
    ];
}

function syncCurrentMessages(state: ModernPersistedState, messages: ModernMessage[]) {
    return {
        ...state,
        characters: state.characters.map((character) =>
            character.id === state.currentCharacterId ? { ...character, messages } : character
        )
    };
}

export function useModernController(user: BootstrapUser) {
    const { data, setData, persistence } = useDatabaseState(user.id);
    const [generatorJobs, setGeneratorJobs] = useState<any[]>([]);
    const [generatorAssets, setGeneratorAssets] = useState<any[]>([]);
    const [busy, setBusy] = useState<string | null>(null);
    const [notices, setNotices] = useState<Notice[]>([]);
    const [memoryDraft, setMemoryDraft] = useState<{ text: string; messageIds: string[] } | null>(
        null
    );
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        if (persistence.loaded) window.location.hash = data.currentView;
    }, [data.currentView, persistence.loaded]);

    useEffect(() => {
        const onHash = () => {
            const view = viewFromHash();
            if (view) setData((current) => ({ ...current, currentView: view }));
        };
        window.addEventListener('hashchange', onHash);
        return () => window.removeEventListener('hashchange', onHash);
    }, []);

    useEffect(() => {
        void fetchGeneratorHistory()
            .then(({ jobs, assets }) => {
                setGeneratorJobs(jobs);
                setGeneratorAssets(assets);
            })
            .catch(() => undefined);
    }, []);

    const currentCharacter = useMemo(
        () =>
            data.characters.find((character) => character.id === data.currentCharacterId) ||
            data.characters[0],
        [data.characters, data.currentCharacterId]
    );
    const messages = currentCharacter?.messages || [];

    const notify = useCallback((message: string, type: Notice['type'] = 'info') => {
        const notice = { id: id(), message, type };
        setNotices((current) => [...current, notice]);
        window.setTimeout(
            () => setNotices((current) => current.filter((item) => item.id !== notice.id)),
            5000
        );
    }, []);

    const dismissNotice = useCallback((noticeId: string) => {
        setNotices((current) => current.filter((item) => item.id !== noticeId));
    }, []);

    const setView = useCallback((view: ViewId) => {
        setData((current) => {
            const statistics = { ...(current.statistics || {}) };
            statistics.viewCounts = { ...(statistics.viewCounts || {}) };
            statistics.viewCounts[view] = Number(statistics.viewCounts[view] || 0) + 1;
            return { ...current, currentView: view, statistics };
        });
    }, []);

    const updateSettings = useCallback((patch: Partial<ModernSettings>) => {
        setData((current) => ({
            ...current,
            settings: { ...current.settings, ...patch }
        }));
    }, []);

    const selectCharacter = useCallback((characterId: string) => {
        setData((current) => ({
            ...current,
            characters: current.characters.map((character) =>
                character.id === characterId
                    ? { ...character, lastUsedAt: new Date().toISOString() }
                    : character
            ),
            currentCharacterId: characterId,
            currentView: 'chat'
        }));
        setMemoryDraft(null);
    }, []);

    const saveCharacter = useCallback(
        (character: ModernCharacter) => {
            setData((current) => {
                const exists = current.characters.some((item) => item.id === character.id);
                const savedCharacter = exists
                    ? character
                    : { ...character, createdAt: character.createdAt || new Date().toISOString() };
                return {
                    ...current,
                    currentCharacterId: character.id,
                    characters: exists
                        ? current.characters.map((item) =>
                              item.id === character.id ? { ...item, ...savedCharacter } : item
                          )
                        : [...current.characters, savedCharacter]
                };
            });
            notify('Character saved.', 'success');
        },
        [notify]
    );

    const deleteCharacter = useCallback(
        (characterId: string) => {
            if (characterId === 'default') {
                notify('The default character cannot be deleted.', 'warning');
                return;
            }
            setData((current) => {
                const characters = current.characters.filter((item) => item.id !== characterId);
                return {
                    ...current,
                    characters,
                    currentCharacterId:
                        current.currentCharacterId === characterId
                            ? characters[0]?.id || 'default'
                            : current.currentCharacterId
                };
            });
            notify('Character deleted.', 'success');
        },
        [notify]
    );

    const recordUsage = useCallback(
        (
            kind: 'user' | 'assistant' | 'image' | 'generator',
            details: { model?: string; prompt?: string; count?: number } = {}
        ) => {
            setData((current) => {
                const statistics = { ...(current.statistics || {}) };
                const day = new Date().toISOString().slice(0, 10);
                statistics.dailyActivity = { ...(statistics.dailyActivity || {}) };
                const activity = {
                    messagesSent: 0,
                    assistantReplies: 0,
                    imagesGenerated: 0,
                    generatorRuns: 0,
                    ...(statistics.dailyActivity[day] || {})
                };
                const count = details.count || 1;
                if (kind === 'user') activity.messagesSent += count;
                if (kind === 'assistant') activity.assistantReplies += count;
                if (kind === 'image') activity.imagesGenerated += count;
                if (kind === 'generator') activity.generatorRuns += count;
                statistics.dailyActivity[day] = activity;
                statistics.modelUsage = {
                    text: {},
                    image: {},
                    generator: {},
                    ...(statistics.modelUsage || {})
                };
                const usageGroup =
                    kind === 'assistant'
                        ? 'text'
                        : kind === 'image'
                          ? 'image'
                          : kind === 'generator'
                            ? 'generator'
                            : null;
                if (usageGroup && details.model) {
                    statistics.modelUsage[usageGroup] = {
                        ...(statistics.modelUsage[usageGroup] || {})
                    };
                    statistics.modelUsage[usageGroup][details.model] =
                        Number(statistics.modelUsage[usageGroup][details.model] || 0) + count;
                }
                if (details.prompt) {
                    statistics.promptUsage = { ...(statistics.promptUsage || {}) };
                    const key = details.prompt.trim().slice(0, 300);
                    statistics.promptUsage[key] = {
                        text: key,
                        count: Number(statistics.promptUsage[key]?.count || 0) + 1,
                        sources: {
                            ...(statistics.promptUsage[key]?.sources || {}),
                            [kind]: Number(statistics.promptUsage[key]?.sources?.[kind] || 0) + 1
                        }
                    };
                }
                statistics.lastUpdatedAt = new Date().toISOString();
                return { ...current, statistics };
            });
        },
        []
    );

    const upsertGeneratorJob = useCallback((job: any) => {
        setGeneratorJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
    }, []);

    const updateMessageMedia = useCallback(
        (characterId: string, messageId: string, patch: Partial<ModernMessage>) => {
            setData((current) => ({
                ...current,
                characters: current.characters.map((character) =>
                    character.id === characterId
                        ? {
                              ...character,
                              messages: character.messages.map((message) =>
                                  message.id === messageId ? { ...message, ...patch } : message
                              )
                          }
                        : character
                )
            }));
        },
        []
    );

    const generateMessageMedia = useCallback(
        async (
            character: ModernCharacter,
            messageId: string,
            prompt: string,
            source: MediaJobSource
        ) => {
            const preset = chatMediaPreset(data.generatorPrefs, character);
            updateMessageMedia(character.id, messageId, {
                mediaStatus: 'queued',
                mediaError: null
            });
            try {
                const result = await runMediaGeneration({
                    settings: data.settings,
                    preset,
                    prompt,
                    source,
                    characterId: character.id,
                    messageId,
                    onJobChange: (job) => {
                        upsertGeneratorJob(job);
                        updateMessageMedia(character.id, messageId, {
                            mediaJobId: job.id,
                            mediaStatus: job.status,
                            mediaError: job.errorMessage || null
                        });
                    }
                });
                const asset = result.assets[0];
                if (!asset) throw new Error('The media job completed without an asset.');
                updateMessageMedia(character.id, messageId, {
                    imageUrl: asset.mediaType === 'image' ? asset.url : null,
                    videoUrl: asset.mediaType === 'video' ? asset.url : null,
                    mediaJobId: result.job.id,
                    mediaStatus: 'completed',
                    mediaError: null
                });
                setGeneratorAssets((current) => [
                    ...result.assets,
                    ...current.filter(
                        (item) => !result.assets.some((assetItem) => assetItem.id === item.id)
                    )
                ]);
                recordUsage('image', {
                    model: result.job.providerModel,
                    prompt,
                    count: result.assets.length
                });
            } catch (error) {
                const message = (error as Error).message;
                updateMessageMedia(character.id, messageId, {
                    mediaStatus: 'failed',
                    mediaError: message
                });
                notify(
                    source === 'chat' ? `Reply created, but its media failed: ${message}` : message,
                    source === 'chat' ? 'warning' : 'error'
                );
            }
        },
        [
            data.generatorPrefs,
            data.settings,
            notify,
            recordUsage,
            updateMessageMedia,
            upsertGeneratorJob
        ]
    );

    const chatAbortRef = useRef<AbortController | null>(null);

    /** Streams an assistant reply into `assistant`, which must already be in the chat. */
    const streamReply = useCallback(
        async (
            character: ModernCharacter,
            history: ModernMessage[],
            content: string,
            assistant: ModernMessage,
            previousReplies: ModernMessage[] = []
        ) => {
            const characterId = character.id;
            const abort = new AbortController();
            chatAbortRef.current = abort;
            let streamed = '';
            setBusy('chat');
            try {
                const raw = await sendModernChat(
                    data.settings,
                    character,
                    history,
                    content,
                    (streamedContent) => {
                        streamed = streamedContent;
                        updateMessageMedia(characterId, assistant.id, {
                            content: streamedContent,
                            isStreaming: true
                        });
                    },
                    abort.signal
                );
                updateMessageMedia(characterId, assistant.id, {
                    content: raw,
                    isStreaming: false
                });
                recordUsage('assistant', {
                    model:
                        data.settings.textProvider === 'grok-cli'
                            ? `grok-cli/${data.settings.grokModel || 'default'}`
                            : data.settings.openrouterModel
                });
                const imagePrompt = extractImagePrompt(raw);
                if (data.settings.enableImageGeneration && imagePrompt) {
                    void generateMessageMedia(character, assistant.id, imagePrompt, 'chat');
                }
                return true;
            } catch (error) {
                const stopped = abort.signal.aborted;
                if (stopped && streamed.trim()) {
                    // Keep what already arrived when the user stops the reply.
                    updateMessageMedia(characterId, assistant.id, {
                        content: streamed,
                        isStreaming: false
                    });
                    return true;
                }
                setData((current) => ({
                    ...current,
                    characters: current.characters.map((item) =>
                        item.id === characterId
                            ? {
                                  ...item,
                                  messages: item.messages.flatMap((message) =>
                                      message.id === assistant.id ? previousReplies : [message]
                                  )
                              }
                            : item
                    )
                }));
                if (!stopped) notify((error as Error).message, 'error');
                return stopped;
            } finally {
                if (chatAbortRef.current === abort) chatAbortRef.current = null;
                setBusy(null);
            }
        },
        [data.settings, generateMessageMedia, notify, recordUsage, updateMessageMedia]
    );

    const stopReply = useCallback(() => {
        chatAbortRef.current?.abort();
    }, []);

    const sendMessage = useCallback(
        async (draft: string) => {
            const content = draft.trim();
            if (!content || busy || !currentCharacter) return false;
            const userMessage: ModernMessage = {
                id: id(),
                role: 'user',
                content,
                createdAt: new Date().toISOString()
            };
            const assistant: ModernMessage = {
                id: id(),
                role: 'assistant',
                content: '',
                createdAt: new Date().toISOString(),
                isStreaming: true
            };
            const characterId = currentCharacter.id;
            setData((current) => ({
                ...current,
                characters: current.characters.map((character) =>
                    character.id === characterId
                        ? {
                              ...character,
                              lastUsedAt: userMessage.createdAt,
                              messages: [...character.messages, userMessage, assistant]
                          }
                        : character
                )
            }));
            recordUsage('user', { prompt: content });
            return streamReply(currentCharacter, messages, content, assistant);
        },
        [busy, currentCharacter, messages, recordUsage, streamReply]
    );

    /** Replaces everything after the last user message with a fresh reply to it. */
    const regenerateReply = useCallback(async () => {
        if (busy || !currentCharacter) return false;
        let userIndex = messages.length - 1;
        while (userIndex >= 0 && messages[userIndex].role !== 'user') userIndex -= 1;
        if (userIndex < 0) return false;
        const assistant: ModernMessage = {
            id: id(),
            role: 'assistant',
            content: '',
            createdAt: new Date().toISOString(),
            isStreaming: true
        };
        const kept = messages.slice(0, userIndex + 1);
        setData((current) => syncCurrentMessages(current, [...kept, assistant]));
        return streamReply(
            currentCharacter,
            messages.slice(0, userIndex),
            messages[userIndex].content,
            assistant,
            messages.slice(userIndex + 1)
        );
    }, [busy, currentCharacter, messages, streamReply]);

    const startWithGreeting = useCallback(() => {
        const greeting = currentCharacter?.greeting?.trim();
        if (!greeting || messages.length) return;
        setData((current) =>
            syncCurrentMessages(current, [
                {
                    id: id(),
                    role: 'assistant',
                    content: greeting,
                    createdAt: new Date().toISOString()
                }
            ])
        );
    }, [currentCharacter?.greeting, messages.length, setData]);

    const editMessage = useCallback((messageId: string, content: string) => {
        setData((current) => {
            const character = current.characters.find(
                (item) => item.id === current.currentCharacterId
            );
            const next = (character?.messages || []).map((message) =>
                message.id === messageId
                    ? { ...message, content, editedAt: new Date().toISOString() }
                    : message
            );
            return syncCurrentMessages(current, next);
        });
    }, []);

    const removeMessage = useCallback((messageId: string) => {
        setData((current) => {
            const character = current.characters.find(
                (item) => item.id === current.currentCharacterId
            );
            return syncCurrentMessages(
                current,
                (character?.messages || []).filter((message) => message.id !== messageId)
            );
        });
    }, []);

    const branchFromMessage = useCallback(
        (messageId: string) => {
            if (!currentCharacter) return;
            const index = messages.findIndex((message) => message.id === messageId);
            if (index < 0) return;
            const branched: ModernCharacter = {
                ...currentCharacter,
                id: id(),
                name: `${currentCharacter.name} — Branch`,
                isDefault: false,
                messages: messages.slice(0, index + 1).map((message) => ({ ...message })),
                memorySnapshots: [...(currentCharacter.memorySnapshots || [])],
                openrouterSessionId: null
            };
            saveCharacter(branched);
            setView('chat');
            notify('Created a new branched conversation.', 'success');
        },
        [currentCharacter, messages, notify, saveCharacter, setView]
    );

    const regenerateMessageImage = useCallback(
        async (messageId: string) => {
            const message = messages.find((item) => item.id === messageId);
            if (!message) return;
            const prompt =
                extractImagePrompt(message.content) || getAssistantVisibleText(message.content);
            setBusy(`image:${messageId}`);
            try {
                if (currentCharacter) {
                    await generateMessageMedia(currentCharacter, messageId, prompt, 'regenerate');
                }
            } finally {
                setBusy(null);
            }
        },
        [currentCharacter, generateMessageMedia, messages]
    );

    const upgradeDraft = useCallback(
        async (draft: string, mode: string) => {
            setBusy('upgrade');
            try {
                return await sendUtilityRequest(
                    data.settings,
                    buildUpgradeMessages(draft, messages, mode),
                    { model: TEXT_UPGRADE_MODEL }
                );
            } catch (error) {
                notify((error as Error).message, 'error');
                return draft;
            } finally {
                setBusy(null);
            }
        },
        [data.settings, messages, notify]
    );

    const getRequestPreview = useCallback(
        (draft: string) => createChatPreview(data.settings, currentCharacter, messages, draft),
        [currentCharacter, data.settings, messages]
    );

    const fetchSuggestions = useCallback(async () => {
        setBusy('suggestions');
        try {
            const text = await sendUtilityRequest(data.settings, [
                {
                    role: 'system',
                    content:
                        'Suggest three short, distinct next user messages for this roleplay. Return one suggestion per line with no numbering.'
                },
                ...messages.slice(-8).map((message) => ({
                    role: message.role,
                    content: getAssistantVisibleText(message.content)
                }))
            ]);
            return text
                .split('\n')
                .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
                .filter(Boolean)
                .slice(0, 3);
        } catch (error) {
            notify((error as Error).message, 'error');
            return [];
        } finally {
            setBusy(null);
        }
    }, [data.settings, messages, notify]);

    const compressMemory = useCallback(async () => {
        if (!currentCharacter) return;
        const active = messages.filter((message) => !message.archivedFromModelContext);
        const limit = currentCharacter.contextMessageCount || data.settings.contextMessageCount;
        const block = active.slice(0, Math.min(limit, active.length));
        if (!block.length) return;
        setBusy('memory');
        try {
            const text = await sendUtilityRequest(data.settings, [
                {
                    role: 'system',
                    content:
                        'Summarize this chat as a plain narrative memory. Preserve continuity, facts, emotional beats, decisions, and preferences. Return only the memory.'
                },
                {
                    role: 'user',
                    content: block
                        .map(
                            (message) =>
                                `${message.role}: ${getAssistantVisibleText(message.content)}`
                        )
                        .join('\n\n')
                }
            ]);
            setMemoryDraft({ text, messageIds: block.map((message) => message.id) });
        } catch (error) {
            notify((error as Error).message, 'error');
        } finally {
            setBusy(null);
        }
    }, [currentCharacter, data.settings, messages, notify]);

    const acceptMemory = useCallback(
        (text: string) => {
            if (!memoryDraft || !currentCharacter) return;
            const snapshot: MemorySnapshot = {
                id: id(),
                finalText: text.trim(),
                createdAt: new Date().toISOString(),
                messageIds: memoryDraft.messageIds
            };
            setData((current) => ({
                ...current,
                characters: current.characters.map((character) =>
                    character.id === current.currentCharacterId
                        ? {
                              ...character,
                              memorySnapshots: [...(character.memorySnapshots || []), snapshot],
                              messages: character.messages.map((message) =>
                                  memoryDraft.messageIds.includes(message.id)
                                      ? {
                                            ...message,
                                            archivedFromModelContext: true,
                                            archivedMemorySnapshotId: snapshot.id
                                        }
                                      : message
                              )
                          }
                        : character
                )
            }));
            setMemoryDraft(null);
            notify('Memory snapshot accepted.', 'success');
        },
        [currentCharacter, memoryDraft, notify]
    );

    const increaseContextLimit = useCallback((amount: number) => {
        setData((current) => ({
            ...current,
            settings: {
                ...current.settings,
                contextMessageCount: current.settings.contextMessageCount + amount
            },
            characters: current.characters.map((character) =>
                character.id === current.currentCharacterId
                    ? {
                          ...character,
                          contextMessageCount:
                              (character.contextMessageCount ||
                                  current.settings.contextMessageCount) + amount
                      }
                    : character
            )
        }));
    }, []);

    const clearChat = useCallback(() => {
        setData((current) => syncCurrentMessages(current, []));
        setMemoryDraft(null);
        notify('Chat cleared.', 'success');
    }, [notify]);

    const playTts = useCallback(
        async (message: ModernMessage) => {
            try {
                audioRef.current?.pause();
                audioRef.current = await generateSpeech(
                    data.settings,
                    getAssistantReadableText(message.content)
                );
            } catch (error) {
                notify((error as Error).message, 'error');
            }
        },
        [data.settings, notify]
    );

    const setGalleryFilters = useCallback(
        (
            patch: Partial<
                Pick<
                    ModernPersistedState,
                    | 'gallerySearchQuery'
                    | 'gallerySortOrder'
                    | 'galleryFilterCharacterId'
                    | 'gallerySourceFilter'
                >
            >
        ) => setData((current) => ({ ...current, ...patch })),
        []
    );

    const setCharacterThumbnail = useCallback((characterId: string, thumbnail: string) => {
        setData((current) => ({
            ...current,
            characters: current.characters.map((character) =>
                character.id === characterId ? { ...character, thumbnail } : character
            )
        }));
    }, []);

    const refreshGenerator = useCallback(async () => {
        try {
            const result = await fetchGeneratorHistory();
            setGeneratorJobs(result.jobs);
            setGeneratorAssets(result.assets);
        } catch (error) {
            notify((error as Error).message, 'error');
        }
    }, [notify]);

    const thumbnailImages = useMemo(
        () => [
            ...data.galleryImages,
            ...generatorAssets
                .filter((asset) => asset.mediaType === 'image')
                .map((asset) => ({
                    id: `asset-${asset.id}`,
                    characterId: asset.characterId,
                    imageUrl: asset.url,
                    createdAt: asset.createdAt
                }))
        ],
        [data.galleryImages, generatorAssets]
    );

    return {
        persistence,
        data,
        setData,
        user,
        currentCharacter,
        messages,
        generatorJobs,
        generatorAssets,
        thumbnailImages,
        setGeneratorJobs,
        setGeneratorAssets,
        busy,
        setBusy,
        notices,
        notify,
        dismissNotice,
        memoryDraft,
        setMemoryDraft,
        setView,
        updateSettings,
        selectCharacter,
        saveCharacter,
        deleteCharacter,
        sendMessage,
        stopReply,
        regenerateReply,
        startWithGreeting,
        editMessage,
        removeMessage,
        branchFromMessage,
        regenerateMessageImage,
        upgradeDraft,
        getRequestPreview,
        fetchSuggestions,
        compressMemory,
        acceptMemory,
        increaseContextLimit,
        clearChat,
        playTts,
        setGalleryFilters,
        setCharacterThumbnail,
        refreshGenerator,
        recordUsage
    };
}

export type ModernController = ReturnType<typeof useModernController>;
