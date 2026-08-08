import { Compass, Download, LoaderCircle, Search, Share2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchPublicCharacters, importPublicCharacter, unpublishCharacter } from '../api.js';
import { Button } from '../components/ui.js';
import type { ModernCharacter, PublicCharacter } from '../types.js';
import type { ModernController } from '../useModernController.js';

function PublicCharacterVisual({ character }: { character: PublicCharacter }) {
    return character.thumbnail ? (
        <img src={character.thumbnail} alt="" />
    ) : (
        <span>{character.avatar || '✨'}</span>
    );
}

export function CharacterBrowseView({ controller }: { controller: ModernController }) {
    const [characters, setCharacters] = useState<PublicCharacter[]>([]);
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState<'newest' | 'popular' | 'name'>('newest');
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [reload, setReload] = useState(0);

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
            controller.notify('Character removed from Character Browse.', 'success');
            setReload((current) => current + 1);
        } catch (error) {
            controller.notify((error as Error).message, 'error');
        } finally {
            setBusyId(null);
        }
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
                <Button onClick={() => controller.setView('characters')}>
                    <Share2 size={17} /> Publish yours
                </Button>
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
                            : 'Be the first to share a character from your library.'}
                    </span>
                </div>
            ) : (
                <section className="m-character-grid" aria-label="Public characters">
                    {characters.map((character) => (
                        <article key={character.id} className="m-character-card m-public-character">
                            <div className="m-character-card__visual">
                                <PublicCharacterVisual character={character} />
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
                    ))}
                </section>
            )}
        </div>
    );
}
