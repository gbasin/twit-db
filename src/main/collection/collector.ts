import { chromium } from 'playwright';
import { insertTweet, insertMedia, DIRS } from '../storage/db';
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

// Process media items with concurrency control
async function processMediaItems(mediaItems: Array<{
  tweetId: string;
  url: string;
  mediaType: string;
}>, concurrency = 5) {
  log('media_processing', 'start', { 
    totalItems: mediaItems.length,
    concurrency 
  });

  const queue = [...mediaItems];
  const inProgress = new Set<Promise<void>>();
  const results: Array<{ success: boolean; error?: Error }> = [];
  const stats = {
    total: mediaItems.length,
    completed: 0,
    successful: 0,
    failed: 0,
    inProgress: 0
  };

  const logStats = () => {
    log('media_processing', 'stats', stats);
  };

  while (queue.length > 0 || inProgress.size > 0) {
    // Fill up the concurrent slots
    while (queue.length > 0 && inProgress.size < concurrency) {
      const item = queue.shift()!;
      stats.inProgress++;
      
      log('media_processing', 'item_start', {
        tweetId: item.tweetId,
        mediaType: item.mediaType,
        queueRemaining: queue.length,
        inProgress: inProgress.size
      });

      const promise = (async () => {
        try {
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
        } finally {
          stats.completed++;
          stats.inProgress--;
          logStats();
        }
      })();
      
      inProgress.add(promise);
      promise.then(() => inProgress.delete(promise));
    }

    // Wait for at least one promise to complete if we've hit the concurrency limit
    if (inProgress.size >= concurrency) {
      log('media_processing', 'waiting_for_slot', {
        queueRemaining: queue.length,
        inProgress: inProgress.size
      });
      await Promise.race(inProgress);
    }
  }

  // Wait for any remaining downloads
  if (inProgress.size > 0) {
    log('media_processing', 'waiting_for_completion', {
      remaining: inProgress.size
    });
    await Promise.all(inProgress);
  }

  log('media_processing', 'complete', {
    total: stats.total,
    successful: stats.successful,
    failed: stats.failed
  });

  return results;
}

// Extract media URLs from a tweet element
function extractMediaUrls(article: Element): { 
  images: { url: string }[],
  videos: { url: string }[],
  gifs: { url: string }[]
} {
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

    log('media_extraction', 'found_media', {
      images: results.images.length,
      videos: results.videos.length,
      gifs: results.gifs.length
    });
  } catch (error) {
    logError('media_extraction', 'extraction_failed', error);
  }

  return results;
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
    // Wait for tweets to be visible
    await page.waitForSelector('article', { timeout: 30000 }).catch(() => {
      console.log('No articles found after timeout');
    });
    
    console.log('Page loaded, looking for tweets...');
    
    // We'll do a simple approach:
    // 1. Scroll a few times
    // 2. Extract tweets
    // 3. Insert them into DB
    // For a real production approach, you'd incorporate random timings, thorough error handling, etc.
    
    let previousHeight = 0;
    let newHeight = -1;
    let scrollCount = mode === 'historical' ? 20 : 5; // Increase if you want more data
    
    console.log(`Starting to scroll page (${scrollCount} times)...`);
    for (let i = 0; i < scrollCount; i++) {
      console.log(`Scroll ${i + 1}/${scrollCount}`);
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      // Wait a bit for content to load
      await page.waitForTimeout(2000);
      newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight === previousHeight) {
        console.log('No new content after scroll, stopping...');
        break;
      }
      previousHeight = newHeight;
    }

    console.log('Extracting tweets from page...');
    // Simple example of extracting tweet data from "article" elements
    const tweets = await page.$$eval('article', (articles: Element[]) => {
      return articles.map((el: Element) => {
        // Extract basic tweet info
        const tweetId = el.querySelector('a[href*="/status/"]')?.getAttribute('href')?.split('/status/')[1] || '';
        
        // Get the main tweet text content
        const tweetTextEl = el.querySelector('[data-testid="tweetText"]');
        const textContent = tweetTextEl ? tweetTextEl.textContent || '' : '';
        
        // Get author info - look for the User-Name element
        const authorEl = el.querySelector('[data-testid="User-Name"]');
        let author = 'Unknown';
        if (authorEl) {
          const spans = authorEl.querySelectorAll('span');
          const displayName = spans[0]?.textContent || '';
          const handle = spans[spans.length - 1]?.textContent || '';
          author = `${displayName} ${handle}`.trim();
        }
        
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
        
        // Clean up text content
        const cleanText = textContent.replace(/\s+/g, ' ').trim();
        const finalText = quotedText 
          ? `${cleanText}\n\nQuoted Tweet:\n${quotedText.replace(/\s+/g, ' ').trim()}`
          : cleanText;
        
        return {
          id: tweetId,
          html: el.innerHTML || '',
          text_content: finalText,
          author: author,
          liked_at: new Date().toISOString(),
          first_seen_at: new Date().toISOString(),
          is_quote_tweet: !!quotedTweet,
          has_media: !!(mediaElements.images.length || mediaElements.videos.length || mediaElements.gifs.length),
          has_links: !!el.querySelector('a[href*="//"]'),
          is_deleted: false,
          card_type: cardData?.type || null,
          card_data: cardData ? JSON.stringify(cardData) : null,
          _media: mediaElements
        };
      });
    });

    // Insert into DB and process media
    console.log(`Found ${tweets.length} tweets, saving to database...`);
    
    // First, insert all tweets
    for (const tweet of tweets) {
      if (tweet.id) {
        await insertTweet(tweet);
      }
    }

    // Then, collect all media items to process in parallel
    const mediaItems: Array<{ tweetId: string; url: string; mediaType: string }> = [];
    
    for (const tweet of tweets) {
      if (tweet.id && tweet._media) {
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
      console.log(`Processing ${mediaItems.length} media items...`);
      const results = await processMediaItems(mediaItems);
      const successCount = results.filter(r => r.success).length;
      console.log(`Successfully processed ${successCount}/${mediaItems.length} media items`);
    }

    console.log(`Finished ${mode} collection. Collected ${tweets.length} tweets.`);
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