import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

interface SearchFilters {
  dateRange?: { start: Date; end: Date };
  hasMedia?: boolean;
  hasLinks?: boolean;
  author?: string;
}

let _db: any = null;

export async function initDatabase() {
  if (_db) {
    return _db;
  }
  const db = await open({
    filename: './data/db/tweets.db',
    driver: sqlite3.Database,
  });

  // Create the tables if they don't exist already
  await db.exec(`
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
      is_deleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      tweet_id TEXT NOT NULL,
      type TEXT NOT NULL,
      local_path TEXT NOT NULL,
      original_url TEXT NOT NULL,
      downloaded_at TIMESTAMP NOT NULL,
      FOREIGN KEY(tweet_id) REFERENCES tweets(id)
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
    `
      INSERT OR REPLACE INTO tweets (id, html, text_content, author, liked_at, first_seen_at, is_quote_tweet, has_media, has_links, is_deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
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
      tweet.is_deleted ? 1 : 0
    ]
  );

  // Insert into FTS table as well
  await db.run(
    `
      INSERT INTO tweets_fts (rowid, text_content, author)
      VALUES (
        (SELECT rowid FROM tweets WHERE id = ?),
        ?,
        ?
      )
      ON CONFLICT(rowid) DO UPDATE SET
        text_content = excluded.text_content,
        author = excluded.author
    `,
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