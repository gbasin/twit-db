import { chromium } from 'playwright';
import { insertTweet, insertMedia, DIRS, mediaExists, tweetExists, insertThreadTweet, updateThreadMetadata, getHighestLikeOrder } from '../storage/db';
import path from 'path';
import { app } from 'electron';
import fs from 'fs/promises';
import crypto from 'crypto';
import { execSync } from 'child_process';

let isCollecting = false;
let currentBrowserContext: any = null;

// Structured logging helper
function log(category: string, action: string, details?: any) {
  const timestamp = new Date().toISOString();
  const message = {
    timestamp,
    category,
    action,
    details: details || {}
  };
  console.log(JSON.stringify(message));
}

// Error logging helper
function logError(category: string, action: string, error: any, context?: any) {
  const timestamp = new Date().toISOString();
  const message = {
    timestamp,
    category,
    action,
    error: {
      message: error.message,
      stack: error.stack,
      ...error
    },
    context
  };
  console.error(JSON.stringify(message));
}

// Get the app's browser profile directory
function getAppProfileDir() {
  return path.join(app.getPath('userData'), 'browser-profile');
}

// Cleanup any existing browser sessions
async function cleanupExistingSessions() {
  if (currentBrowserContext) {
    try {
      await currentBrowserContext.close();
    } catch (error) {
      console.log('Error closing existing browser context:', error);
    }
    currentBrowserContext = null;
  }

  const profileDir = getAppProfileDir();
  const lockFile = path.join(profileDir, 'SingletonLock');
  try {
    await fs.unlink(lockFile);
  } catch (error) {
    // Ignore if file doesn't exist
  }
}

