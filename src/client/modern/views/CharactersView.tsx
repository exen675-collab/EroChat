import {
    Edit3,
    LoaderCircle,
    MessageCircle,
    Plus,
    Save,
    Share2,
    Trash2,
    Upload
} from 'lucide-react';
import { useRef, useState } from 'react';
import { importCharacterCard, publishCharacter } from '../api.js';
import { getCharacterThumbnailUrl } from '../character-thumbnails.js';
import { CharacterVisual } from '../components/character-visuals.js';
import { Button, Modal } from '../components/ui.js';
import type { ModernCharacter } from '../types.js';
import type { ModernController } from '../useModernController.js';

function CharacterEditor({
    controller,
    character,
    onClose
}: {
    controller: ModernController;
    character?: ModernCharacter;
    onClose: () => void;
}) {
    const [draft, setDraft] = useState<ModernCharacter>(() =>
        character
            ? { ...character }
            : {
                  id: crypto.randomUUID(),
                  name: '',
                  avatar: '✨',
                  systemPrompt: '',
                  description: '',
                  messages: [],
                  memorySnapshots: [],
                  contextMessageCount: controller.data.settings.contextMessageCount
              }
    );
    const update = (patch: Partial<ModernCharacter>) =>
        setDraft((current) => ({ ...current, ...patch }));
    return (
        <Modal
            title={character ? `Edit ${character.name}` : 'Create character'}
            onClose={onClose}
            size="large"
        >
            <div className="m-character-editor">
                <div className="m-character-editor__identity">
                    <div className="m-thumbnail-editor" aria-label="Character avatar preview">
                        {draft.thumbnail ? (
                            <img src={draft.thumbnail} alt="Character thumbnail" />
                        ) : (
                            <span>{draft.avatar || '✨'}</span>
                        )}
                    </div>
                    <div>
                        <label className="m-field">
                            <span>Name *</span>
                            <input
                                value={draft.name}
                                onChange={(event) => update({ name: event.target.value })}
                            />
                        </label>
                        <label className="m-field">
                            <span>Avatar</span>
                            <input
                                value={draft.avatar || ''}
                                onChange={(event) => update({ avatar: event.target.value })}
                            />
                        </label>
                    </div>
                </div>
                <div className="m-form-grid">
                    <label className="m-field m-field--wide">
                        <span>Description *</span>
                        <textarea
                            rows={4}
                            value={draft.description || ''}
                            onChange={(event) => update({ description: event.target.value })}
                        />
                    </label>
                    <label className="m-field m-field--wide">
                        <span>System prompt *</span>
                        <textarea
                            rows={12}
                            value={draft.systemPrompt || ''}
                            onChange={(event) => update({ systemPrompt: event.target.value })}
                        />
                    </label>
                </div>
            </div>
            <div className="m-modal-actions">
                {character && !character.isDefault && (
                    <Button
                        variant="danger"
                        onClick={() => {
                            if (window.confirm(`Delete ${character.name}?`)) {
                                controller.deleteCharacter(character.id);
                                onClose();
                            }
                        }}
                    >
                        <Trash2 size={17} /> Delete
                    </Button>
                )}
                <span />
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    variant="primary"
                    disabled={
                        !draft.name.trim() ||
                        !draft.description?.trim() ||
                        !draft.systemPrompt.trim()
                    }
                    onClick={() => {
                        controller.saveCharacter({ ...draft, name: draft.name.trim() });
                        onClose();
                    }}
                >
                    <Save size={17} /> Save character
                </Button>
            </div>
        </Modal>
    );
}

function PublishCharacterModal({
    character,
    thumbnail,
    busy,
    onClose,
    onPublish
}: {
    character: ModernCharacter;
    thumbnail: string | null;
    busy: boolean;
    onClose: () => void;
    onPublish: () => void;
}) {
    return (
        <Modal title={`Publish ${character.name}`} onClose={busy ? () => undefined : onClose}>
            <div className="m-publish-preview">
                <div className="m-publish-preview__visual">
                    {thumbnail ? (
                        <img src={thumbnail} alt={`${character.name} thumbnail`} />
                    ) : (
                        <span>{character.avatar || '✨'}</span>
                    )}
                </div>
                <div>
                    <span className="m-eyebrow">Ready for Character Browse</span>
                    <h3>{character.name}</h3>
                    <p>
                        Other users will be able to discover this character, import a private copy,
                        and start their own chat.
                    </p>
                </div>
            </div>
            <div className="m-publish-privacy">
                <Share2 size={19} />
                <div>
                    <strong>What will be shared</strong>
                    <p>Profile, system prompt, greeting, and the thumbnail shown above.</p>
                    <small>
                        Your conversation history, memories, user information, and provider session
                        stay private.
                    </small>
                </div>
            </div>
            <div className="m-modal-actions">
                <span />
                <Button disabled={busy} onClick={onClose}>
                    Cancel
                </Button>
                <Button variant="primary" disabled={busy} onClick={onPublish}>
                    {busy ? <LoaderCircle className="m-spin" size={17} /> : <Share2 size={17} />}{' '}
                    Publish to Browse
                </Button>
            </div>
        </Modal>
    );
}

