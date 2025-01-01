import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { app } from 'electron';

interface SearchFilters {
  dateRange?: { start: Date; end: Date };
  hasMedia?: boolean;
  hasLinks?: boolean;
  author?: string;
}

let _db: any = null;

// Define the data directory structure
const DATA_DIR = path.join(app.getPath('userData'), 'data');
export const DIRS = {
  db: path.join(DATA_DIR, 'db'),
  media: path.join(DATA_DIR, 'media'),  // Single directory for all media
  snapshots: path.join(DATA_DIR, 'snapshots'),
};

// Ensure all required directories exist
async function ensureDataDirectories() {
  console.log('Creating data directories in:', DATA_DIR);
  for (const dir of [
    DIRS.db,
    DIRS.media,
    DIRS.snapshots,
  ]) {
    console.log('Ensuring directory exists:', dir);
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

// Get media for a specific tweet
export async function getMediaForTweet(tweetId: string) {
  const db = await initDatabase();
  return db.all(`
    SELECT m.id, mt.name as mediaType, m.local_path as localPath, m.original_url as originalUrl
    FROM media m
    JOIN media_types mt ON m.media_type_id = mt.id
    WHERE m.tweet_id = ?
    ORDER BY m.downloaded_at ASC
  `, [tweetId]);
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

export async function insertTweet(tweet: any) {
  const db = await initDatabase();

  try {
    console.log(`Inserting tweet ${tweet.id} by ${tweet.author}`);
    
    // Start a transaction
    await db.run('BEGIN TRANSACTION');
    
    // Insert the tweet
    await db.run(
      `INSERT INTO tweets (
        id, html, text_content, author, display_name, handle,
        liked_at, first_seen_at, is_quote_tweet, has_media,
        has_links, is_deleted, card_type, card_data, metrics
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tweet.id,
        tweet.html,
        tweet.text_content,
        tweet.author,
        tweet.display_name,
        tweet.handle,
        tweet.liked_at,
        tweet.first_seen_at,
        tweet.is_quote_tweet ? 1 : 0,
        tweet.has_media ? 1 : 0,
        tweet.has_links ? 1 : 0,
        tweet.is_deleted ? 1 : 0,
        tweet.card_type,
        tweet.card_data,
        tweet.metrics ? JSON.stringify(tweet.metrics) : null
      ]
    );
    
    // Insert links if present
    if (tweet.links && tweet.links.length > 0) {
      for (const url of tweet.links) {
        await db.run(
          `INSERT INTO links (id, tweet_id, url, created_at)
           VALUES (?, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            tweet.id,
            url,
            new Date().toISOString()
          ]
        );
      }
    }
    
    await db.run('COMMIT');
    console.log('Tweet and links inserted successfully');
    return true;
  } catch (error) {
    await db.run('ROLLBACK');
    console.error(`Failed to insert tweet ${tweet.id}:`, error);
    throw error;
  }
}

export async function searchTweets(query: string, filters: SearchFilters = {}) {
  const db = await initDatabase();

  const conditions: string[] = [];
  const params: any[] = [];

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

  // Text search (simple LIKE for now)
  if (query) {
    conditions.push('(text_content LIKE ? OR author LIKE ?)');
    const likePattern = `%${query}%`;
    params.push(likePattern, likePattern);
  }

  const whereClause = conditions.length > 0 
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const results = await db.all(`
    SELECT t.*, GROUP_CONCAT(l.url) as link_urls
    FROM tweets t
    LEFT JOIN links l ON t.id = l.tweet_id
    ${whereClause}
    GROUP BY t.id
    ORDER BY liked_at DESC
    LIMIT 50
  `, params);

  // Process results to parse JSON fields and format links
  return results.map((tweet: any) => ({
    ...tweet,
    metrics: tweet.metrics ? JSON.parse(tweet.metrics) : null,
    links: tweet.link_urls ? tweet.link_urls.split(',') : [],
    is_quote_tweet: !!tweet.is_quote_tweet,
    has_media: !!tweet.has_media,
    has_links: !!tweet.has_links,
    is_deleted: !!tweet.is_deleted
  }));
}

export async function initDatabase() {
  if (_db) {
    return _db;
  }

  // Ensure directories exist before initializing DB
  await ensureDataDirectories();
  
  const dbPath = path.join(DIRS.db, 'tweets.db');
  console.log('Initializing database at:', dbPath);

  try {
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
      mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
    });

    // Enable foreign keys
    await db.exec('PRAGMA foreign_keys = ON;');
    console.log('Foreign keys enabled');

    // Create tables one by one
    await db.exec(`
      CREATE TABLE IF NOT EXISTS media_types (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      );
    `);
    console.log('Media types table created');

    await db.exec(`
      INSERT OR IGNORE INTO media_types (id, name) VALUES
        (1, 'image'),
        (2, 'video'),
        (3, 'gif'),
        (4, 'card');
    `);
    console.log('Media types inserted');

    await db.exec(`
      CREATE TABLE IF NOT EXISTS tweets (
        id TEXT PRIMARY KEY,
        html TEXT NOT NULL,
        text_content TEXT NOT NULL,
        author TEXT NOT NULL,
        display_name TEXT,
        handle TEXT,
        liked_at TIMESTAMP NOT NULL,
        first_seen_at TIMESTAMP NOT NULL,
        is_quote_tweet INTEGER DEFAULT 0,
        has_media INTEGER DEFAULT 0,
        has_links INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        card_type TEXT,
        card_data TEXT,
        metrics TEXT
      );
    `);
    console.log('Tweets table created');

    await db.exec(`
      CREATE TABLE IF NOT EXISTS links (
        id TEXT PRIMARY KEY,
        tweet_id TEXT NOT NULL,
        url TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        FOREIGN KEY(tweet_id) REFERENCES tweets(id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_links_tweet_id ON links(tweet_id);
    `);
    console.log('Links table created');

    await db.exec(`
      CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY,
        tweet_id TEXT NOT NULL,
        media_type_id INTEGER NOT NULL,
        local_path TEXT NOT NULL,
        original_url TEXT NOT NULL,
        downloaded_at TIMESTAMP NOT NULL,
        metadata TEXT,
        FOREIGN KEY(tweet_id) REFERENCES tweets(id),
        FOREIGN KEY(media_type_id) REFERENCES media_types(id)
      );
      
      -- Add index for faster media existence checks
      CREATE INDEX IF NOT EXISTS idx_media_tweet_url 
      ON media(tweet_id, original_url);
    `);
    console.log('Media table created');

    _db = db;
    return db;
  } catch (error: any) {
    console.error('Failed to initialize database:', error);
    if (error.code === 'SQLITE_CORRUPT') {
      console.log('Database appears corrupted, attempting recovery...');
      try {
        await fs.unlink(dbPath);
        console.log('Deleted corrupted database');
        _db = null;
        return initDatabase();
      } catch (unlinkError) {
        console.error('Failed to delete corrupted database:', unlinkError);
      }
    }
    throw error;
  }
}

// Check if media already exists
export async function mediaExists(tweetId: string, originalUrl: string): Promise<boolean> {
  const db = await initDatabase();
  const result = await db.get(
    'SELECT id FROM media WHERE tweet_id = ? AND original_url = ?',
    [tweetId, originalUrl]
  );
  return !!result;
}

// Check if tweet exists
export async function tweetExists(tweetId: string): Promise<boolean> {
  const db = await initDatabase();
  const result = await db.get('SELECT id FROM tweets WHERE id = ?', [tweetId]);
  return !!result;
}

// Add function to get links for a tweet
export async function getLinksForTweet(tweetId: string) {
  const db = await initDatabase();
  return db.all(
    'SELECT url FROM links WHERE tweet_id = ? ORDER BY created_at ASC',
    [tweetId]
  );
}