// Download and save media file
async function downloadMedia(url: string, tweetId: string): Promise<string> {
  const logContext = { url, tweetId };
  try {
    log('media', 'download_start', logContext);

    // For Twitter media URLs, ensure we get the highest quality
    const finalUrl = url.includes('pbs.twimg.com/media') 
      ? `${url}?format=jpg&name=4096x4096` // Get highest quality for images
      : url;

    log('media', 'fetch_start', { ...logContext, finalUrl });
    const response = await fetch(finalUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.statusText} (${response.status})`);
    }
    log('media', 'fetch_complete', { 
      ...logContext, 
      status: response.status,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length')
    });
    
    const contentType = response.headers.get('content-type') || '';
    let ext = '.jpg'; // Default to jpg
    
    // Determine file extension based on content type
    if (contentType.includes('video/')) {
      ext = '.mp4';
    } else if (contentType.includes('image/gif')) {
      ext = '.gif';
    } else if (contentType.includes('image/png')) {
      ext = '.png';
    } else if (contentType.includes('image/webp')) {
      ext = '.webp';
    }
    
    const filename = `${tweetId}_${crypto.createHash('md5').update(url).digest('hex').slice(0, 8)}${ext}`;
    const localPath = path.join(DIRS.media, filename);
    
    log('media', 'saving_file', { ...logContext, filename, localPath, contentType });
    const buffer = await response.arrayBuffer();
    await fs.writeFile(localPath, Buffer.from(buffer));
    
    log('media', 'download_complete', { 
      ...logContext, 
      filename, 
      localPath, 
      sizeBytes: buffer.byteLength 
    });
    return localPath;
  } catch (error) {
    logError('media', 'download_failed', error, logContext);
    throw error;
  }
}

// Process media items sequentially
async function processMediaItems(mediaItems: Array<{
  tweetId: string;
  url: string;
  mediaType: string;
}>) {
  log('media_processing', 'start', { totalItems: mediaItems.length });

  const results: Array<{ success: boolean; error?: Error }> = [];
  const stats = {
    total: mediaItems.length,
    completed: 0,
    successful: 0,
    failed: 0,
    skipped: 0
  };

  const logStats = () => {
    log('media_processing', 'stats', stats);
  };

  // Process items one at a time
  for (const item of mediaItems) {
    log('media_processing', 'item_start', {
      tweetId: item.tweetId,
      mediaType: item.mediaType,
      remaining: mediaItems.length - stats.completed
    });

    try {
      // Check if media already exists
      const exists = await mediaExists(item.tweetId, item.url);
      if (exists) {
        log('media_processing', 'item_skipped', {
          tweetId: item.tweetId,
          mediaType: item.mediaType,
          reason: 'already_exists'
        });
        results.push({ success: true });
        stats.skipped++;
        stats.completed++;
        continue;
      }

      const localPath = await downloadMedia(item.url, item.tweetId);
      await insertMedia({
        tweetId: item.tweetId,
        mediaType: item.mediaType,
        originalUrl: item.url,
        localPath,
      });
      results.push({ success: true });
      stats.successful++;
      log('media_processing', 'item_complete', {
        tweetId: item.tweetId,
        mediaType: item.mediaType,
        localPath
      });
    } catch (error) {
      results.push({ success: false, error: error as Error });
      stats.failed++;
      logError('media_processing', 'item_failed', error, {
        tweetId: item.tweetId,
        mediaType: item.mediaType
      });
    }

    stats.completed++;
    logStats();
  }

  log('media_processing', 'complete', {
    total: stats.total,
    successful: stats.successful,
    failed: stats.failed,
    skipped: stats.skipped
  });

  return results;
}

// Helper function to resolve shortened URLs
async function resolveUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return response.url;
  } catch (error) {
    console.error(`Failed to resolve URL ${url}:`, error);
    return url; // Return original URL if resolution fails
  }
}

interface ThreadTweet {
  id: string;
  position: number;
  debug?: {
    rawAuthorText: string;
    originalAuthor: string;
    authorMatch: boolean;
  };
}

export async function collectLikes(mode: 'incremental' | 'historical') {
  if (isCollecting) {
    console.log("Collection is already in progress.");
    return;
  }
  isCollecting = true;
  
  try {
    console.log(`Starting ${mode} collection...`);
    
    // Use our app's dedicated profile directory
    const profileDir = getAppProfileDir();
    console.log('Using browser profile at:', profileDir);
    
    // Ensure profile directory exists and clean up any existing sessions
    await fs.mkdir(profileDir, { recursive: true });
    await cleanupExistingSessions();
    
    console.log('Launching browser...');
    try {
      currentBrowserContext = await chromium.launchPersistentContext(profileDir, {
        headless: false,
        viewport: { width: 1280, height: 800 },
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-default-browser-check',
          '--no-first-run'
        ],
        logger: {
          isEnabled: () => true,
          log: (name, severity, message) => console.log(`Browser ${severity}: ${message}`)
        }
      }).catch(error => {
        console.error('Failed to launch browser:', error);
        throw error;
      });
    } catch (error) {
      console.error('Error during browser launch:', error);
      throw error;
    }

    if (!currentBrowserContext) {
      throw new Error('Browser context is null after launch');
    }

    console.log('Browser launched, creating new page...');
    let page;
    try {
      page = await currentBrowserContext.newPage();
      console.log('Page created successfully');
    } catch (error) {
      console.error('Failed to create new page:', error);
      throw error;
    }

    if (!page) {
      throw new Error('Page is null after creation');
    }

    // Ensure window is visible and focused
    try {
      console.log('Bringing window to front...');
      await page.bringToFront();
      console.log('Window should now be visible');
    } catch (error) {
      console.error('Failed to bring window to front:', error);
      // Continue anyway as this is not critical
    }
    
    console.log('Removing automation flags...');
    await page.addInitScript(() => {
      delete (window as any).navigator.webdriver;
      // @ts-ignore
      window.chrome = { runtime: {} };
    });
    
    console.log('Navigating to Twitter...');
    try {
      await page.goto('https://twitter.com', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      
      // Wait for either the login button or home feed to be visible
      await page.waitForSelector('[data-testid="loginButton"], [data-testid="primaryColumn"]', {
        timeout: 30000
      });
      
      console.log('Successfully loaded Twitter homepage');
    } catch (error) {
      console.error('Failed to load Twitter:', error);
      throw error;
    }

    // Check if we need to log in
    console.log('Checking login status...');
    const isLoggedIn = await page.evaluate(() => {
      return document.querySelector('[data-testid="primaryColumn"]') !== null;
    });

    if (!isLoggedIn) {
      console.log('Login required. Please log in to continue...');
      
      // Click the Sign in button
      try {
        await page.click('[data-testid="loginButton"]');
        console.log('Clicked login button');
        
        // Wait for login form
        await page.waitForSelector('input[autocomplete="username"]', { timeout: 10000 });
        console.log('Login form visible');
        
        // Wait for user to complete login
        await page.waitForSelector('[data-testid="primaryColumn"]', { 
          timeout: 120000,
          state: 'visible'
        }).catch(() => {
          throw new Error('Login timeout - please try again');
        });
        console.log('Successfully logged in');
      } catch (error) {
        console.error('Login process failed:', error);
        throw error;
      }
    }

    // After successful login, navigate to profile and then likes
    console.log('Navigating to profile...');
    try {
      // Click the profile icon/link
      await page.click('[data-testid="AppTabBar_Profile_Link"]');
      await page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 10000 });
      
      // Get the current profile URL which contains the username
      const profileUrl = page.url();
      const username = profileUrl.split('/').pop();
      
      if (!username) {
        throw new Error('Could not determine username from profile URL');
      }
      
      // Navigate directly to likes page
      console.log('Navigating to likes page...');
      await page.goto(`https://twitter.com/${username}/likes`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      
      // Wait for the likes feed to load
      await page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 10000 });
      console.log('Likes page loaded');
    } catch (error) {
      console.error('Failed to navigate to likes:', error);
      throw error;
    }

    // Wait for navigation bar to be visible
    await page.waitForSelector('nav[role="navigation"]', { timeout: 10000 });
    
    console.log('Waiting for content to load...');
    // Wait for tweets to be visible and ensure we have the initial view loaded
    await page.waitForSelector('article', { timeout: 30000 });
    
    // Wait a bit longer to ensure all initial tweets are loaded
    await page.waitForTimeout(5000);
    
    console.log('Page loaded, looking for tweets...');
    
    // Extract initial tweets before any scrolling
    const initialTweets = await page.$$eval('article', (articles: Element[]) => {
      return articles.map((article: Element) => {
        const tweetUrl = article.querySelector('a[href*="/status/"]')?.getAttribute('href') || '';
        const match = tweetUrl.match(/\/status\/(\d+)/);
        return match ? match[1] : null;
      }).filter(Boolean);
    });
    
    console.log('Initial tweets found:', initialTweets);
    
    // Then continue with scrolling for more tweets...
    
    let previousTweetCount = 0;
    let noNewContentCount = 0;
    const maxNoNewContentAttempts = 3;
    const maxScrolls = mode === 'historical' ? 50 : 5;
    let scrollCount = 0;
    
    console.log(`Starting to scroll page (max ${maxScrolls} times)...`);
    while (scrollCount < maxScrolls) {
      scrollCount++;
      console.log(`Scroll ${scrollCount}/${maxScrolls}`);
      
      // Scroll and wait for new content
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 2);
      });
      
      // Wait longer for content to load
      await page.waitForTimeout(3000);
      
      // Check for new tweets
      const tweetCount = await page.$$eval('article', (articles: Element[]) => {
        const tweetIds = articles.map(article => {
          const tweetUrl = article.querySelector('a[href*="/status/"]')?.getAttribute('href') || '';
          const match = tweetUrl.match(/\/status\/(\d+)/);
          return match ? match[1] : null;
        }).filter(Boolean);
        return {
          count: articles.length,
          firstId: tweetIds[0],
          lastId: tweetIds[tweetIds.length - 1]
        };
      });

      console.log(`Found ${tweetCount.count} tweets after scroll (first: ${tweetCount.firstId}, last: ${tweetCount.lastId})`);
      
      if (tweetCount.count === previousTweetCount) {
        noNewContentCount++;
        console.log(`No new content detected (attempt ${noNewContentCount}/${maxNoNewContentAttempts})`);
        if (noNewContentCount >= maxNoNewContentAttempts) {
          console.log('No new content after multiple attempts, stopping...');
          break;
        }
      } else {
        noNewContentCount = 0;
        previousTweetCount = tweetCount.count;
      }
      
      // Wait for any new tweets to load
      await page.waitForSelector('article', { timeout: 5000 }).catch(() => {
        console.log('No new articles found after timeout');
      });
    }

    console.log('Extracting tweets from page...');
    // Extracting tweets from page...
    log('collection', 'extraction_start', { mode });

    // Get the starting like_order for new tweets
    const startingLikeOrder = await getHighestLikeOrder();
    log('collection', 'like_order_start', { startingLikeOrder });

    const tweets = await page.$$eval('article', async (articles: Element[], startOrder: number) => {
      // Define extractMediaUrls in browser context
      function extractMediaUrls(article: Element) {
        const results = {
          images: [] as { url: string }[],
          videos: [] as { url: string }[],
          gifs: [] as { url: string }[]
        };

        try {
          // Images: Look for high-res image URLs
          results.images = Array.from(article.querySelectorAll('img[src*="pbs.twimg.com/media"]'))
            .map(img => {
              const src = (img as HTMLImageElement).src;
              // Remove any existing format parameters
              const baseUrl = src.split('?')[0];
              return { url: baseUrl };
            });

          // Videos: Look for both video elements and video containers
          results.videos = Array.from(article.querySelectorAll('video[src*="video.twimg.com"], div[data-testid="videoPlayer"]'))
            .map(video => {
              if (video instanceof HTMLVideoElement) {
                return { url: video.src };
              } else {
                // For video players, try to find the source URL
                const source = video.querySelector('source');
                return { url: source?.src || '' };
              }
            })
            .filter(v => v.url); // Remove any empty URLs

          // GIFs: Look specifically for Twitter GIFs
          results.gifs = Array.from(article.querySelectorAll('video[poster*="tweet_video_thumb"]'))
            .map(gif => ({
              url: (gif as HTMLVideoElement).src
            }));

        } catch (error) {
          console.error('Media extraction failed:', error);
        }

        return results;
      }

      // Helper to extract tweet ID from URL
      function extractTweetId(url: string): string | null {
        const match = url.match(/\/status\/(\d+)/);
        return match ? match[1] : null;
      }

      // Use UTC milliseconds since epoch
      const now = Date.now();
      // Process articles in reverse order to maintain newest-first order
      const reversedArticles = Array.from(articles).reverse();
      return await Promise.all(reversedArticles.map(async (el: Element, index: number) => {
        const tweetUrl = el.querySelector('a[href*="/status/"]')?.getAttribute('href') || '';
        const tweetId = extractTweetId(tweetUrl) || '';
        
        // Get thread information
        const inReplyToLink = el.querySelector('div[data-testid="tweet"] a[href*="/status/"]');
        const inReplyToUrl = inReplyToLink?.getAttribute('href') || '';
        const inReplyToId = extractTweetId(inReplyToUrl);
        
        // Get conversation ID (used for thread tracking)
        const conversationId = el.closest('[data-testid="cellInnerDiv"]')
          ?.getAttribute('data-conversation-id') || tweetId;

        // Get tweet timestamp
        const timestampEl = el.querySelector('time');
        const tweetTimestamp = timestampEl?.getAttribute('datetime') || new Date().toISOString();

        // Use collection timestamp and decrement by index to maintain relative order
        const like_order = now - index;  // Decrement by 1 for each tweet
        
        // Check if this is a thread tweet
        const isThreadTweet = inReplyToId && el.querySelector(`a[href*="${inReplyToId}"]`);
        
        // Get the main tweet text content - look for all text content divs
        const tweetTextEls = el.querySelectorAll('[data-testid="tweetText"]');
        const textContent = Array.from(tweetTextEls)
          .map(el => el.textContent || '')
          .join('\n\n')
          .trim();

        // Get engagement metrics
        const metrics = {
          replies: el.querySelector('[data-testid="reply"]')?.textContent || '0',
          retweets: el.querySelector('[data-testid="retweet"]')?.textContent || '0',
          likes: el.querySelector('[data-testid="unlike"]')?.textContent || '0',
          views: Array.from(el.querySelectorAll('[data-testid="app-text-transition-container"]'))
            .pop()?.textContent || '0'
        };
        
        // Get author info
        const authorEl = el.querySelector('[data-testid="User-Name"]');
        const authorSpans = authorEl ? Array.from(authorEl.querySelectorAll('span')) : [];
        const handleSpan = authorSpans.find(span => (span.textContent || '').includes('@'));
        const displayName = authorSpans[0]?.textContent || '';
        const handle = handleSpan?.textContent || '';
        
        // Extract media elements
        const mediaElements = extractMediaUrls(el);
        
        // Check for cards (rich media previews)
        const card = el.querySelector('[data-testid="card.wrapper"]');
        const cardData = card ? {
          type: card.getAttribute('data-card-type'),
          url: card.querySelector('a')?.href,
          title: card.querySelector('[data-testid="card.layoutLarge.title"]')?.textContent,
          description: card.querySelector('[data-testid="card.layoutLarge.description"]')?.textContent
        } : null;
        
        // Get quoted tweet if present
        const quotedTweet = el.querySelector('[data-testid="tweet"] article');
        const quotedText = quotedTweet ? quotedTweet.textContent || '' : '';
        
        // Extract links from text content and cards
        const textLinks = textContent.match(/https?:\/\/[^\s)]+/g) || [];
        const cardLink = cardData?.url ? [cardData.url] : [];
        const allLinks = [...new Set([...textLinks, ...cardLink])].filter(Boolean);
        
        // Clean up links (remove trailing punctuation, etc)
        const cleanLinks = allLinks.map(link => {
          // Remove trailing punctuation that might have been caught
          return link.replace(/[.,;:!?]$/, '');
        });

        return {
          id: tweetId,
          html: el.innerHTML || '',
          text_content: textContent,
          display_name: displayName,
          handle: handle,
          author: handle ? `${displayName} ${handle}` : displayName,
          created_at: tweetTimestamp,  // When the tweet was posted
          like_order: like_order,
          is_quote_tweet: !!quotedTweet,
          has_media: !!(mediaElements.images.length || mediaElements.videos.length || mediaElements.gifs.length),
          has_links: cleanLinks.length > 0,
          links: cleanLinks,
          is_deleted: false,
          card_type: cardData?.type || null,
          card_data: cardData ? JSON.stringify(cardData) : null,
          metrics: metrics,
          _media: mediaElements,
          in_reply_to_id: inReplyToId || null,
          conversation_id: conversationId,
          _debug: { 
            raw_text_elements: Array.from(tweetTextEls).map(el => el.textContent),
            test_id_elements: Array.from(el.querySelectorAll('[data-testid]')).map(el => ({
              testId: el.getAttribute('data-testid'),
              text: el.textContent
            }))
          }
        };
      }));
    }, startingLikeOrder);

    // First, insert all tweets into DB
    log('collection', 'db_insert_start', { tweetCount: tweets.length });
    
    let insertedCount = 0;
    const newTweetIds = new Set<string>();
    
    for (const tweet of tweets) {
      if (tweet.id) {
        try {
          // Check if tweet already exists
          const exists = await tweetExists(tweet.id);
          if (!exists) {
            await insertTweet(tweet);
            newTweetIds.add(tweet.id);
            insertedCount++;
          }
          log('collection', 'tweet_processed', { 
            tweetId: tweet.id, 
            isNew: !exists,
            hasMedia: tweet.has_media,
            mediaCount: tweet._media ? (
              tweet._media.images.length + 
              tweet._media.videos.length + 
              tweet._media.gifs.length
            ) : 0
          });
        } catch (error) {
          logError('collection', 'tweet_process_failed', error, { tweetId: tweet.id });
        }
      }
    }

    log('collection', 'db_insert_complete', { 
      attempted: tweets.length,
      inserted: insertedCount
    });

    // After tweets are inserted, collect thread tweets
    log('collection', 'thread_collection_start');
    
    // First, collect all thread tweets
    const threadTweetsToCollect = new Set<string>();
    
    // First pass: identify all thread tweets that need to be collected
    for (const tweet of tweets) {
      if (tweet.conversation_id && tweet.author) {
        const authorHandle = tweet.author.split(' ').pop()?.trim() || '';
        
        try {
          // Navigate to the conversation/thread view
          const threadUrl = `https://twitter.com/i/status/${tweet.conversation_id}`;
          log('thread_debug', 'loading_thread_page', { url: threadUrl });
          
          await page.goto(threadUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });
          
          // Wait for tweets to load
          await page.waitForSelector('article', { timeout: 10000 });
          
          // Extract all tweets in the thread by the same author
          const threadTweets = await page.$$eval('article', (articles: Element[], authorHandle: string) => {
            // Process articles in reverse order to maintain newest-first order
            const reversedArticles = Array.from(articles).reverse();
            const results = reversedArticles
              .map(article => {
                const authorEl = article.querySelector('[data-testid="User-Name"]');
                const authorSpans = authorEl ? Array.from(authorEl.querySelectorAll('span')) : [];
                const handleSpan = authorSpans.find(span => (span.textContent || '').includes('@'));
                const handle = handleSpan?.textContent?.trim() || '';
                
                // Extract tweet ID from URL
                const tweetLink = article.querySelector('a[href*="/status/"]');
                const tweetUrl = tweetLink?.getAttribute('href') || '';
                const tweetId = tweetUrl.split('/status/')[1]?.split('?')[0] || '';
                
                // Check if this is a reply to determine thread structure
                const isReply = article.querySelector('[data-testid="tweet"] a[href*="/status/"]');
                
                // Direct handle comparison
                const isOriginalAuthor = handle === authorHandle;

                return {
                  id: tweetId,
                  handle,
                  isReply: !!isReply,
                  isOriginalAuthor,
                  debug: {
                    handle,
                    authorHandle,
                    authorMatch: isOriginalAuthor,
                    tweetId
                  }
                };
              })
              .filter(t => {
                const include = t.isOriginalAuthor && t.id;
                console.log('Thread tweet filter:', {
                  id: t.id,
                  include,
                  ...t.debug
                });
                return include;
              })
              .map((t, index) => ({
                id: t.id,
                position: index + 1,
                debug: t.debug
              }));

            return {
              tweets: results,
              debug: {
                totalArticles: articles.length,
                filteredCount: results.length,
                authorHandle
              }
            };
          }, authorHandle);

          // Add all thread tweets to collection set
          threadTweets.tweets.forEach((t: { id: string }) => threadTweetsToCollect.add(t.id));
          
          if (threadTweets.tweets.length > 1) {
            log('collection', 'thread_found', {
              threadId: tweet.id,
              tweetCount: threadTweets.tweets.length,
              tweets: threadTweets.tweets
            });
          }
        } catch (error) {
          logError('collection', 'thread_extraction_failed', error, {
            tweetId: tweet.id,
            conversationId: tweet.conversation_id
          });
        }
      }
    }

    // Second pass: collect all identified thread tweets
    log('collection', 'thread_tweets_collection_start', { count: threadTweetsToCollect.size });
    
    const collectedThreadTweets = new Set<string>();
    
    for (const tweetId of threadTweetsToCollect) {
      if (!await tweetExists(tweetId)) {
        try {
          // Navigate to tweet page
          const tweetUrl = `https://twitter.com/i/status/${tweetId}`;
          await page.goto(tweetUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });
          
          // Wait for tweet to load
          await page.waitForSelector('article', { timeout: 10000 });
          
          // Extract tweet data
          const threadTweetData = await page.$$eval('article', (articles: Element[], args: { now: number; position: number }) => {
            const article = articles[0];  // We only need the first article for the specific tweet
            
            // Helper to extract tweet ID from URL
            function extractTweetId(url: string): string | null {
              const match = url.match(/\/status\/(\d+)/);
              return match ? match[1] : null;
            }

            const tweetUrl = article.querySelector('a[href*="/status/"]')?.getAttribute('href') || '';
            const tweetId = extractTweetId(tweetUrl) || '';
            
            // Get tweet timestamp
            const timestampEl = article.querySelector('time');
            const tweetTimestamp = timestampEl?.getAttribute('datetime') || new Date().toISOString();

            // Get the main tweet text content
            const tweetTextEls = article.querySelectorAll('[data-testid="tweetText"]');
            const textContent = Array.from(tweetTextEls)
              .map(el => el.textContent || '')
              .join('\n\n')
              .trim();

            // Get author info
            const authorEl = article.querySelector('[data-testid="User-Name"]');
            const authorSpans = authorEl ? Array.from(authorEl.querySelectorAll('span')) : [];
            const handleSpan = authorSpans.find(span => (span.textContent || '').includes('@'));
            const displayName = authorSpans[0]?.textContent || '';
            const handle = handleSpan?.textContent || '';

            // Extract media elements
            const mediaElements = {
              images: Array.from(article.querySelectorAll('img[src*="pbs.twimg.com/media"]'))
                .map(img => ({
                  url: (img as HTMLImageElement).src.split('?')[0]
                })),
              videos: Array.from(article.querySelectorAll('video[src*="video.twimg.com"], div[data-testid="videoPlayer"]'))
                .map(video => {
                  if (video instanceof HTMLVideoElement) {
                    return { url: video.src };
                  } else {
                    const source = video.querySelector('source');
                    return { url: source?.src || '' };
                  }
                })
                .filter(v => v.url),
              gifs: Array.from(article.querySelectorAll('video[poster*="tweet_video_thumb"]'))
                .map(gif => ({
                  url: (gif as HTMLVideoElement).src
                }))
            };
            
            return {
              id: tweetId,
              html: article.innerHTML || '',
              text_content: textContent,
              display_name: displayName,
              handle: handle,
              author: handle ? `${displayName} ${handle}` : displayName,
              created_at: tweetTimestamp,
              like_order: args.now - args.position,  // Decrement by thread position
              is_quote_tweet: false,
              has_media: mediaElements.images.length > 0 || mediaElements.videos.length > 0 || mediaElements.gifs.length > 0,
              has_links: false,
              links: [],
              is_deleted: false,
              card_type: null,
              card_data: null,
              metrics: {
                replies: '0',
                retweets: '0',
                likes: '0',
                views: '0'
              },
              _media: mediaElements
            };
          }, { 
            now: Date.now(), 
            position: Array.from(threadTweetsToCollect).indexOf(tweetId) + 1 
          });
          
          // Insert thread tweet if it doesn't exist
          if (threadTweetData && !await tweetExists(threadTweetData.id)) {
            await insertTweet(threadTweetData);
            collectedThreadTweets.add(threadTweetData.id);
            log('collection', 'thread_tweet_inserted', { tweetId: threadTweetData.id });

            // Process media for thread tweet
            if (threadTweetData._media) {
              const mediaItems: Array<{ tweetId: string; url: string; mediaType: string }> = [];
              
              // Collect images
              threadTweetData._media.images.forEach((image: { url: string }) => {
                mediaItems.push({ tweetId: threadTweetData.id, url: image.url, mediaType: 'image' });
              });

              // Collect videos
              threadTweetData._media.videos.forEach((video: { url: string }) => {
                mediaItems.push({ tweetId: threadTweetData.id, url: video.url, mediaType: 'video' });
              });

              // Collect GIFs
              threadTweetData._media.gifs.forEach((gif: { url: string }) => {
                mediaItems.push({ tweetId: threadTweetData.id, url: gif.url, mediaType: 'gif' });
              });

              // Process media items
              if (mediaItems.length > 0) {
                await processMediaItems(mediaItems);
              }
            }
          }
        } catch (error) {
          logError('collection', 'thread_tweet_collection_failed', error, { tweetId });
        }
      } else {
        collectedThreadTweets.add(tweetId);
      }
    }
    
    // Now that all tweets are collected, establish thread relationships
    log('collection', 'thread_relationships_start');
    
    for (const tweet of tweets) {
      if (tweet.conversation_id && tweet.author) {
        const authorHandle = tweet.author.split(' ').pop()?.trim() || '';
        
        try {
          // Navigate to the conversation/thread view
          const threadUrl = `https://twitter.com/i/status/${tweet.conversation_id}`;
          await page.goto(threadUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });
          
          // Wait for tweets to load
          await page.waitForSelector('article', { timeout: 10000 });
          
          // Extract all tweets in the thread by the same author
          const threadTweets = await page.$$eval('article', (articles: Element[], authorHandle: string) => {
            // Process articles in reverse order to maintain newest-first order
            const reversedArticles = Array.from(articles).reverse();
            const results = reversedArticles
              .map(article => {
                const authorEl = article.querySelector('[data-testid="User-Name"]');
                const authorSpans = authorEl ? Array.from(authorEl.querySelectorAll('span')) : [];
                const handleSpan = authorSpans.find(span => (span.textContent || '').includes('@'));
                const handle = handleSpan?.textContent?.trim() || '';
                
                // Extract tweet ID from URL
                const tweetLink = article.querySelector('a[href*="/status/"]');
                const tweetUrl = tweetLink?.getAttribute('href') || '';
                const tweetId = tweetUrl.split('/status/')[1]?.split('?')[0] || '';
                
                // Direct handle comparison
                const isOriginalAuthor = handle === authorHandle;

                return {
                  id: tweetId,
                  handle,
                  isOriginalAuthor,
                  debug: {
                    handle,
                    authorHandle,
                    authorMatch: isOriginalAuthor,
                    tweetId
                  }
                };
              })
              .filter(t => {
                const include = t.isOriginalAuthor && t.id;
                return include;
              })
              .map((t, index) => ({
                id: t.id,
                position: index + 1,
                debug: t.debug
              }));

            return {
              tweets: results,
              debug: {
                totalArticles: articles.length,
                filteredCount: results.length,
                authorHandle
              }
            };
          }, authorHandle);

          // If we found thread tweets, process them
          if (threadTweets.tweets.length > 1) {
            const threadId = tweet.id;
            
            // First verify all tweets exist in the database
            const allTweetsExist = await Promise.all(
              threadTweets.tweets.map(async (t: { id: string }) => collectedThreadTweets.has(t.id) || await tweetExists(t.id))
            );
            
            if (allTweetsExist.every(exists => exists)) {
              // Mark the first tweet as thread start and update length
              await updateThreadMetadata(threadId, threadTweets.tweets.length);
              log('thread_debug', 'thread_metadata_updated', {
                threadId,
                length: threadTweets.tweets.length
              });
              
              // Insert thread relationships
              for (const threadTweet of threadTweets.tweets) {
                await insertThreadTweet(threadId, threadTweet.id, threadTweet.position);
                log('thread_debug', 'thread_relationship_inserted', {
                  threadId,
                  tweetId: threadTweet.id,
                  position: threadTweet.position
                });
              }
            } else {
              log('thread_debug', 'thread_relationship_skipped', {
                threadId,
                reason: 'not_all_tweets_exist',
                tweets: threadTweets.tweets.map((t: { id: string }, i: number) => ({
                  id: t.id,
                  exists: allTweetsExist[i]
                }))
              });
            }
          }
        } catch (error) {
          logError('collection', 'thread_relationship_failed', error, {
            tweetId: tweet.id,
            conversationId: tweet.conversation_id
          });
        }
      }
    }
    
    log('collection', 'thread_relationships_complete');

    // Finally, process media
    const mediaItems: Array<{ tweetId: string; url: string; mediaType: string }> = [];
    
    for (const tweet of tweets) {
      if (tweet.id && tweet._media && newTweetIds.has(tweet.id)) {
        // Collect images
        tweet._media.images.forEach((image: { url: string }) => {
          mediaItems.push({ tweetId: tweet.id, url: image.url, mediaType: 'image' });
        });

        // Collect videos
        tweet._media.videos.forEach((video: { url: string }) => {
          mediaItems.push({ tweetId: tweet.id, url: video.url, mediaType: 'video' });
        });

        // Collect GIFs
        tweet._media.gifs.forEach((gif: { url: string }) => {
          mediaItems.push({ tweetId: tweet.id, url: gif.url, mediaType: 'gif' });
        });
      }
    }

    // Process all media items in parallel with concurrency control
    if (mediaItems.length > 0) {
      log('collection', 'media_processing_start', { 
        mediaCount: mediaItems.length,
        byType: {
          images: mediaItems.filter(m => m.mediaType === 'image').length,
          videos: mediaItems.filter(m => m.mediaType === 'video').length,
          gifs: mediaItems.filter(m => m.mediaType === 'gif').length
        }
      });
      
      const results = await processMediaItems(mediaItems);
      const successCount = results.filter(r => r.success).length;
      
      log('collection', 'media_processing_complete', {
        total: mediaItems.length,
        successful: successCount,
        failed: mediaItems.length - successCount
      });
    } else {
      log('collection', 'no_media_found');
    }

    log('collection', 'complete', {
      mode,
      tweetsCollected: tweets.length,
      tweetsInserted: insertedCount,
      mediaProcessed: mediaItems.length
    });

    await currentBrowserContext.close();
    currentBrowserContext = null;
  } catch (error) {
    console.error("Collection error:", error);
    if (currentBrowserContext) {
      try {
        await currentBrowserContext.close();
      } catch (closeError) {
        console.error("Error closing browser:", closeError);
      }
      currentBrowserContext = null;
    }
  } finally {
    isCollecting = false;
  }
}