import { Search, UserRoundPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { getAssistantVisibleText } from '../../../utils.js';
import { sortCharactersByRecentUse } from '../../character-sort.js';
import { formatConversationTime } from '../../chat-time.js';
import { Portrait } from '../../components/character-visuals.js';
import type { ModernCharacter } from '../../types.js';
import type { ModernController } from '../../useModernController.js';

function lastActivity(character: ModernCharacter): string | undefined {
    return character.messages.at(-1)?.createdAt || character.lastUsedAt;
}

function preview(character: ModernCharacter): string {
    const last = [...character.messages].reverse().find((message) => message.content);
    if (!last) return character.greeting || character.description || 'Start a new scene';
    const text = (last.role === 'assistant' ? getAssistantVisibleText(last.content) : last.content)
        .replace(/\*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return last.role === 'user' ? `You: ${text}` : text;
}

export function ConversationList({
    controller,
    onOpen
}: {
    controller: ModernController;
    onOpen: () => void;
}) {
    const [query, setQuery] = useState('');
    const characters = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return sortCharactersByRecentUse(controller.data.characters).filter(
            (character) => !needle || character.name.toLowerCase().includes(needle)
        );
    }, [controller.data.characters, query]);

    return (
        <section className="m-convos" aria-label="Conversations">
            <header className="m-convos__head">
                <h2>Chats</h2>
                <button
                    className="m-icon-btn"
                    aria-label="Manage characters"
                    title="Manage characters"
                    onClick={() => controller.setView('characters')}
                >
                    <UserRoundPlus size={18} strokeWidth={1.75} />
                </button>
            </header>
            <label className="m-search-field">
                <Search size={16} strokeWidth={1.75} />
                <input
                    type="search"
                    aria-label="Search chats"
                    placeholder="Search chats"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                />
            </label>
            <div className="m-convos__list">
                {characters.map((character) => (
                    <button
                        key={character.id}
                        aria-label={`Chat with ${character.name}`}
                        className={`m-convo ${character.id === controller.currentCharacter?.id ? 'is-active' : ''}`}
                        onClick={() => {
                            if (character.id !== controller.currentCharacter?.id) {
                                controller.selectCharacter(character.id);
                            }
                            onOpen();
                        }}
                    >
                        <Portrait
                            character={character}
                            galleryImages={controller.thumbnailImages}
                            size={46}
                        />
                        <span className="m-convo__body">
                            <span className="m-convo__top">
                                <strong>{character.name}</strong>
                                <time>{formatConversationTime(lastActivity(character))}</time>
                            </span>
                            <span className="m-convo__last">{preview(character)}</span>
                        </span>
                    </button>
                ))}
                {characters.length === 0 && (
                    <p className="m-convos__empty">No chats match “{query}”.</p>
                )}
            </div>
        </section>
    );
}
