import type { ModernMessage, ReplyVersion } from './types.js';

function snapshot(message: ModernMessage): ReplyVersion {
    return {
        content: message.content,
        imageUrl: message.imageUrl || null,
        videoUrl: message.videoUrl || null
    };
}

/** Every version of a reply in order, with the shown one at `versionIndex`. */
export function replyVersions(message: ModernMessage): ReplyVersion[] {
    const others = message.otherVersions || [];
    const index = Math.min(Math.max(message.versionIndex ?? others.length, 0), others.length);
    return [...others.slice(0, index), snapshot(message), ...others.slice(index)];
}

/** Starts a regenerated reply that keeps every version of the reply it replaces. */
export function succeedingVersion(
    previous: ModernMessage | undefined,
    reply: ModernMessage
): ModernMessage {
    if (!previous || previous.role !== 'assistant') return reply;
    const otherVersions = replyVersions(previous);
    return { ...reply, otherVersions, versionIndex: otherVersions.length };
}

/** Shows another version of a reply; its scene image travels with it. */
export function selectReplyVersion(message: ModernMessage, index: number): ModernMessage {
    const versions = replyVersions(message);
    const chosen = versions[index];
    if (!chosen || index === (message.versionIndex ?? versions.length - 1)) return message;
    return {
        ...message,
        ...chosen,
        mediaJobId: null,
        mediaStatus: chosen.imageUrl || chosen.videoUrl ? 'completed' : null,
        mediaError: null,
        editedAt: null,
        otherVersions: versions.filter((_, position) => position !== index),
        versionIndex: index
    };
}

/** The opening message; a card's alternate greetings become versions to page through. */
export function greetingMessage(
    id: string,
    greeting: string,
    alternates: string[] = [],
    createdAt?: string
): ModernMessage {
    const others = [...new Set(alternates)].filter((text) => text && text !== greeting);
    return {
        id,
        role: 'assistant',
        content: greeting,
        ...(createdAt ? { createdAt } : {}),
        ...(others.length
            ? { otherVersions: others.map((content) => ({ content })), versionIndex: 0 }
            : {})
    };
}
