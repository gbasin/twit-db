# Twitter Likes Archive

## Product Requirements Document
Version 1.0 - December 2024

## Overview
Twitter Likes Archive is a desktop application that enables users to archive and search their Twitter likes, including associated media and linked content. The application runs in the background, periodically collecting new likes while providing a searchable interface to explore the archive.

## Target Users
- Primary user: Twitter account owner wanting to preserve and search their liked content
- Use case: Personal archival and content retrieval
- Platform: macOS initially

## Technology Stack
- **Framework**: Electron
- **Language**: TypeScript
- **Frontend**: React with TailwindCSS
- **Browser Automation**: Playwright
- **Database**: SQLite3
- **Build Tools**: Vite
- **Testing**: Jest, Playwright Test

## Core Features

### 1. Data Collection
#### Browser Automation
- Utilize existing Chrome profile for authentication
- Run browser instance in background (hidden from view)
- Implement human-like behavior patterns:
  - Random timing between actions
  - Variable scroll speeds
  - Natural viewport sizes
  - Randomized interaction patterns

#### Collection Modes
- **Incremental Mode**
  - Default operation mode
  - Collects only new likes since last run
  - Configurable polling interval
  - Efficient resource usage

- **Historical Mode**
  - Optional one-time operation
  - Attempts to collect all historical likes
  - User-initiated via dashboard
  - Progress tracking and resume capability

#### Content Preservation
- Tweet content:
  - Full HTML structure
  - Raw text content
  - Metadata (author, timestamp, etc.)
  - Engagement metrics
- Media content:
  - Images (original quality)
  - Videos
  - Local storage with original URLs
- Linked content:
  - Static snapshots of linked pages
  - Original URLs preserved
  - First-seen version only
- Quote tweets:
  - Full content preservation
  - Recursive media collection
  - Relationship tracking

### 2. Storage System
#### Database Schema
```sql
CREATE TABLE tweets (
    id TEXT PRIMARY KEY,
    html TEXT NOT NULL,
    text_content TEXT NOT NULL,
    author TEXT NOT NULL,
    liked_at TIMESTAMP NOT NULL,
    first_seen_at TIMESTAMP NOT NULL,
    is_quote_tweet BOOLEAN DEFAULT FALSE,
    has_media BOOLEAN DEFAULT FALSE,
    has_links BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE
);

CREATE TABLE media (
    id TEXT PRIMARY KEY,
    tweet_id TEXT NOT NULL,
    type TEXT NOT NULL,
    local_path TEXT NOT NULL,
    original_url TEXT NOT NULL,
    downloaded_at TIMESTAMP NOT NULL,
    FOREIGN KEY(tweet_id) REFERENCES tweets(id)
);

CREATE TABLE linked_content (
    id TEXT PRIMARY KEY,
    tweet_id TEXT NOT NULL,
    snapshot_path TEXT NOT NULL,
    original_url TEXT NOT NULL,
    captured_at TIMESTAMP NOT NULL,
    FOREIGN KEY(tweet_id) REFERENCES tweets(id)
);

CREATE TABLE quote_tweets (
    parent_tweet_id TEXT NOT NULL,
    quoted_tweet_id TEXT NOT NULL,
    PRIMARY KEY(parent_tweet_id, quoted_tweet_id),
    FOREIGN KEY(parent_tweet_id) REFERENCES tweets(id),
    FOREIGN KEY(quoted_tweet_id) REFERENCES tweets(id)
);

CREATE TABLE embeddings (
    id TEXT PRIMARY KEY,
    tweet_id TEXT NOT NULL,
    embedding BLOB NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    FOREIGN KEY(tweet_id) REFERENCES tweets(id)
);

CREATE VIRTUAL TABLE tweets_fts USING fts5(
    text_content,
    author,
    content='tweets',
    content_rowid='id'
);
```

#### File System Structure
```
data/
├── db/
│   └── tweets.db
├── media/
│   ├── images/
│   │   └── {tweet_id}/
│   └── videos/
│       └── {tweet_id}/
└── snapshots/
    └── {tweet_id}/
```

### 3. User Interface
#### System Tray
- Application status indicator
- Quick statistics:
  - Last successful run
  - Total likes collected
  - Current operation status
- Basic controls:
  - Start/stop collection
  - Open dashboard
  - Quit application

#### Dashboard
- Main Statistics View:
  - Collection metrics
  - Storage usage
  - Recent activity log
- Search Interface:
  - Combined search bar (keyword/semantic)
  - Filter panels
  - Results view with infinite scroll
- Settings Panel:
  - Collection configuration
  - Browser profile selection
  - Storage management
  - Notification preferences

#### Notifications
- Error alerts
- Collection completion
- Storage warnings
- System status updates

### 4. Search Functionality
#### Search Types
- Keyword search (SQLite FTS5)
- Semantic search (vector similarity)
- Combined search capabilities

#### Filters
- Date range
- Media type
- Author
- Content type (links, quotes, media)
- Saved searches

#### Search Scope
- Tweet content
- Quote tweet content
- Linked page content
- Author information

## Technical Architecture

### Project Structure
```
twitter-likes-archive/
├── src/
│   ├── main/
│   │   ├── index.ts
│   │   ├── collection/
│   │   ├── storage/
│   │   ├── ipc/
│   │   └── tray.ts
│   ├── renderer/
│   │   ├── app.tsx
│   │   ├── pages/
│   │   ├── components/
│   │   └── styles/
│   ├── shared/
│   │   ├── types/
│   │   ├── constants.ts
│   │   └── utils/
│   └── preload/
├── electron/
├── tests/
├── scripts/
└── static/
```

### Type Definitions
```typescript
interface Tweet {
    id: string;
    html: string;
    textContent: string;
    author: string;
    likedAt: Date;
    firstSeenAt: Date;
    isQuoteTweet: boolean;
    hasMedia: boolean;
    hasLinks: boolean;
    isDeleted: boolean;
}

interface CollectionConfig {
    mode: 'incremental' | 'historical';
    interval: number;
    maxConcurrent: number;
    behaviorSettings: BehaviorSettings;
}

interface SearchQuery {
    keyword?: string;
    semantic?: string;
    filters: SearchFilters;
}
```

## Implementation Phases

### Phase 1: Core Application
- Electron application setup
- Basic IPC communication
- System tray implementation
- Database initialization

### Phase 2: Collection Engine
- Browser automation setup
- Content extraction
- Incremental collection
- Basic storage implementation

### Phase 3: Content Preservation
- Media download system
- Link snapshot functionality
- Quote tweet handling
- Storage management

### Phase 4: User Interface
- Dashboard development
- Search interface
- Settings panel
- Notification system

### Phase 5: Search Implementation
- Full-text search
- Filter system
- Semantic search
- Results rendering

### Phase 6: Polish
- Performance optimization
- Error handling
- UI/UX refinement
- Testing and debugging

## Development Guidelines

### Code Style
- Strict TypeScript configuration
- Functional component patterns
- Comprehensive error handling
- Full test coverage

### Testing Requirements
- Unit tests for core functionality
- Integration tests for IPC
- E2E tests for critical paths
- Component tests for UI

### Documentation
- Code documentation (TSDoc)
- API documentation
- User guide
- Development guide

### Security Considerations
- Secure storage of credentials
- Safe browser profile access
- Content sanitization
- Secure IPC communication

## Future Considerations
- Windows/Linux support
- Multiple account handling
- Advanced analytics
- Export functionality
- Network bandwidth controls
- Auto-update system

## Success Metrics
- Reliable content collection
- Responsive search functionality
- Stable background operation
- Efficient resource usage
- Positive user feedback