import { getCharacterThumbnailUrl } from '../character-thumbnails.js';
import type { GalleryItem, ModernCharacter } from '../types.js';

export function Avatar({
    character,
    galleryImages,
    size = 'normal'
}: {
    character?: ModernCharacter;
    galleryImages: GalleryItem[];
    size?: 'small' | 'normal' | 'large';
}) {
    const thumbnailUrl = getCharacterThumbnailUrl(character, galleryImages);

    return (
        <span className={`m-avatar m-avatar--${size}`}>
            {thumbnailUrl ? (
                <img src={thumbnailUrl} alt="" />
            ) : (
                <span>{character?.avatar || '✨'}</span>
            )}
        </span>
    );
}

export function CharacterVisual({
    character,
    galleryImages
}: {
    character: ModernCharacter;
    galleryImages: GalleryItem[];
}) {
    const thumbnailUrl = getCharacterThumbnailUrl(character, galleryImages);
    return thumbnailUrl ? (
        <img src={thumbnailUrl} alt="" />
    ) : (
        <span>{character.avatar || '✨'}</span>
    );
}
