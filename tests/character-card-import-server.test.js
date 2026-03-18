/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import zlib from 'zlib';

import {
    parseCharacterCardPngBuffer,
    parseCharacterCardImportFile
} from '../character-card-import.cjs';

function createCard(overrides = {}) {
    return {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
            name: 'Seraphine',
            description: 'A mysterious stranger.',
            first_mes: 'Hello there.',
            ...overrides
        }
    };
}

function createPngChunk(type, data = Buffer.alloc(0)) {
    const chunkData = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const chunk = Buffer.alloc(12 + chunkData.length);
    chunk.writeUInt32BE(chunkData.length, 0);
    chunk.write(type, 4, 4, 'ascii');
    chunkData.copy(chunk, 8);
    chunk.writeUInt32BE(0, 8 + chunkData.length);
    return chunk;
}

function createMinimalPng(metadataChunk) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1, 0);
    ihdr.writeUInt32BE(1, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const iend = createPngChunk('IEND');

    return Buffer.concat([signature, createPngChunk('IHDR', ihdr), metadataChunk, iend]);
}

function createTextMetadataChunk(card) {
    const payload = Buffer.from(JSON.stringify(card), 'utf8').toString('base64');
    return createPngChunk('tEXt', Buffer.from(`chara\0${payload}`, 'latin1'));
}

function createCompressedMetadataChunk(card) {
    const payload = Buffer.from(JSON.stringify(card), 'utf8').toString('base64');
    const compressed = zlib.deflateSync(Buffer.from(payload, 'latin1'));
    return createPngChunk(
        'zTXt',
        Buffer.concat([Buffer.from('chara\0', 'latin1'), Buffer.from([0]), compressed])
    );
}

describe('server-side character card import parsing', () => {
    it('parses JSON card files', () => {
        const card = createCard();
        const parsed = parseCharacterCardImportFile({
            originalname: 'seraphine.json',
            mimetype: 'application/json',
            buffer: Buffer.from(JSON.stringify(card), 'utf8')
        });

        expect(parsed.card).toEqual(card);
        expect(parsed.thumbnailBuffer).toBeNull();
        expect(parsed.fileName).toBe('seraphine.json');
    });

    it('extracts Character Card V2 payloads from PNG metadata and keeps the PNG as the thumbnail', () => {
        const card = createCard({ description: 'Embedded in PNG metadata.' });
        const pngBuffer = createMinimalPng(createTextMetadataChunk(card));
        const parsed = parseCharacterCardImportFile({
            originalname: 'seraphine.png',
            mimetype: 'image/png',
            buffer: pngBuffer
        });

        expect(parsed.card).toEqual(card);
        expect(parsed.thumbnailMimeType).toBe('image/png');
        expect(parsed.thumbnailBuffer.equals(pngBuffer)).toBe(true);
    });

    it('supports compressed PNG metadata chunks', () => {
        const card = createCard({ first_mes: 'Compressed hello.' });
        const pngBuffer = createMinimalPng(createCompressedMetadataChunk(card));

        expect(parseCharacterCardPngBuffer(pngBuffer)).toEqual(card);
    });

    it('rejects PNG files without character metadata', () => {
        const pngBuffer = createMinimalPng(createPngChunk('tEXt', Buffer.from('note\0hello', 'latin1')));

        expect(() =>
            parseCharacterCardImportFile({
                originalname: 'missing-card.png',
                mimetype: 'image/png',
                buffer: pngBuffer
            })
        ).toThrow('PNG file did not contain Character Card V2 metadata.');
    });

    it('rejects unsupported or malformed files safely', () => {
        expect(() =>
            parseCharacterCardImportFile({
                originalname: 'broken.png',
                mimetype: 'image/png',
                buffer: Buffer.from('not a png')
            })
        ).toThrow('File is not a valid PNG image.');

        expect(() =>
            parseCharacterCardImportFile({
                originalname: 'legacy.json',
                mimetype: 'application/json',
                buffer: Buffer.from(
                    JSON.stringify({
                        spec: 'chara_card_v1',
                        spec_version: '1.0',
                        data: { name: 'Legacy' }
                    }),
                    'utf8'
                )
            })
        ).toThrow('Only SillyTavern Character Card V2 files are supported for import.');
    });
});
