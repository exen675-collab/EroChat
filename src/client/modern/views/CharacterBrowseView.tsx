import {
    Compass,
    Download,
    LoaderCircle,
    RefreshCw,
    Search,
    Share2,
    Trash2,
    WandSparkles,
    X
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
    fetchOpenRouterModels,
    fetchPublicCharacters,
    generateAdminCharacter,
    importPublicCharacter,
    publishGeneratedCharacter,
    unpublishCharacter
} from '../api.js';
import { Button, Modal } from '../components/ui.js';
import type {
    GeneratedCharacterDraft,
    ModernCharacter,
    ModernSettings,
    PublicCharacter
} from '../types.js';
import type { ModernController } from '../useModernController.js';

function PublicCharacterVisual({ character }: { character: PublicCharacter }) {
    return character.thumbnail ? (
        <img src={character.thumbnail} alt="" />
    ) : (
        <span>{character.avatar || '✨'}</span>
    );
}

function AdminCharacterGeneratorModal({
    references,
    settings,
    onClose,
    onPublished
}: {
    references: PublicCharacter[];
    settings: ModernSettings;
    onClose: () => void;
    onPublished: (character: PublicCharacter) => void;
}) {
    const [stage, setStage] = useState<'configure' | 'review'>('configure');
    const [model, setModel] = useState(settings.openrouterModel);
    const [models, setModels] = useState<string[]>([]);
    const [modelsLoading, setModelsLoading] = useState(true);
    const [modelsError, setModelsError] = useState('');
    const [brief, setBrief] = useState('');
    const [draft, setDraft] = useState<GeneratedCharacterDraft | null>(null);
    const [busy, setBusy] = useState<'generate' | 'publish' | null>(null);
    const [error, setError] = useState('');
    const requestInFlight = useRef(false);

    async function loadModels() {
        setModelsLoading(true);
        setModelsError('');
        try {
            setModels(await fetchOpenRouterModels(settings));
        } catch (loadError) {
            setModelsError((loadError as Error).message);
        } finally {
            setModelsLoading(false);
        }
    }

    useEffect(() => {
        let cancelled = false;
        setModelsLoading(true);
        setModelsError('');
        void fetchOpenRouterModels(settings)
            .then((items) => {
                if (!cancelled) setModels(items);
            })
            .catch((loadError) => {
                if (!cancelled) setModelsError((loadError as Error).message);
            })
            .finally(() => {
                if (!cancelled) setModelsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [settings]);

    async function handleGenerate() {
        if (requestInFlight.current) return;
        if (!settings.openrouterKey.trim()) {
            setError('Enter your OpenRouter API key in Settings before generating a character.');
            return;
        }
        if (!model.trim()) {
            setError('Choose an OpenRouter model.');
            return;
        }

        requestInFlight.current = true;
        setBusy('generate');
        setError('');
        try {
            const generated = await generateAdminCharacter({
                apiKey: settings.openrouterKey,
                model: model.trim(),
                referenceCharacterIds: references.map((character) => character.id),
                brief: brief.trim()
            });
            setDraft(generated);
            setStage('review');
        } catch (generateError) {
            setError((generateError as Error).message);
        } finally {
            requestInFlight.current = false;
            setBusy(null);
        }
    }

    async function handlePublish() {
        if (requestInFlight.current || !draft) return;
        requestInFlight.current = true;
        setBusy('publish');
        setError('');
        try {
            onPublished(await publishGeneratedCharacter(draft));
        } catch (publishError) {
            setError((publishError as Error).message);
        } finally {
            requestInFlight.current = false;
            setBusy(null);
        }
    }

    const updateDraft = (patch: Partial<GeneratedCharacterDraft>) =>
        setDraft((current) => (current ? { ...current, ...patch } : current));
    const availableModels = model && !models.includes(model) ? [model, ...models] : models;
    const validContextCount =
        draft &&
        Number.isInteger(draft.contextMessageCount) &&
        draft.contextMessageCount >= 1 &&
        draft.contextMessageCount <= 200;
    const canPublish = Boolean(
        draft?.name.trim() && draft.systemPrompt.trim() && validContextCount
    );

    return (
        <Modal
            title={stage === 'configure' ? 'Generate a character' : 'Review generated character'}
            onClose={busy ? () => undefined : onClose}
            size="large"
        >
            {stage === 'configure' ? (
                <div className="m-character-generator">
                    <div className="m-admin-model-row">
                        <label className="m-field">
                            <span>OpenRouter model *</span>
                            <select
                                value={model}
                                onChange={(event) => setModel(event.target.value)}
                            >
                                {!model && <option value="">Select a model</option>}
                                {availableModels.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <Button disabled={modelsLoading} onClick={() => void loadModels()}>
                            {modelsLoading ? (
                                <LoaderCircle className="m-spin" size={16} />
                            ) : (
                                <RefreshCw size={16} />
                            )}{' '}
                            Reload models
                        </Button>
                    </div>
                    {modelsError ? (
                        <p className="m-inline-error" role="alert">
                            Could not load models: {modelsError}
                        </p>
                    ) : (
                        <p className="m-muted m-generator-help">
                            {modelsLoading
                                ? 'Loading the OpenRouter text-model catalog…'
                                : `${models.length} text models available. This choice only applies to this generation.`}
                        </p>
                    )}

                    <label className="m-field m-character-generator__brief">
                        <span>Creative brief (optional)</span>
                        <textarea
                            rows={6}
                            maxLength={2000}
                            aria-label="Creative brief (optional)"
                            value={brief}
                            onChange={(event) => setBrief(event.target.value)}
                            placeholder="Describe the personality, setting, tone, or role you want. Leave blank for an English character."
                        />
                        <small>{brief.length} / 2,000 characters</small>
                    </label>

                    <section className="m-generation-references" aria-label="Selected references">
                        <header>
                            <div>
                                <strong>Originality references</strong>
                                <p>
                                    The generator will use these public profiles to avoid repeating
                                    existing characters.
                                </p>
                            </div>
                            <span>{references.length} selected</span>
                        </header>
                        {references.length ? (
                            <ul>
                                {references.map((character) => (
                                    <li key={character.id}>
                                        <span>{character.avatar || '✨'}</span>
                                        {character.name}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p>
                                No references selected. You can still generate the first public
                                character.
                            </p>
                        )}
                    </section>

                    {!settings.openrouterKey.trim() && (
                        <p className="m-inline-error" role="alert">
                            Add an OpenRouter API key in Settings to generate a character.
                        </p>
                    )}
                    {error && (
                        <p className="m-inline-error" role="alert">
                            {error}
                        </p>
                    )}
                    <div className="m-modal-actions">
                        <span />
                        <Button disabled={Boolean(busy)} onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            disabled={
                                Boolean(busy) || !settings.openrouterKey.trim() || !model.trim()
                            }
                            onClick={() => void handleGenerate()}
                        >
                            {busy === 'generate' ? (
                                <LoaderCircle className="m-spin" size={17} />
                            ) : (
                                <WandSparkles size={17} />
                            )}{' '}
                            Generate draft
                        </Button>
                    </div>
                </div>
            ) : (
                draft && (
                    <div className="m-character-generator m-character-generator--review">
                        <p className="m-muted m-generator-help">
                            Review every field before publishing. Only the name and system prompt
                            must remain filled in.
                        </p>
                        <div className="m-form-grid">
                            <label className="m-field">
                                <span>Name *</span>
                                <input
                                    maxLength={100}
                                    value={draft.name}
                                    onChange={(event) => updateDraft({ name: event.target.value })}
                                />
                            </label>
                            <label className="m-field">
                                <span>Emoji avatar</span>
                                <input
                                    maxLength={16}
                                    value={draft.avatar}
                                    onChange={(event) =>
                                        updateDraft({ avatar: event.target.value })
                                    }
                                />
                            </label>
                            <label className="m-field m-field--wide">
                                <span>Description</span>
                                <textarea
                                    rows={3}
                                    maxLength={4000}
                                    value={draft.description}
                                    onChange={(event) =>
                                        updateDraft({ description: event.target.value })
                                    }
                                />
                            </label>
                            <label className="m-field">
                                <span>Appearance</span>
                                <textarea
                                    rows={5}
                                    maxLength={4000}
                                    value={draft.appearance}
                                    onChange={(event) =>
                                        updateDraft({ appearance: event.target.value })
                                    }
                                />
                            </label>
                            <label className="m-field">
                                <span>Background</span>
                                <textarea
                                    rows={5}
                                    maxLength={12000}
                                    value={draft.background}
                                    onChange={(event) =>
                                        updateDraft({ background: event.target.value })
                                    }
                                />
                            </label>
                            <label className="m-field m-field--wide">
                                <span>Greeting</span>
                                <textarea
                                    rows={5}
                                    maxLength={8000}
                                    value={draft.greeting}
                                    onChange={(event) =>
                                        updateDraft({ greeting: event.target.value })
                                    }
                                />
                            </label>
                            <label className="m-field m-field--wide">
                                <span>System prompt *</span>
                                <textarea
                                    rows={10}
                                    maxLength={24000}
                                    value={draft.systemPrompt}
                                    onChange={(event) =>
                                        updateDraft({ systemPrompt: event.target.value })
                                    }
                                />
                            </label>
                            <label className="m-field">
                                <span>Context messages</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={200}
                                    step={1}
                                    aria-label="Context messages"
                                    value={draft.contextMessageCount}
                                    onChange={(event) =>
                                        updateDraft({
                                            contextMessageCount: Number(event.target.value)
                                        })
                                    }
                                />
                                <small>Between 1 and 200 messages.</small>
                            </label>
                        </div>
                        {error && (
                            <p className="m-inline-error" role="alert">
                                {error}
                            </p>
                        )}
                        <div className="m-modal-actions">
                            <Button
                                disabled={Boolean(busy)}
                                onClick={() => {
                                    setError('');
                                    setStage('configure');
                                }}
                            >
                                Back
                            </Button>
                            <span />
                            <Button disabled={Boolean(busy)} onClick={onClose}>
                                Cancel
                            </Button>
                            <Button
                                variant="primary"
                                disabled={Boolean(busy) || !canPublish}
                                onClick={() => void handlePublish()}
                            >
                                {busy === 'publish' ? (
                                    <LoaderCircle className="m-spin" size={17} />
                                ) : (
                                    <Share2 size={17} />
                                )}{' '}
                                Publish character
                            </Button>
                        </div>
                    </div>
                )
            )}
        </Modal>
    );
}

export function CharacterBrowseView({ controller }: { controller: ModernController }) {
    const [characters, setCharacters] = useState<PublicCharacter[]>([]);
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState<'newest' | 'popular' | 'name'>('newest');
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [reload, setReload] = useState(0);
    const [generatorOpen, setGeneratorOpen] = useState(false);
    const [selectedReferences, setSelectedReferences] = useState<Map<number, PublicCharacter>>(
        new Map()
    );
    const isAdmin = controller.user.isAdmin;

    useEffect(() => {
        let cancelled = false;
        const timer = window.setTimeout(
            () => {
                setLoading(true);
                void fetchPublicCharacters(query, sort)
                    .then((items) => {
                        if (!cancelled) setCharacters(items);
                    })
                    .catch((error) => {
                        if (!cancelled) controller.notify((error as Error).message, 'error');
                    })
                    .finally(() => {
                        if (!cancelled) setLoading(false);
                    });
            },
            query ? 250 : 0
        );
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [controller.notify, query, reload, sort]);

    function toggleReference(character: PublicCharacter) {
        setSelectedReferences((current) => {
            const next = new Map(current);
            if (next.has(character.id)) next.delete(character.id);
            else if (next.size < 120) next.set(character.id, character);
            return next;
        });
    }

    async function handleImport(publication: PublicCharacter) {
        setBusyId(publication.id);
        try {
            const source = await importPublicCharacter(publication.id);
            const imported: ModernCharacter = {
                id: crypto.randomUUID(),
                name: source.name,
                avatar: source.avatar || '✨',
                thumbnail: source.thumbnail || undefined,
                description: source.description || '',
                appearance: source.appearance || '',
                background: source.background || '',
                greeting: source.greeting || '',
                userInfo: '',
                systemPrompt: source.systemPrompt,
                messages: source.greeting
                    ? [
                          {
                              id: crypto.randomUUID(),
                              role: 'assistant',
                              content: source.greeting
                          }
                      ]
                    : [],
                memorySnapshots: [],
                contextMessageCount:
                    source.contextMessageCount || controller.data.settings.contextMessageCount,
                openrouterSessionId: null
            };
            controller.saveCharacter(imported);
            controller.selectCharacter(imported.id);
            controller.notify(`Imported ${source.name}. You can start chatting now.`, 'success');
        } catch (error) {
            controller.notify((error as Error).message, 'error');
        } finally {
            setBusyId(null);
        }
    }

    async function handleUnpublish(publication: PublicCharacter) {
        if (!window.confirm(`Remove ${publication.name} from Character Browse?`)) return;
        setBusyId(publication.id);
        try {
            await unpublishCharacter(publication.id);
            setSelectedReferences((current) => {
                const next = new Map(current);
                next.delete(publication.id);
                return next;
            });
            controller.notify('Character removed from Character Browse.', 'success');
            setReload((current) => current + 1);
        } catch (error) {
            controller.notify((error as Error).message, 'error');
        } finally {
            setBusyId(null);
        }
    }

    function handleGeneratedPublication(character: PublicCharacter) {
        setGeneratorOpen(false);
        setSelectedReferences(new Map());
        setQuery('');
        setSort('newest');
        setReload((current) => current + 1);
        controller.notify(`${character.name} published to Character Browse.`, 'success');
    }

    return (
        <div className="m-page">
            <section className="m-page-hero">
                <div>
                    <span className="m-eyebrow">Community characters</span>
                    <h2>Find your next conversation.</h2>
                    <p>
                        Browse characters shared by other users. Importing creates a private copy in
                        your library, so your chats and edits remain yours.
                    </p>
                </div>
                {isAdmin ? (
                    <div className="m-page-hero__actions">
                        <Button variant="primary" onClick={() => setGeneratorOpen(true)}>
                            <WandSparkles size={17} /> Generate character
                        </Button>
                        <Button onClick={() => controller.setView('characters')}>
                            <Share2 size={17} /> Publish yours
                        </Button>
                    </div>
                ) : (
                    <Button onClick={() => controller.setView('characters')}>
                        <Share2 size={17} /> Publish yours
                    </Button>
                )}
            </section>
            <section className="m-browse-tools" aria-label="Browse filters">
                <label className="m-search">
                    <Search size={17} />
                    <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search characters or creators..."
                        aria-label="Search public characters"
                    />
                </label>
                <label className="m-field">
                    <span>Sort by</span>
                    <select
                        value={sort}
                        onChange={(event) =>
                            setSort(event.target.value as 'newest' | 'popular' | 'name')
                        }
                        aria-label="Sort public characters"
                    >
                        <option value="newest">Newest</option>
                        <option value="popular">Most imported</option>
                        <option value="name">Name</option>
                    </select>
                </label>
            </section>
            {isAdmin && selectedReferences.size > 0 && (
                <div className="m-reference-selection-summary">
                    <WandSparkles size={18} />
                    <span>
                        <strong>{selectedReferences.size}</strong> originality reference
                        {selectedReferences.size === 1 ? '' : 's'} selected
                    </span>
                    <Button variant="ghost" onClick={() => setSelectedReferences(new Map())}>
                        <X size={16} /> Clear
                    </Button>
                </div>
            )}
            {loading ? (
                <div className="m-empty-panel large">
                    <LoaderCircle className="m-spin" size={28} />
                    <span>Loading public characters...</span>
                </div>
            ) : characters.length === 0 ? (
                <div className="m-empty-panel large">
                    <Compass size={34} />
                    <strong>
                        {query ? 'No matching characters' : 'No characters published yet'}
                    </strong>
                    <span>
                        {query
                            ? 'Try a different search.'
                            : isAdmin
                              ? 'Generate the first character, or publish one from your library.'
                              : 'Be the first to share a character from your library.'}
                    </span>
                </div>
            ) : (
                <section className="m-character-grid" aria-label="Public characters">
                    {characters.map((character) => {
                        const selected = selectedReferences.has(character.id);
                        return (
                            <article
                                key={character.id}
                                className={`m-character-card m-public-character${selected ? ' is-reference' : ''}`}
                            >
                                <div className="m-character-card__visual">
                                    <PublicCharacterVisual character={character} />
                                    {isAdmin && (
                                        <label className="m-reference-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={selected}
                                                disabled={
                                                    !selected && selectedReferences.size >= 120
                                                }
                                                onChange={() => toggleReference(character)}
                                                aria-label={`Use ${character.name} as a generation reference`}
                                            />
                                            <span>Reference</span>
                                        </label>
                                    )}
                                    <i>{character.imports} imports</i>
                                </div>
                                <div className="m-character-card__body">
                                    <span className="m-eyebrow">
                                        {character.isOwner
                                            ? 'Published by you'
                                            : `by @${character.creator}`}
                                    </span>
                                    <h3>{character.name}</h3>
                                    <p>
                                        {character.description ||
                                            character.appearance ||
                                            'No description provided.'}
                                    </p>
                                    <div>
                                        {character.isOwner && (
                                            <Button
                                                variant="ghost"
                                                disabled={busyId === character.id}
                                                onClick={() => void handleUnpublish(character)}
                                            >
                                                <Trash2 size={16} /> Unpublish
                                            </Button>
                                        )}
                                        <Button
                                            variant="primary"
                                            disabled={busyId === character.id}
                                            onClick={() => void handleImport(character)}
                                        >
                                            {busyId === character.id ? (
                                                <LoaderCircle className="m-spin" size={16} />
                                            ) : (
                                                <Download size={16} />
                                            )}{' '}
                                            Import &amp; chat
                                        </Button>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </section>
            )}
            {isAdmin && generatorOpen && (
                <AdminCharacterGeneratorModal
                    references={[...selectedReferences.values()]}
                    settings={controller.data.settings}
                    onClose={() => setGeneratorOpen(false)}
                    onPublished={handleGeneratedPublication}
                />
            )}
        </div>
    );
}
