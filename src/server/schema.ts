import bcrypt from 'bcryptjs';
import { initUserState } from '../user-state';
import { DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD, DEFAULT_USER_CREDITS } from './config';
import type { Database } from './database';

async function ensureTableColumn(db: Database, table, column, definition) {
    const { run, all } = db;
    const columns = await all(`PRAGMA table_info(${table})`);
    if (!columns.some((item) => item.name === column)) {
        await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
}

async function ensureDefaultAdminAccount(db: Database) {
    const { run, get } = db;
    const existingAdmin = await get('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [
        DEFAULT_ADMIN_USERNAME
    ]);

    if (!existingAdmin) {
        const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12);
        await run(
            'INSERT INTO users (username, password_hash, credits, is_admin) VALUES (?, ?, ?, 1)',
            [DEFAULT_ADMIN_USERNAME, passwordHash, DEFAULT_USER_CREDITS]
        );
        return;
    }

    // Only the privilege is repaired on boot. The password is set once, when the account is
    // created; rewriting it here would revert any password the admin changed on every restart.
    await run('UPDATE users SET is_admin = 1 WHERE id = ? AND is_admin <> 1', [existingAdmin.id]);
}

export async function initDb(db: Database) {
    const { run, get, all } = db;
    await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      credits INTEGER NOT NULL DEFAULT ${DEFAULT_USER_CREDITS},
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

    await initUserState({ run, get, all });

    await run(`
    CREATE TABLE IF NOT EXISTS generator_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      batch_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      source TEXT NOT NULL DEFAULT 'manual',
      media_type TEXT NOT NULL DEFAULT 'image',
      preset_id TEXT,
      execution_backend TEXT NOT NULL DEFAULT 'local',
      character_id TEXT,
      message_id TEXT,
      prompt TEXT NOT NULL,
      negative_prompt TEXT,
      source_asset_ids TEXT NOT NULL DEFAULT '[]',
      provider_model TEXT,
      provider_request_id TEXT,
      request_json TEXT NOT NULL DEFAULT '{}',
      result_asset_ids TEXT NOT NULL DEFAULT '[]',
      error_message TEXT,
      credits_charged INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

    await ensureTableColumn(db, 'generator_jobs', 'source', "TEXT NOT NULL DEFAULT 'manual'");
    await ensureTableColumn(db, 'generator_jobs', 'media_type', "TEXT NOT NULL DEFAULT 'image'");
    await ensureTableColumn(db, 'generator_jobs', 'preset_id', 'TEXT');
    await ensureTableColumn(
        db,
        'generator_jobs',
        'execution_backend',
        "TEXT NOT NULL DEFAULT 'local'"
    );
    await ensureTableColumn(db, 'generator_jobs', 'character_id', 'TEXT');
    await ensureTableColumn(db, 'generator_jobs', 'message_id', 'TEXT');

    await run(`
    CREATE TABLE IF NOT EXISTS generator_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      url TEXT NOT NULL,
      thumbnail_url TEXT,
      width INTEGER,
      height INTEGER,
      duration_seconds INTEGER,
      source TEXT NOT NULL DEFAULT 'generator',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES generator_jobs(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

    await run(`
    CREATE TABLE IF NOT EXISTS public_characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      source_character_id TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT NOT NULL DEFAULT '✨',
      thumbnail TEXT,
      description TEXT,
      appearance TEXT,
      background TEXT,
      greeting TEXT,
      system_prompt TEXT NOT NULL,
      context_message_count INTEGER NOT NULL DEFAULT 20,
      import_count INTEGER NOT NULL DEFAULT 0,
      published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, source_character_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

    await run(
        'CREATE INDEX IF NOT EXISTS idx_generator_jobs_user_created ON generator_jobs(user_id, created_at DESC)'
    );
    await run(
        'CREATE INDEX IF NOT EXISTS idx_generator_jobs_user_status_updated ON generator_jobs(user_id, status, updated_at DESC)'
    );
    await run(
        'CREATE INDEX IF NOT EXISTS idx_generator_assets_user_created ON generator_assets(user_id, created_at DESC)'
    );
    await run('CREATE INDEX IF NOT EXISTS idx_generator_assets_job ON generator_assets(job_id)');
    await run(
        'CREATE INDEX IF NOT EXISTS idx_public_characters_updated ON public_characters(updated_at DESC)'
    );
    await run(
        'CREATE INDEX IF NOT EXISTS idx_public_characters_popular ON public_characters(import_count DESC, updated_at DESC)'
    );

    await run(`
    CREATE TABLE IF NOT EXISTS public_character_imports (
      publication_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (publication_id, user_id),
      FOREIGN KEY (publication_id) REFERENCES public_characters(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

    await ensureDefaultAdminAccount(db);
}
