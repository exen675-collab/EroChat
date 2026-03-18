const path = require('path');
const zlib = require('zlib');
const { Buffer } = require('buffer');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHARACTER_CARD_KEYWORD = 'chara';
const CHARACTER_CARD_SPEC = 'chara_card_v2';

function createImportError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonText(jsonText) {
    try {
        return JSON.parse(jsonText);
    } catch {
        return null;
    }
}

function parseCardJsonText(payloadText) {
    const trimmed = String(payloadText || '').trim();
    if (!trimmed) {
        throw createImportError('Character card payload was empty.');
    }

    const direct = parseJsonText(trimmed);
    if (direct) {
        return direct;
    }

    try {
        const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
        const parsed = parseJsonText(decoded);
        if (parsed) {
            return parsed;
        }
    } catch {
        // Fall through to the generic error below.
    }

    throw createImportError('Character card payload was not valid JSON.');
}

function validateCharacterCard(card) {
    if (!isPlainObject(card)) {
        throw createImportError('Character card must be a JSON object.');
    }

    const spec = typeof card.spec === 'string' ? card.spec.trim() : '';
    if (spec !== CHARACTER_CARD_SPEC) {
        throw createImportError(
            'Only SillyTavern Character Card V2 files are supported for import.'
        );
    }

    const specVersion = typeof card.spec_version === 'string' ? card.spec_version.trim() : '';
    if (specVersion && !specVersion.startsWith('2')) {
        throw createImportError(
            `Unsupported Character Card version "${specVersion}". Only V2 cards are supported.`
        );
    }

    if (!isPlainObject(card.data)) {
        throw createImportError('Character card data was missing or malformed.');
    }

    const name = typeof card.data.name === 'string' ? card.data.name.trim() : '';
    if (!name) {
        throw createImportError('Character card data must include a character name.');
    }

    return {
        spec: CHARACTER_CARD_SPEC,
        spec_version: specVersion || '2.0',
        data: card.data
    };
}

function decodeTextChunk(data) {
    const separatorIndex = data.indexOf(0);
    if (separatorIndex <= 0) return null;

    return {
        keyword: data.subarray(0, separatorIndex).toString('latin1'),
        text: data.subarray(separatorIndex + 1).toString('latin1')
    };
}

function decodeCompressedTextChunk(data) {
    const separatorIndex = data.indexOf(0);
    if (separatorIndex <= 0 || separatorIndex + 2 > data.length) return null;

    const compressionMethod = data[separatorIndex + 1];
    if (compressionMethod !== 0) {
        throw createImportError('Unsupported compressed PNG metadata format.');
    }

    const compressed = data.subarray(separatorIndex + 2);
    try {
        const text = zlib.inflateSync(compressed).toString('latin1');
        return {
            keyword: data.subarray(0, separatorIndex).toString('latin1'),
            text
        };
    } catch {
        throw createImportError('Compressed PNG metadata could not be decoded.');
    }
}

function decodeInternationalTextChunk(data) {
    const keywordEnd = data.indexOf(0);
    if (keywordEnd <= 0 || keywordEnd + 5 > data.length) return null;

    const compressionFlag = data[keywordEnd + 1];
    const compressionMethod = data[keywordEnd + 2];

    const languageTagEnd = data.indexOf(0, keywordEnd + 3);
    if (languageTagEnd === -1) return null;

    const translatedKeywordEnd = data.indexOf(0, languageTagEnd + 1);
    if (translatedKeywordEnd === -1) return null;

    const textBuffer = data.subarray(translatedKeywordEnd + 1);
    if (compressionFlag === 1) {
        if (compressionMethod !== 0) {
            throw createImportError('Unsupported compressed PNG metadata format.');
        }
        try {
            return {
                keyword: data.subarray(0, keywordEnd).toString('latin1'),
                text: zlib.inflateSync(textBuffer).toString('utf8')
            };
        } catch {
            throw createImportError('Compressed PNG metadata could not be decoded.');
        }
    }

    return {
        keyword: data.subarray(0, keywordEnd).toString('latin1'),
        text: textBuffer.toString('utf8')
    };
}

function parsePngChunks(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < PNG_SIGNATURE.length) {
        throw createImportError('PNG file was empty or malformed.');
    }

    if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
        throw createImportError('File is not a valid PNG image.');
    }

    const chunks = [];
    let offset = PNG_SIGNATURE.length;

    while (offset + 12 <= buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const typeStart = offset + 4;
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        const crcEnd = dataEnd + 4;

        if (dataEnd > buffer.length || crcEnd > buffer.length) {
            throw createImportError('PNG metadata was truncated.');
        }

        chunks.push({
            type: buffer.subarray(typeStart, dataStart).toString('ascii'),
            data: buffer.subarray(dataStart, dataEnd)
        });

        offset = crcEnd;
    }

    return chunks;
}

function extractCardPayloadFromPng(buffer) {
    const chunks = parsePngChunks(buffer);

    for (const chunk of chunks) {
        let entry = null;

        if (chunk.type === 'tEXt') {
            entry = decodeTextChunk(chunk.data);
        } else if (chunk.type === 'zTXt') {
            entry = decodeCompressedTextChunk(chunk.data);
        } else if (chunk.type === 'iTXt') {
            entry = decodeInternationalTextChunk(chunk.data);
        }

        if (!entry) continue;
        if (String(entry.keyword || '').trim().toLowerCase() !== CHARACTER_CARD_KEYWORD) {
            continue;
        }

        const text = String(entry.text || '').trim();
        if (!text) {
            throw createImportError('Character card metadata was empty.');
        }

        return text;
    }

    throw createImportError('PNG file did not contain Character Card V2 metadata.');
}

function parseCharacterCardJsonBuffer(buffer) {
    const rawText = buffer.toString('utf8').replace(/^\uFEFF/, '');
    return validateCharacterCard(parseCardJsonText(rawText));
}

function parseCharacterCardPngBuffer(buffer) {
    const payload = extractCardPayloadFromPng(buffer);
    return validateCharacterCard(parseCardJsonText(payload));
}

function isJsonMimeType(mimeType) {
    return ['application/json', 'text/json', 'text/plain'].includes(String(mimeType || ''));
}

function parseCharacterCardImportFile(file) {
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
        throw createImportError('A character card file is required.');
    }

    const mimeType = String(file.mimetype || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
    const extension = path.extname(file.originalname || '').toLowerCase();
    const isPng = mimeType === 'image/png' || extension === '.png';
    const isJson = isJsonMimeType(mimeType) || extension === '.json';

    if (!isPng && !isJson) {
        throw createImportError('Only .png and .json character cards can be imported.');
    }

    const card = isPng
        ? parseCharacterCardPngBuffer(file.buffer)
        : parseCharacterCardJsonBuffer(file.buffer);

    return {
        card,
        fileName: file.originalname || '',
        thumbnailBuffer: isPng ? file.buffer : null,
        thumbnailMimeType: isPng ? 'image/png' : null,
        warnings: []
    };
}

module.exports = {
    CHARACTER_CARD_SPEC,
    extractCardPayloadFromPng,
    parseCardJsonText,
    parseCharacterCardImportFile,
    parseCharacterCardJsonBuffer,
    parseCharacterCardPngBuffer,
    validateCharacterCard
};
