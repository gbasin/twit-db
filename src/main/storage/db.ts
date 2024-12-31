import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

interface SearchFilters {
  dateRange?: { start: Date; end: Date };
  hasMedia?: boolean;
  hasLinks?: boolean;
  author?: string;
}

export async function initDatabase() {
  const db = await open({
    filename: './data/db/tweets.db',
    driver: sqlite3.Database,
  });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tweets (...);
    CREATE TABLE IF NOT EXISTS media (...);
    CREATE TABLE IF NOT EXISTS linked_content (...);
    CREATE TABLE IF NOT EXISTS quote_tweets (...);
    CREATE TABLE IF NOT EXISTS embeddings (...);
    CREATE VIRTUAL TABLE IF NOT EXISTS tweets_fts USING fts5(...);
  `);
  return db;
}

export async function searchTweets(query: string, filters: SearchFilters = {}) {
  const db = await initDatabase();
  
  // Build the WHERE clause based on filters
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

  // Execute the search query
  const results = await db.all(`
    SELECT tweets.*
    FROM tweets
    JOIN tweets_fts ON tweets.id = tweets_fts.id
    ${whereClause}
    ORDER BY liked_at DESC
    LIMIT 50
  `, ...params);

  return results;
}