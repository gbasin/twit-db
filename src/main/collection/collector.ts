import { chromium } from 'playwright';
import { insertTweet, insertMedia, DIRS } from '../storage/db';
import path from 'path';
import { app } from 'electron';
import fs from 'fs/promises';
import crypto from 'crypto';

let isCollecting = false;

// Get the user data directory for Chrome
function getChromeUserDataDir() {
  // Default Chrome profile locations by platform
  const platform = process.platform;
  const homeDir = app.getPath('home');
  
  switch (platform) {
    case 'darwin': // macOS
      return path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome');
    case 'win32': // Windows
      return path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
    default: // Linux and others
      return path.join(homeDir, '.config', 'google-chrome');
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
    
    // Use the actual Chrome profile directory
    const userDataDir = getChromeUserDataDir();
    const browserContext = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
    });

    const page = await browserContext.newPage();

    // For demonstration, let's just navigate to the "Likes" page of the user
    // In a real scenario, you'd pass the user's handle or retrieve from settings
    await page.goto('https://twitter.com/your_twitter_handle/likes', {
      waitUntil: 'domcontentloaded'
    });

    // We'll do a simple approach:
    // 1. Scroll a few times
    // 2. Extract tweets
    // 3. Insert them into DB
    // For a real production approach, you'd incorporate random timings, thorough error handling, etc.
    
    let previousHeight = 0;
    let newHeight = -1;
    let scrollCount = mode === 'historical' ? 20 : 5; // Increase if you want more data
    
    for (let i = 0; i < scrollCount; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      // Wait a bit for content to load
      await page.waitForTimeout(2000);
      newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight === previousHeight) {
        // No new content
        break;
      }
      previousHeight = newHeight;
    }

    // Simple example of extracting tweet data from "article" elements
    const tweets = await page.$$eval('article', (articles) => {
      return articles.map((el) => {
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
    for (const tweet of tweets) {
      if (tweet.id) {
        // First insert the tweet
        await insertTweet(tweet);

        // Then handle media if present
        if (tweet._media) {
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
    await browserContext.close();
  } catch (error) {
    console.error("Collection error:", error);
  } finally {
    isCollecting = false;
  }
}