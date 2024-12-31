import { chromium } from 'playwright';
import { insertTweet, insertMedia, DIRS } from '../storage/db';
import path from 'path';
import { app } from 'electron';
import fs from 'fs/promises';
import crypto from 'crypto';
import { execSync } from 'child_process';

let isCollecting = false;
let currentBrowserContext: any = null;

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
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download: ${response.statusText}`);
    
    const contentType = response.headers.get('content-type') || '';
    const ext = contentType.includes('image/') ? '.jpg' : '.mp4';  // Simplified extension logic
    
    const filename = `${tweetId}_${crypto.createHash('md5').update(url).digest('hex').slice(0, 8)}${ext}`;
    const localPath = path.join(DIRS.media, filename);
    
    const buffer = await response.arrayBuffer();
    await fs.writeFile(localPath, Buffer.from(buffer));
    
    return localPath;
  } catch (error) {
    console.error(`Failed to download media from ${url}:`, error);
    throw error;
  }
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
    
    currentBrowserContext = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      channel: 'chrome',
      viewport: { width: 1280, height: 800 },
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-default-browser-check',
        '--no-first-run',
        '--no-startup-window'
      ]
    });

    console.log('Browser launched, creating new page...');
    const page = await currentBrowserContext.newPage();
    
    // Ensure window is visible and focused
    const window = page.mainFrame().page();
    await window.bringToFront();
    
    console.log('Removing automation flags...');
    await page.addInitScript(() => {
      delete (window as any).navigator.webdriver;
      // @ts-ignore
      window.chrome = { runtime: {} };
    });
    
    console.log('Navigating to Twitter...');
    try {
      await page.goto('https://twitter.com', {
        waitUntil: 'networkidle',
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
      // Check for common elements that indicate we're logged in
      return !document.querySelector('a[href="/login"]') && 
             !document.querySelector('a[href="/i/flow/login"]') &&
             !document.querySelector('[data-testid="loginButton"]');
    });

    if (!isLoggedIn) {
      console.log('Login required. Please log in to continue...');
      
      // Click the Sign in button
      const signInButton = await page.getByTestId('loginButton');
      if (signInButton) {
        await signInButton.click();
        await page.waitForLoadState('networkidle');
      } else {
        // Try clicking the Sign in link if button not found
        const signInLink = await page.getByRole('link', { name: 'Sign in' });
        if (signInLink) {
          await signInLink.click();
          await page.waitForLoadState('networkidle');
        }
      }

      // Wait for successful login (when we can access the home feed)
      await page.waitForFunction(() => {
        return window.location.pathname === '/home' || 
               document.querySelector('[data-testid="primaryColumn"]') !== null;
      }, { timeout: 120000 }).catch(() => {
        throw new Error('Login timeout - please try again');
      });
      console.log('Successfully logged in');
    }

    // Now navigate to likes
    console.log('Navigating to likes page...');
    await page.goto('https://twitter.com/home', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Click the Likes link in the sidebar
    const likesLink = await page.getByRole('link', { name: 'Likes' });
    if (likesLink) {
      await likesLink.click();
      await page.waitForLoadState('networkidle');
    }

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
        const textContent = el.textContent || '';
        const author = el.querySelector('[href*="/"] span')?.textContent || 'unknown';
        
        // Check for media
        const images = Array.from(el.querySelectorAll('img[src*="pbs.twimg.com/media"]')).map(img => ({
          url: (img as HTMLImageElement).src
        }));
        const videos = Array.from(el.querySelectorAll('video')).map(video => ({
          url: (video as HTMLVideoElement).src
        }));
        const gifs = Array.from(el.querySelectorAll('video[poster*="tweet_video_thumb"]')).map(gif => ({
          url: (gif as HTMLVideoElement).src
        }));

        // Check for cards (rich media previews)
        const card = el.querySelector('[data-testid="card.wrapper"]');
        const cardData = card ? {
          type: card.getAttribute('data-card-type'),
          url: card.querySelector('a')?.href,
          title: card.querySelector('[data-testid="card.layoutLarge.title"]')?.textContent,
          description: card.querySelector('[data-testid="card.layoutLarge.description"]')?.textContent
        } : null;
        
        return {
          id: tweetId,
          html: el.innerHTML || '',
          text_content: textContent,
          author: author,
          liked_at: new Date().toISOString(),
          first_seen_at: new Date().toISOString(),
          is_quote_tweet: !!el.querySelector('[data-testid="tweet-text-show-more-link"]'),
          has_media: !!(images.length || videos.length || gifs.length),
          has_links: !!el.querySelector('a[href*="//"]'),
          is_deleted: false,
          card_type: cardData?.type || null,
          card_data: cardData ? JSON.stringify(cardData) : null,
          _media: {
            images: images,
            videos: videos,
            gifs: gifs
          }
        };
      });
    });

    // Insert into DB
    console.log(`Found ${tweets.length} tweets, saving to database...`);
    let savedCount = 0;
    for (const tweet of tweets) {
      if (tweet.id) {
        // First insert the tweet
        await insertTweet(tweet);
        savedCount++;
        
        if (tweet._media) {
          console.log(`Processing media for tweet ${tweet.id}...`);
          // Handle images
          for (const image of tweet._media.images) {
            try {
              const localPath = await downloadMedia(image.url, tweet.id);
              await insertMedia({
                tweetId: tweet.id,
                mediaType: 'image',
                originalUrl: image.url,
                localPath,
              });
            } catch (error) {
              console.error(`Failed to process image for tweet ${tweet.id}:`, error);
            }
          }

          // Handle videos
          for (const video of tweet._media.videos) {
            try {
              const localPath = await downloadMedia(video.url, tweet.id);
              await insertMedia({
                tweetId: tweet.id,
                mediaType: 'video',
                originalUrl: video.url,
                localPath,
              });
            } catch (error) {
              console.error(`Failed to process video for tweet ${tweet.id}:`, error);
            }
          }

          // Handle GIFs
          for (const gif of tweet._media.gifs) {
            try {
              const localPath = await downloadMedia(gif.url, tweet.id);
              await insertMedia({
                tweetId: tweet.id,
                mediaType: 'gif',
                originalUrl: gif.url,
                localPath,
              });
            } catch (error) {
              console.error(`Failed to process GIF for tweet ${tweet.id}:`, error);
            }
          }
        }
      }
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