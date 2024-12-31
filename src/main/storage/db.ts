import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

interface SearchFilters {
  dateRange?: { start: Date; end: Date };
  hasMedia?: boolean;
  hasLinks?: boolean;
  author?: string;
}

let _db: any = null;

// Define the data directory structure
const DATA_DIR = './data';
export const DIRS = {
  db: path.join(DATA_DIR, 'db'),
  media: path.join(DATA_DIR, 'media'),  // Single directory for all media
  snapshots: path.join(DATA_DIR, 'snapshots'),
};

// Ensure all required directories exist
async function ensureDataDirectories() {
  for (const dir of [
    DIRS.db,
    DIRS.media,
    DIRS.snapshots,
  ]) {
    await fs.mkdir(dir, { recursive: true });
  }
}

// Helper to generate a unique filename for media
function generateMediaFilename(tweetId: string, originalUrl: string, extension: string): string {
  const hash = crypto.createHash('md5').update(originalUrl).digest('hex').slice(0, 8);
  return `${tweetId}_${hash}${extension}`;
}

// Get media type ID from name
export async function getMediaTypeId(typeName: string): Promise<number> {
  const db = await initDatabase();
  const result = await db.get('SELECT id FROM media_types WHERE name = ?', typeName);
  return result?.id;
}

// Insert media record
export async function insertMedia(data: {
  tweetId: string;
  mediaType: string;
  originalUrl: string;
  localPath: string;
  metadata?: any;
}) {
  const db = await initDatabase();
  const mediaTypeId = await getMediaTypeId(data.mediaType);
  
  if (!mediaTypeId) {
    throw new Error(`Invalid media type: ${data.mediaType}`);
  }

  return db.run(
    `INSERT INTO media (id, tweet_id, media_type_id, local_path, original_url, downloaded_at, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      data.tweetId,
      mediaTypeId,
      data.localPath,
      data.originalUrl,
      new Date().toISOString(),
      data.metadata ? JSON.stringify(data.metadata) : null
    ]
  );
}

export async function initDatabase() {
  if (_db) {
    return _db;
  }

  // Ensure directories exist before initializing DB
  await ensureDataDirectories();

  const db = await open({
    filename: path.join(DIRS.db, 'tweets.db'),
    driver: sqlite3.Database,
  });

  // Create the tables if they don't exist already
  await db.exec(`
    -- Media type enum
    CREATE TABLE IF NOT EXISTS media_types (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    -- Insert media types if they don't exist
    INSERT OR IGNORE INTO media_types (id, name) VALUES
      (1, 'image'),
      (2, 'video'),
      (3, 'gif'),
      (4, 'card');

    CREATE TABLE IF NOT EXISTS tweets (
      id TEXT PRIMARY KEY,
      html TEXT NOT NULL,
      text_content TEXT NOT NULL,
      author TEXT NOT NULL,
      liked_at TIMESTAMP NOT NULL,
      first_seen_at TIMESTAMP NOT NULL,
      is_quote_tweet INTEGER DEFAULT 0,
      has_media INTEGER DEFAULT 0,
      has_links INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      card_type TEXT,
      card_data TEXT  -- JSON data for rich media cards
    );

    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      tweet_id TEXT NOT NULL,
      media_type_id INTEGER NOT NULL,
      local_path TEXT NOT NULL,
      original_url TEXT NOT NULL,
      downloaded_at TIMESTAMP NOT NULL,
      metadata TEXT,  -- JSON field for format-specific metadata
      FOREIGN KEY(tweet_id) REFERENCES tweets(id),
      FOREIGN KEY(media_type_id) REFERENCES media_types(id)
    );

    CREATE TABLE IF NOT EXISTS linked_content (
      id TEXT PRIMARY KEY,
      tweet_id TEXT NOT NULL,
      snapshot_path TEXT NOT NULL,
      original_url TEXT NOT NULL,
      captured_at TIMESTAMP NOT NULL,
      FOREIGN KEY(tweet_id) REFERENCES tweets(id)
    );

    CREATE TABLE IF NOT EXISTS quote_tweets (
      parent_tweet_id TEXT NOT NULL,
      quoted_tweet_id TEXT NOT NULL,
      PRIMARY KEY(parent_tweet_id, quoted_tweet_id),
      FOREIGN KEY(parent_tweet_id) REFERENCES tweets(id),
      FOREIGN KEY(quoted_tweet_id) REFERENCES tweets(id)
    );

    CREATE TABLE IF NOT EXISTS embeddings (
      id TEXT PRIMARY KEY,
      tweet_id TEXT NOT NULL,
      embedding BLOB NOT NULL,
      updated_at TIMESTAMP NOT NULL,
      FOREIGN KEY(tweet_id) REFERENCES tweets(id)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS tweets_fts USING fts5(
      text_content,
      author,
      content='tweets',
      content_rowid='id'
    );
  `);

  _db = db;
  return db;
}

export async function insertTweet(tweet: any) {
  const db = await initDatabase();

  await db.run(
    `INSERT OR REPLACE INTO tweets (id, html, text_content, author, liked_at, first_seen_at, is_quote_tweet, has_media, has_links, is_deleted, card_type, card_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tweet.id,
      tweet.html,
      tweet.text_content,
      tweet.author,
      tweet.liked_at,
      tweet.first_seen_at,
      tweet.is_quote_tweet ? 1 : 0,
      tweet.has_media ? 1 : 0,
      tweet.has_links ? 1 : 0,
      tweet.is_deleted ? 1 : 0,
      tweet.card_type,
      tweet.card_data
    ]
  );

  // For FTS table, we need to delete first then insert because UPSERT isn't supported
  await db.run('DELETE FROM tweets_fts WHERE rowid = ?', [tweet.id]);
  await db.run(
    'INSERT INTO tweets_fts (rowid, text_content, author) VALUES (?, ?, ?)',
    [tweet.id, tweet.text_content, tweet.author]
  );
}

export async function searchTweets(query: string, filters: SearchFilters = {}) {
  const db = await initDatabase();

  const conditions: string[] = [];
  const params: any[] = [];

  // Full-text search condition
  if (query) {
    conditions.push('tweets_fts MATCH ?');
    params.push(query);
  }

  // Date range filter
  if (filters.dateRange) {
    conditions.push('liked_at BETWEEN ? AND ?');
    params.push(filters.dateRange.start.toISOString());
    params.push(filters.dateRange.end.toISOString());
  }

  // Media filter
  if (filters.hasMedia !== undefined) {
    conditions.push('has_media = ?');
    params.push(filters.hasMedia ? 1 : 0);
  }

  // Links filter
  if (filters.hasLinks !== undefined) {
    conditions.push('has_links = ?');
    params.push(filters.hasLinks ? 1 : 0);
  }

  // Author filter
  if (filters.author) {
    conditions.push('author = ?');
    params.push(filters.author);
  }

  const whereClause = conditions.length > 0 
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const results = await db.all(`
    SELECT tweets.*
    FROM tweets
    JOIN tweets_fts ON tweets.id = tweets_fts.id
    ${whereClause}
    ORDER BY liked_at DESC
    LIMIT 50
  `, params);

  return results;
}