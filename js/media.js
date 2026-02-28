const DATA_IMAGE_URL_PREFIX = 'data:image/';
const MEDIA_UPLOAD_ENDPOINT = '/api/media/store';

function isDataImageUrl(imageUrl) {
    return typeof imageUrl === 'string' && imageUrl.startsWith(DATA_IMAGE_URL_PREFIX);
}

export async function persistImageForStorage(imageUrl) {
    if (!isDataImageUrl(imageUrl)) {
        return imageUrl;
    }

    try {
        const response = await fetch(MEDIA_UPLOAD_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ dataUrl: imageUrl })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || `Failed to store image (${response.status})`);
        }

        if (typeof payload.url !== 'string' || payload.url.length === 0) {
            throw new Error('Stored image URL was missing from the server response.');
        }

        return payload.url;
    } catch (error) {
        console.warn('Failed to persist generated image on server:', error);
        return imageUrl;
    }
}
