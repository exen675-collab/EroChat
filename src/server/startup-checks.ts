import bcrypt from 'bcryptjs';
import { DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME } from './config';
import type { Database } from './database';

// Lists the shipped defaults still in effect that let anyone sign in as the administrator or
// forge session cookies. The server logs these at boot so a new deployment is not left open.
export async function findInsecureDefaults(
    db: Database,
    configuredSessionSecret: string | undefined
): Promise<string[]> {
    const warnings: string[] = [];
    if (!configuredSessionSecret) {
        warnings.push(
            'SESSION_SECRET is not set, so session cookies are signed with a public default. Set it to a long random value.'
        );
    }

    const admin = await db.get(
        'SELECT password_hash FROM users WHERE username = ? COLLATE NOCASE',
        [DEFAULT_ADMIN_USERNAME]
    );
    if (admin && (await bcrypt.compare(DEFAULT_ADMIN_PASSWORD, admin.password_hash))) {
        warnings.push(
            `The "${DEFAULT_ADMIN_USERNAME}" account still uses its default password. Sign in and change it under Settings > Account.`
        );
    }
    return warnings;
}
