import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BootstrapUser } from '../auth.js';
import { getAssistantReadableText, getAssistantVisibleText } from '../utils.js';
import {
    createChatPreview,
    fetchGeneratorHistory,
    generateImages,
    generateSpeech,
    persistRemoteMedia,
    sendModernChat,
    sendUtilityRequest
} from './api.js';
import { hydrateModernState, persistModernState } from './storage.js';
import type {
    GalleryItem,
    MemorySnapshot,
    ModernCharacter,
    ModernMessage,
    ModernPersistedState,
    ModernSettings,
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
    return ['chat', 'characters', 'generator', 'gallery', 'stats'].includes(value)
        ? (value as ViewId)
        : null;
}

function imagePromptFromContent(content: string): string {
    const xmlMatch = content.match(/<image_prompt>([\s\S]*?)<\/image_prompt>/i);
    const delimitedMatch = content.match(
        /---IMAGE_PROMPT START---([\s\S]*?)---IMAGE_PROMPT END---/i
    );
    return xmlMatch?.[1]?.trim() || delimitedMatch?.[1]?.trim() || '';
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
    const [data, setData] = useState<ModernPersistedState>(() => {
        const hydrated = hydrateModernState(user.id);
        return { ...hydrated, currentView: viewFromHash() || hydrated.currentView };
    });
    const [generatorJobs, setGeneratorJobs] = useState<any[]>([]);
    const [generatorAssets, setGeneratorAssets] = useState<any[]>([]);
    const [busy, setBusy] = useState<string | null>(null);
    const [notices, setNotices] = useState<Notice[]>([]);
    const [memoryDraft, setMemoryDraft] = useState<{ text: string; messageIds: string[] } | null>(
        null
    );
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        persistModernState(user.id, data);
    }, [data, user.id]);

    useEffect(() => {
        window.location.hash = data.currentView;
    }, [data.currentView]);

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
            currentCharacterId: characterId,
            currentView: 'chat'
        }));
        setMemoryDraft(null);
    }, []);

    const saveCharacter = useCallback(
        (character: ModernCharacter) => {
            setData((current) => {
                const exists = current.characters.some((item) => item.id === character.id);
                return {
                    ...current,
                    currentCharacterId: character.id,
                    characters: exists
                        ? current.characters.map((item) =>
                              item.id === character.id ? { ...item, ...character } : item
                          )
                        : [...current.characters, character]
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

    const appendMessages = useCallback((nextMessages: ModernMessage[]) => {
        setData((current) => {
            const character = current.characters.find(
                (item) => item.id === current.currentCharacterId
            );
            return syncCurrentMessages(current, [...(character?.messages || []), ...nextMessages]);
        });
    }, []);

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
            appendMessages([userMessage]);
            recordUsage('user', { prompt: content });
            setBusy('chat');
            try {
                const raw = await sendModernChat(
                    data.settings,
                    currentCharacter,
                    messages,
                    content
                );
                const assistant: ModernMessage = {
                    id: id(),
                    role: 'assistant',
                    content: raw,
                    createdAt: new Date().toISOString()
                };
                recordUsage('assistant', { model: data.settings.openrouterModel });
                const imagePrompt = imagePromptFromContent(raw);
                if (data.settings.enableImageGeneration && imagePrompt) {
                    try {
                        const [image] = await generateImages(data.settings, {
                            prompt: imagePrompt,
                            batchCount: 1
                        });
                        if (image?.url) {
                            assistant.imageUrl = await persistRemoteMedia(image.url);
                            recordUsage('image', {
                                model:
                                    data.settings.imageProvider === 'swarm'
                                        ? data.settings.swarmModel
                                        : data.settings.imageProvider === 'comfy'
                                          ? data.settings.comfyModel
                                          : data.settings.nanogptModel,
                                prompt: imagePrompt
                            });
                        }
                    } catch (error) {
                        notify(
                            `Reply created, but its image failed: ${(error as Error).message}`,
                            'warning'
                        );
                    }
                }
                appendMessages([assistant]);
                if (assistant.imageUrl) {
                    const galleryItem: GalleryItem = {
                        id: id(),
                        imageUrl: assistant.imageUrl,
                        characterId: currentCharacter.id,
                        characterName: currentCharacter.name,
                        characterAvatar: currentCharacter.avatar,
                        source: 'chat',
                        messageId: assistant.id,
                        createdAt: new Date().toISOString(),
                        prompt: imagePrompt
                    };
                    setData((current) => ({
                        ...current,
                        galleryImages: [galleryItem, ...current.galleryImages]
                    }));
                }
                return true;
            } catch (error) {
                notify((error as Error).message, 'error');
                return false;
            } finally {
                setBusy(null);
            }
        },
        [appendMessages, busy, currentCharacter, data.settings, messages, notify, recordUsage]
    );

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
                imagePromptFromContent(message.content) || getAssistantVisibleText(message.content);
            setBusy(`image:${messageId}`);
            try {
                const [result] = await generateImages(data.settings, { prompt, batchCount: 1 });
                const imageUrl = await persistRemoteMedia(result.url);
                setData((current) => {
                    const character = current.characters.find(
                        (item) => item.id === current.currentCharacterId
                    );
                    const next = (character?.messages || []).map((item) =>
                        item.id === messageId ? { ...item, imageUrl } : item
                    );
                    return {
                        ...syncCurrentMessages(current, next),
                        galleryImages: [
                            {
                                id: id(),
                                imageUrl,
                                characterId: character?.id,
                                characterName: character?.name,
                                source: 'regenerate',
                                messageId,
                                prompt,
                                createdAt: new Date().toISOString()
                            },
                            ...current.galleryImages
                        ]
                    };
                });
            } catch (error) {
                notify((error as Error).message, 'error');
            } finally {
                setBusy(null);
            }
        },
        [data.settings, messages, notify]
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

    return {
        data,
        setData,
        user,
        currentCharacter,
        messages,
        generatorJobs,
        generatorAssets,
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
