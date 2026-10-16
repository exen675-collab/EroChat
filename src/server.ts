import fs from 'node:fs';
import { createApp } from './server/app';
import { DATA_DIR, MEDIA_DIR, DB_PATH, PORT } from './server/config';
import { openDatabase } from './server/database';
import { initDb } from './server/schema';
import { findInsecureDefaults } from './server/startup-checks';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const db = openDatabase(DB_PATH);
const app = createApp(db);

initDb(db)
    .then(async () => {
        for (const warning of await findInsecureDefaults(db, process.env.SESSION_SECRET)) {
            console.warn(`Warning: ${warning}`);
        }
        const server = app.listen(PORT, () => {
            const address = server.address();
            const listeningPort =
                address && typeof address === 'object' && address.port ? address.port : PORT;
            console.log(`Wink server listening on http://localhost:${listeningPort}`);
        });
    })
    .catch((error) => {
        console.error('Failed to initialize database:', error);
        process.exit(1);
    });
