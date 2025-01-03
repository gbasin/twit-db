# Twitter Likes Archive

Version 1.0 - December 2024

## Overview
Twitter Likes Archive is a desktop app for macOS (with future plans for cross-platform) that archives and indexes liked tweets, including media and linked content. The app runs periodically, retrieving new likes via browser automation while providing a searchable dashboard for exploring saved content.

## Target Users
- Primary users: Individuals who heavily rely on Twitter likes to bookmark resources and want to ensure the content is preserved locally.
- Use case: Personal archival and content retrieval
- Platform: macOS initially

## Primary Goals
1.	Automatically and incrementally archive new likes
2.	Store complete tweet data (HTML, text, metadata)
3.	Download and store associated media
4.	Provide semantic and full-text search

## Technology Stack
- **Framework**: Electron
- **Language**: TypeScript
- **Frontend**: React with TailwindCSS
- **Browser Automation**: Playwright (using a local Chrome profile)
- **Database**: SQLite3 (FTS5 for keyword search + vector store for semantic embeddings)
- **Build Tools**: Vite
- **Testing**: Jest, Playwright Test

## Core Features

### 1. Data Collection
#### Authentication
- Reuse an existing Chrome user profile for Twitter login to avoid manual login flows.
- Manage potential session timeouts and handle re-authentication triggers.

#### Browser Automation
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
#### Database
- SQLite schema with tables for tweets, media, linked content, quote relationships, and embeddings.
- Use FTS5 for fast keyword search.
- Create or update vector embeddings in embeddings table for semantic search.
	
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