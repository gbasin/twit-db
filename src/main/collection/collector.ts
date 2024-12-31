import { chromium } from 'playwright';
import { insertTweet } from '../storage/db';

let isCollecting = false;

export async function collectLikes(mode: 'incremental' | 'historical') {
  if (isCollecting) {
    console.log("Collection is already in progress.");
    return;
  }
  isCollecting = true;
  try {
    console.log(`Starting ${mode} collection...`);
    
    // Launching Chrome with persistent context
    // Adjust path to a real Chrome user data dir
    const browserContext = await chromium.launchPersistentContext('/path/to/chrome/profile', {
      headless: true,
      // You can also add other Playwright launch options as needed
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
        // This is very simplistic; real parsing would be more robust
        const tweetId = el.querySelector('a[href*="/status/"]')?.getAttribute('href')?.split('/status/')[1] || '';
        const textContent = el.textContent || '';
        const author = el.querySelector('[href*="/"] span')?.textContent || 'unknown';
        
        return {
          id: tweetId,
          html: el.innerHTML || '',
          text_content: textContent,
          author: author,
          liked_at: new Date().toISOString(),
          first_seen_at: new Date().toISOString(),
          is_quote_tweet: false,
          has_media: false,
          has_links: false,
          is_deleted: false
        };
      });
    });

    // Insert into DB
    for (const tweet of tweets) {
      if (tweet.id) {
        await insertTweet(tweet);
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