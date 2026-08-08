export interface MessageTextSegment {
    text: string;
    narrative: boolean;
}

export function parseNarrativeSegments(text: string): MessageTextSegment[] {
    const segments: MessageTextSegment[] = [];
    const narrativePattern = /(?<!\*)\*([^*\n]+)\*(?!\*)/g;
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = narrativePattern.exec(text)) !== null) {
        if (match.index > cursor) {
            segments.push({ text: text.slice(cursor, match.index), narrative: false });
        }
        segments.push({ text: match[1], narrative: true });
        cursor = match.index + match[0].length;
    }

    if (cursor < text.length) {
        segments.push({ text: text.slice(cursor), narrative: false });
    }

    return segments.length ? segments : [{ text, narrative: false }];
}
