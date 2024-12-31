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