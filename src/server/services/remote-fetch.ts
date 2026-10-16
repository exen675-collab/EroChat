import dns from 'node:dns/promises';
import net from 'node:net';

export const PRIVATE_ADDRESS_MESSAGE =
    'Requests to local or private network addresses are not allowed.';

const MAX_REDIRECTS = 3;

// Every address a server-side fetch may not reach. Anything that is not a plain public unicast
// address belongs here, including IPv4 embedded in IPv6 (mapped, translated, or 6to4 forms).
const blockedAddresses = new net.BlockList();
const BLOCKED_IPV4_SUBNETS: Array<[string, number]> = [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4]
];
// IPv4-mapped IPv6 (::ffff:0:0/96) is deliberately absent: Node stores IPv4 inside that range, so
// a rule for it would also block every public IPv4 address. Mapped addresses are unwrapped below.
const BLOCKED_IPV6_SUBNETS: Array<[string, number]> = [
    ['::', 96],
    ['64:ff9b::', 96],
    ['2002::', 16],
    ['fc00::', 7],
    ['fe80::', 10],
    ['ff00::', 8]
];
for (const [address, prefix] of BLOCKED_IPV4_SUBNETS) {
    blockedAddresses.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of BLOCKED_IPV6_SUBNETS) {
    blockedAddresses.addSubnet(address, prefix, 'ipv6');
}

// Returns the IPv4 address inside an IPv4-mapped IPv6 literal, or null if it cannot be read.
// Node may print the dotted form as hex groups, for example ::ffff:7f00:1 for 127.0.0.1.
function embeddedIpv4(address: string): string | null {
    const tail = address.slice('::ffff:'.length);
    if (net.isIPv4(tail)) return tail;

    const groups = tail.split(':');
    if (groups.length !== 2 || !groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) {
        return null;
    }
    const [high, low] = groups.map((group) => Number.parseInt(group, 16));
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

function isBlockedAddress(address: string): boolean {
    const family = net.isIP(address);
    // Unparseable results (including zone-scoped IPv6) are refused rather than assumed public.
    if (family === 0) return true;
    if (family === 4) return blockedAddresses.check(address, 'ipv4');

    if (address.toLowerCase().startsWith('::ffff:')) {
        const ipv4 = embeddedIpv4(address.toLowerCase());
        return ipv4 === null || blockedAddresses.check(ipv4, 'ipv4');
    }
    return blockedAddresses.check(address, 'ipv6');
}

async function resolveHostAddresses(hostname: string): Promise<string[]> {
    try {
        const entries = await dns.lookup(hostname, { all: true });
        return entries.map((entry) => entry.address);
    } catch {
        throw new Error('The remote host could not be resolved.');
    }
}

// Validates a URL for a server-side request. A DNS name is accepted only when every address it
// resolves to is public, so a name pointing at an internal host is refused as well.
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new Error('A valid remote URL is required.');
    }

    if (!/^https?:$/i.test(parsed.protocol)) {
        throw new Error('Only http or https media URLs are supported.');
    }

    const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (
        !hostname ||
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.local')
    ) {
        throw new Error(PRIVATE_ADDRESS_MESSAGE);
    }

    const addresses = net.isIP(hostname) ? [hostname] : await resolveHostAddresses(hostname);
    if (addresses.length === 0 || addresses.some(isBlockedAddress)) {
        throw new Error(PRIVATE_ADDRESS_MESSAGE);
    }

    return parsed;
}

export interface PublicFetchOptions extends RequestInit {
    timeoutMs: number;
    followRedirects?: boolean;
}

// Fetches a URL after validating it, and again after each redirect hop. Redirects are handled
// here rather than by fetch, so a public URL cannot bounce the server to an internal address.
export async function fetchPublicUrl(
    rawUrl: string,
    { timeoutMs, followRedirects = false, ...init }: PublicFetchOptions
): Promise<Response> {
    let target = rawUrl;
    for (let redirects = 0; ; redirects += 1) {
        await assertPublicHttpUrl(target);
        const response = await fetch(target, {
            ...init,
            redirect: 'manual',
            signal: AbortSignal.timeout(timeoutMs)
        });

        const location = response.headers.get('location');
        const isRedirect = response.status >= 300 && response.status <= 399;
        if (!followRedirects || !isRedirect || !location) {
            return response;
        }

        await response.body?.cancel().catch(() => undefined);
        if (redirects >= MAX_REDIRECTS) {
            throw new Error('The remote server redirected too many times.');
        }
        target = new URL(location, target).toString();
    }
}

// Reads a response body, stopping as soon as it exceeds maxBytes so an oversized or endless
// body is never fully buffered.
export async function readBodyWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
    if (!response.body) return Buffer.alloc(0);

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel().catch(() => undefined);
            throw new Error('Remote media file is too large to import.');
        }
        chunks.push(Buffer.from(value));
    }

    return Buffer.concat(chunks, total);
}
