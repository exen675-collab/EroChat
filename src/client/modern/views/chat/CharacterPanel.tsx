import { Eraser, GalleryHorizontalEnd, LoaderCircle, Pencil, X } from 'lucide-react';
import { useState } from 'react';
import { getCharacterThumbnailUrl } from '../../character-thumbnails.js';
import type { ModernController } from '../../useModernController.js';

export function CharacterPanel({
    controller,
    onClose,
    onEdit,
    onLightbox
}: {
    controller: ModernController;
    onClose: () => void;
    onEdit: () => void;
    onLightbox: (url: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const character = controller.currentCharacter;
    if (!character) return null;

    const messages = controller.messages;
    const active = messages.filter((message) => !message.archivedFromModelContext).length;
    const archived = messages.length - active;
    const limit =
        (character.contextMessageCount || controller.data.settings.contextMessageCount) * 2;
    const percent = Math.min(100, Math.round((active / Math.max(1, limit)) * 100));
    const memories = [...(character.memorySnapshots || [])].reverse();
    const scenes = messages
        .filter((message) => message.imageUrl)
        .slice(-6)
        .reverse();
    const hero = getCharacterThumbnailUrl(character, controller.thumbnailImages);
    const about = character.description || character.appearance || '';

    return (
        <div className="m-panel__inner">
            <div className={`m-panel__hero ${hero ? '' : 'is-plain'}`}>
                {hero ? (
                    <img src={hero} alt="" />
                ) : (
                    <span className="m-panel__initial">
                        {character.avatar || character.name.slice(0, 1)}
                    </span>
                )}
                <button
                    className="m-icon-btn m-panel__close"
                    aria-label="Close character panel"
                    onClick={onClose}
                >
                    <X size={18} />
                </button>
                <div className="m-panel__name">
                    <h2>{character.name}</h2>
                    <p>
                        {messages.length} {messages.length === 1 ? 'message' : 'messages'}
                        {character.isDefault ? ' · Default' : ''}
                    </p>
                </div>
            </div>
            <div className="m-panel__btns">
                <button className="m-btn m-btn--grow" onClick={onEdit}>
                    <Pencil size={15} /> Edit
                </button>
                <button
                    className="m-btn m-btn--grow"
                    onClick={() => {
                        controller.setGalleryFilters({ galleryFilterCharacterId: character.id });
                        controller.setView('gallery');
                    }}
                >
                    <GalleryHorizontalEnd size={15} /> Gallery
                </button>
                <button
                    className="m-btn"
                    aria-label="Clear chat"
                    title="Clear chat"
                    disabled={!messages.length}
                    onClick={() =>
                        window.confirm(`Clear the whole conversation with ${character.name}?`) &&
                        controller.clearChat()
                    }
                >
                    <Eraser size={15} />
                </button>
            </div>
            {about && (
                <section className="m-panel__section">
                    <div className="m-panel__label">About</div>
                    <p className={`m-panel__desc ${expanded ? '' : 'is-clamped'}`}>{about}</p>
                    {about.length > 280 && (
                        <button
                            className="m-panel__more"
                            onClick={() => setExpanded((value) => !value)}
                        >
                            {expanded ? 'Show less' : 'Show more'}
                        </button>
                    )}
                </section>
            )}
            <section className="m-panel__section">
                <div className="m-panel__label">
                    Context
                    <button onClick={() => controller.increaseContextLimit(20)}>
                        Increase +20
                    </button>
                </div>
                <div
                    className={`m-meter ${percent >= 100 ? 'is-full' : ''}`}
                    role="meter"
                    aria-label="Context usage"
                    aria-valuemin={0}
                    aria-valuemax={limit}
                    aria-valuenow={active}
                >
                    <i style={{ width: `${percent}%` }} />
                </div>
                <div className="m-meter-row">
                    <span>Active messages</span>
                    <b>
                        {active} / {limit}
                    </b>
                </div>
                <div className="m-stats3">
                    <div>
                        <b>{messages.length}</b>
                        <span>messages</span>
                    </div>
                    <div>
                        <b>{archived}</b>
                        <span>archived</span>
                    </div>
                    <div>
                        <b>{memories.length}</b>
                        <span>memories</span>
                    </div>
                </div>
            </section>
            <section className="m-panel__section">
                <div className="m-panel__label">
                    Memory
                    <button
                        disabled={controller.busy === 'memory' || active === 0}
                        onClick={() => void controller.compressMemory()}
                    >
                        {controller.busy === 'memory' && (
                            <LoaderCircle className="spin" size={12} />
                        )}
                        Compress
                    </button>
                </div>
                {memories.length ? (
                    memories.slice(0, 4).map((memory) => (
                        <p className="m-panel__memory" key={memory.id}>
                            {memory.finalText}
                        </p>
                    ))
                ) : (
                    <p className="m-panel__desc">
                        No memories yet. They appear once older messages are compressed.
                    </p>
                )}
            </section>
            {scenes.length > 0 && (
                <section className="m-panel__section">
                    <div className="m-panel__label">
                        Scenes
                        <button
                            onClick={() => {
                                controller.setGalleryFilters({
                                    galleryFilterCharacterId: character.id
                                });
                                controller.setView('gallery');
                            }}
                        >
                            View all
                        </button>
                    </div>
                    <div className="m-panel__scenes">
                        {scenes.map((message) => (
                            <button
                                key={message.id}
                                aria-label="Open scene image"
                                onClick={() => onLightbox(message.imageUrl!)}
                            >
                                <img src={message.imageUrl!} alt="" loading="lazy" />
                            </button>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
