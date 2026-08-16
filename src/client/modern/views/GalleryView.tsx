import { CircleUserRound, Download, GalleryHorizontalEnd, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Modal } from '../components/ui.js';
import type { GalleryItem } from '../types.js';
import type { ModernController } from '../useModernController.js';

function mergedGallery(controller: ModernController): GalleryItem[] {
    const generated: GalleryItem[] = controller.generatorAssets.map((asset) => ({
        id: `generator-${asset.id}`,
        imageUrl: asset.mediaType === 'image' ? asset.url : null,
        videoUrl: asset.mediaType === 'video' ? asset.url : null,
        source: asset.source || 'manual',
        characterId: asset.characterId,
        messageId: asset.messageId,
        prompt: asset.prompt,
        createdAt: asset.createdAt,
        metadata: asset.metadata
    }));
    const all = [...controller.data.galleryImages, ...generated];
    const query = controller.data.gallerySearchQuery.trim().toLowerCase();
    return all
        .filter((item) => {
            const sourceOk =
                controller.data.gallerySourceFilter === 'all' ||
                String(item.source).includes(controller.data.gallerySourceFilter);
            const charOk =
                controller.data.galleryFilterCharacterId === 'all' ||
                item.characterId === controller.data.galleryFilterCharacterId;
            const haystack = JSON.stringify(item).toLowerCase();
            return (
                sourceOk &&
                charOk &&
                (!query ||
                    query
                        .split(/\s+/)
                        .every((term) => haystack.includes(term.replace(/^\w+:/, ''))))
            );
        })
        .sort((a, b) => {
            const order =
                new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
            return controller.data.gallerySortOrder === 'oldest' ? -order : order;
        });
}

export function GalleryView({ controller }: { controller: ModernController }) {
    const [lightbox, setLightbox] = useState<GalleryItem | null>(null);
    const [thumbnailTarget, setThumbnailTarget] = useState(
        controller.currentCharacter?.id || 'default'
    );
    const items = useMemo(
        () => mergedGallery(controller),
        [
            controller.data.galleryImages,
            controller.generatorAssets,
            controller.data.gallerySearchQuery,
            controller.data.gallerySortOrder,
            controller.data.gallerySourceFilter,
            controller.data.galleryFilterCharacterId
        ]
    );
    return (
        <div className="m-page">
            <section className="m-page-hero">
                <div>
                    <span className="m-eyebrow">Media library</span>
                    <h2>Every scene, in one place.</h2>
                    <p>Browse chat images and generator output together.</p>
                </div>
            </section>
            <section className="m-gallery-tools">
                <label className="m-search">
                    <Search size={18} />
                    <input
                        aria-label="Search gallery"
                        placeholder="Search prompts, models, tags, dates…"
                        value={controller.data.gallerySearchQuery}
                        onChange={(event) =>
                            controller.setGalleryFilters({ gallerySearchQuery: event.target.value })
                        }
                    />
                </label>
                <select
                    aria-label="Sort gallery"
                    value={controller.data.gallerySortOrder}
                    onChange={(event) =>
                        controller.setGalleryFilters({ gallerySortOrder: event.target.value })
                    }
                >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                </select>
                <select
                    aria-label="Filter source"
                    value={controller.data.gallerySourceFilter}
                    onChange={(event) =>
                        controller.setGalleryFilters({ gallerySourceFilter: event.target.value })
                    }
                >
                    <option value="all">All sources</option>
                    <option value="chat">Chat</option>
                    <option value="manual">Generator</option>
                    <option value="regenerate">Regenerated</option>
                </select>
                <select
                    aria-label="Filter character"
                    value={controller.data.galleryFilterCharacterId}
                    onChange={(event) =>
                        controller.setGalleryFilters({
                            galleryFilterCharacterId: event.target.value
                        })
                    }
                >
                    <option value="all">All characters</option>
                    {controller.data.characters.map((character) => (
                        <option key={character.id} value={character.id}>
                            {character.name}
                        </option>
                    ))}
                </select>
            </section>
            {items.length ? (
                <section className="m-gallery-grid">
                    {items.map((item) => (
                        <article key={item.id} className="m-gallery-card">
                            <button onClick={() => setLightbox(item)}>
                                {item.videoUrl ? (
                                    <video src={item.videoUrl} muted playsInline />
                                ) : (
                                    <img
                                        src={item.imageUrl || ''}
                                        alt="Generated media"
                                        loading="lazy"
                                    />
                                )}
                                <span>{item.source || 'chat'}</span>
                            </button>
                            <div>
                                <strong>
                                    {item.characterName ||
                                        (item.source === 'manual' ? 'Generator' : 'Scene')}
                                </strong>
                                <small>
                                    {item.createdAt
                                        ? new Date(item.createdAt).toLocaleDateString()
                                        : 'Saved media'}
                                </small>
                            </div>
                        </article>
                    ))}
                </section>
            ) : (
                <div className="m-empty-panel large">
                    <GalleryHorizontalEnd size={34} />
                    <h3>No media matches these filters.</h3>
                    <p>Generate an image in chat or the creative suite to start your gallery.</p>
                </div>
            )}
            {lightbox && (
                <Modal title="Gallery preview" onClose={() => setLightbox(null)} size="large">
                    <div className="m-lightbox">
                        {lightbox.videoUrl ? (
                            <video src={lightbox.videoUrl} controls autoPlay />
                        ) : (
                            <img src={lightbox.imageUrl || ''} alt="Gallery preview" />
                        )}
                        <div className="m-lightbox__actions">
                            <select
                                value={thumbnailTarget}
                                onChange={(event) => setThumbnailTarget(event.target.value)}
                            >
                                {controller.data.characters.map((character) => (
                                    <option key={character.id} value={character.id}>
                                        {character.name}
                                    </option>
                                ))}
                            </select>
                            {lightbox.imageUrl && (
                                <Button
                                    onClick={() => {
                                        controller.setCharacterThumbnail(
                                            thumbnailTarget,
                                            lightbox.imageUrl!
                                        );
                                        controller.notify(
                                            'Character thumbnail updated.',
                                            'success'
                                        );
                                    }}
                                >
                                    <CircleUserRound size={17} /> Use as thumbnail
                                </Button>
                            )}
                            <a
                                className="m-button m-button--secondary"
                                href={lightbox.imageUrl || lightbox.videoUrl || ''}
                                download
                            >
                                <Download size={17} /> Download
                            </a>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
