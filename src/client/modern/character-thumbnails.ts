import type { GalleryItem, ModernCharacter } from './types.js';

function getCreatedAtTime(item: GalleryItem): number {
    const parsed = Date.parse(item.createdAt || '');
    return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

export function getCharacterThumbnailUrl(
    character: ModernCharacter | undefined,
    galleryImages: GalleryItem[]
): string | null {
    if (!character) return null;
    if (character.thumbnail) return character.thumbnail;

    const firstGeneratedImage = galleryImages
        .filter((item) => item.characterId === character.id && item.imageUrl)
        .sort((a, b) => getCreatedAtTime(a) - getCreatedAtTime(b))[0];

    return firstGeneratedImage?.imageUrl || null;
}