export function CharactersView({ controller }: { controller: ModernController }) {
    const [editing, setEditing] = useState<ModernCharacter | undefined>();
    const [creating, setCreating] = useState(false);
    const [publishing, setPublishing] = useState<ModernCharacter | null>(null);
    const [publishingId, setPublishingId] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    async function handlePublish(character: ModernCharacter) {
        setPublishingId(character.id);
        try {
            const thumbnail = getCharacterThumbnailUrl(character, controller.data.galleryImages);
            await publishCharacter({ ...character, thumbnail: thumbnail || undefined });
            controller.notify('Character published to Character Browse.', 'success');
            setPublishing(null);
        } catch (error) {
            controller.notify((error as Error).message, 'error');
        } finally {
            setPublishingId(null);
        }
    }
    async function handleImport(file?: File) {
        if (!file) return;
        try {
            const result = await importCharacterCard(file);
            const raw = result.card?.data;
            if (!raw?.name) throw new Error('The character card payload was malformed.');
            const name = String(raw.name).trim();
            const replace = (value: unknown) =>
                String(value || '')
                    .replace(/\{\{\s*char\s*\}\}/gi, name)
                    .replace(/\{\{\s*user\s*\}\}/gi, controller.user.username)
                    .trim();
            const greeting = replace(raw.first_mes);
            const description = replace(raw.description);
            const background = [
                replace(raw.personality) && `Personality:\n${replace(raw.personality)}`,
                replace(raw.scenario) && `Scenario:\n${replace(raw.scenario)}`,
                replace(raw.creator_notes) && `Creator notes:\n${replace(raw.creator_notes)}`
            ]
                .filter(Boolean)
                .join('\n\n');
            controller.saveCharacter({
                id: crypto.randomUUID(),
                name,
                avatar: '✨',
                thumbnail: result.thumbnailUrl || undefined,
                description,
                background,
                greeting,
                appearance: '',
                userInfo: '',
                systemPrompt: [
                    `You are roleplaying as ${name}. Stay in character and respond naturally.`,
                    description && `Description:\n${description}`,
                    background,
                    replace(raw.mes_example) && `Example dialogue:\n${replace(raw.mes_example)}`
                ]
                    .filter(Boolean)
                    .join('\n\n'),
                messages: greeting
                    ? [{ id: crypto.randomUUID(), role: 'assistant', content: greeting }]
                    : [],
                memorySnapshots: [],
                contextMessageCount: controller.data.settings.contextMessageCount,
                openrouterSessionId: null
            });
            controller.notify('Character imported.', 'success');
        } catch (error) {
            controller.notify((error as Error).message, 'error');
        }
    }
    return (
        <div className="m-page">
            <section className="m-page-hero">
                <div>
                    <span className="m-eyebrow">Character library</span>
                    <h2>Build a cast worth returning to.</h2>
                    <p>
                        Each character keeps an independent conversation, memory, visual identity,
                        and OpenRouter session.
                    </p>
                </div>
                <div>
                    <input
                        ref={inputRef}
                        hidden
                        type="file"
                        accept=".json,.png,application/json,image/png"
                        onChange={(event) => void handleImport(event.target.files?.[0])}
                    />
                    <Button onClick={() => inputRef.current?.click()}>
                        <Upload size={17} /> Import card
                    </Button>
                    <Button variant="primary" onClick={() => setCreating(true)}>
                        <Plus size={17} /> New character
                    </Button>
                </div>
            </section>
            <section className="m-character-grid">
                {controller.data.characters.map((character) => (
                    <article
                        key={character.id}
                        className={`m-character-card ${character.id === controller.currentCharacter?.id ? 'is-active' : ''}`}
                    >
                        <button
                            className="m-character-card__visual"
                            onClick={() => controller.selectCharacter(character.id)}
                        >
                            <CharacterVisual
                                character={character}
                                galleryImages={controller.data.galleryImages}
                            />
                            <i>{character.messages.length} messages</i>
                        </button>
                        <div className="m-character-card__body">
                            <span className="m-eyebrow">
                                {character.isDefault
                                    ? 'Default'
                                    : character.id === controller.currentCharacter?.id
                                      ? 'Active now'
                                      : 'Character'}
                            </span>
                            <h3>{character.name}</h3>
                            <p>
                                {character.description ||
                                    character.appearance ||
                                    'No description yet.'}
                            </p>
                            <div>
                                <Button
                                    variant="ghost"
                                    disabled={publishingId === character.id}
                                    onClick={() => setPublishing(character)}
                                >
                                    {publishingId === character.id ? (
                                        <LoaderCircle className="m-spin" size={16} />
                                    ) : (
                                        <Share2 size={16} />
                                    )}{' '}
                                    Publish
                                </Button>
                                <Button variant="ghost" onClick={() => setEditing(character)}>
                                    <Edit3 size={16} /> Edit
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={() => controller.selectCharacter(character.id)}
                                >
                                    <MessageCircle size={16} /> Chat
                                </Button>
                            </div>
                        </div>
                    </article>
                ))}
            </section>
            {(creating || editing) && (
                <CharacterEditor
                    controller={controller}
                    character={editing}
                    onClose={() => {
                        setEditing(undefined);
                        setCreating(false);
                    }}
                />
            )}
            {publishing && (
                <PublishCharacterModal
                    character={publishing}
                    thumbnail={getCharacterThumbnailUrl(publishing, controller.data.galleryImages)}
                    busy={publishingId === publishing.id}
                    onClose={() => setPublishing(null)}
                    onPublish={() => void handlePublish(publishing)}
                />
            )}
        </div>
    );
}
