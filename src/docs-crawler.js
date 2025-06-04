import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const BASE_URLS = [
  'https://docs.onyxlang.io/book/Overview.html',  // Book documentation
  'https://docs.onyxlang.io/packages/core.html',  // Package documentation
]; 

const OUTPUT_DIR = path.join(__dirname, '../data');
const CRAWL_DELAY = 2000; // Increased to 2 seconds to avoid rate limiting
const MAX_PAGES = 500;
const RECRAWL_THRESHOLD_DAYS = 7;

class OnyxDocsCrawler {
  constructor(options = {}) {
    this.visited = new Set();
    this.docs = [];
    this.linkQueue = [];
    this.debugMode = true;
    this.forceRecrawl = options.force || false;
    this.axiosInstance = axios.create({
      timeout: 15000, // Increased timeout
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OnyxMCP-Crawler/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    });
  }

  normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      
      // Remove fragments
      urlObj.hash = '';
      
      // Sort query parameters for consistency
      const params = new URLSearchParams(urlObj.search);
      const sortedParams = new URLSearchParams();
      [...params.keys()].sort().forEach(key => {
        sortedParams.set(key, params.get(key));
      });
      urlObj.search = sortedParams.toString();
      
      // Remove trailing slash unless it's the root
      if (urlObj.pathname !== '/' && urlObj.pathname.endsWith('/')) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }
      
      return urlObj.href;
    } catch (error) {
      this.debug(`Error normalizing URL ${url}:`, error.message);
      return null;
    }
  }

  debug(...args) {
    if (this.debugMode) {
      console.log('[DEBUG]', ...args);
    }
  }

  getBaseUrlsToProcess() {
    return BASE_URLS;
  }

  async crawl(startUrls = null) {
    const urlsToProcess = startUrls || this.getBaseUrlsToProcess();
    console.log(`Starting crawl from ${urlsToProcess.length} URLs:`, urlsToProcess);
    
    // Check if sites were recently crawled
    const sitesToSkip = await this.checkRecentCrawls(urlsToProcess);
    if (sitesToSkip.length > 0) {
      if (!this.forceRecrawl) {
        console.log(`\n⏭️  Skipping ${sitesToSkip.length} recently crawled sites:`);
        sitesToSkip.forEach(site => {
          console.log(`   ${site.url} (last crawled: ${site.lastCrawled})`);
        });
        console.log(`\n💡 Use --force flag to crawl anyway\n`);
        
        const urlsToSkip = sitesToSkip.map(s => s.url);
        const filteredUrls = urlsToProcess.filter(url => !urlsToSkip.includes(url));
        
        if (filteredUrls.length === 0) {
          console.log(`All sites were recently crawled. Nothing to do.`);
          return;
        }
        
        console.log(`Proceeding with ${filteredUrls.length} sites that need crawling...`);
        this.baseUrls = filteredUrls.map(url => this.normalizeUrl(url)).filter(Boolean);
      } else {
        console.log(`\n🔄 Force flag detected - crawling all ${urlsToProcess.length} sites regardless of recent crawl dates\n`);
        this.baseUrls = urlsToProcess.map(url => this.normalizeUrl(url)).filter(Boolean);
      }
    } else {
      this.baseUrls = urlsToProcess.map(url => this.normalizeUrl(url)).filter(Boolean);
    }
    
    if (this.baseUrls.length === 0) {
      console.log(`No valid URLs to crawl.`);
      return;
    }
    
    this.debug('Normalized base URLs:', this.baseUrls);
    
    // Ensure output directory exists
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    
    // Add starting URLs to queue
    for (const url of this.baseUrls) {
      this.linkQueue.push(url);
    }
    
    // Process queue instead of recursive calls
    await this.processQueue();
    
    await this.saveDocs();
    
    console.log(`\nCrawl complete! Found ${this.docs.length} documents`);
    console.log(`Total pages visited: ${this.visited.size}`);
  }

  async processQueue() {
    let processedCount = 0;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;
    
    while (this.linkQueue.length > 0 && processedCount < MAX_PAGES) {
      const url = this.linkQueue.shift();
      const normalizedUrl = this.normalizeUrl(url);
      
      if (!normalizedUrl) {
        this.debug(`Skipping invalid URL: ${url}`);
        continue;
      }
      
      if (this.visited.has(normalizedUrl)) {
        this.debug(`SKIPPING (already visited): ${normalizedUrl}`);
        continue;
      }
      
      console.log(`[${processedCount + 1}] Crawling: ${normalizedUrl}`);
      console.log(`Queue remaining: ${this.linkQueue.length}, Total visited: ${this.visited.size}`);
      
      try {
        await this.crawlPage(normalizedUrl);
        consecutiveErrors = 0; // Reset error counter on success
        processedCount++;
      } catch (error) {
        consecutiveErrors++;
        console.error(`❌ Error crawling ${normalizedUrl}:`, error.message);
        
        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.error(`💥 Too many consecutive errors (${consecutiveErrors}). Stopping crawl to prevent issues.`);
          break;
        }
      }
      
      // Add delay between requests
      if (this.linkQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, CRAWL_DELAY));
      }
    }
    
    if (processedCount >= MAX_PAGES) {
      console.warn(`⚠️  Hit safety limit of ${MAX_PAGES} pages. Stopping crawl.`);
    }
  }

  async crawlPage(url) {
    if (this.visited.has(url)) {
      this.debug(`Already visited: ${url}`);
      return;
    }
    
    this.visited.add(url);
    
    const response = await this.axiosInstance.get(url);
    this.debug(`✓ Successfully fetched: ${url} (${response.status}) - ${response.data.length} bytes`);
    
    const $ = cheerio.load(response.data);
    
    // IMPORTANT: Extract links BEFORE cleaning up the content
    const links = this.findDocLinks($, url);
    this.debug(`Found ${links.length} valid links on page`);
    
    // Now extract and clean the page content
    const doc = this.extractContent($, url);
    if (doc.content.trim()) {
      this.docs.push(doc);
      this.debug(`✓ Extracted content: ${doc.title || 'Untitled'} (${doc.content.length} chars)`);
    } else {
      this.debug(`⚠️  No content extracted from: ${url}`);
    }
    
    // Add new links to queue
    let newLinksAdded = 0;
    for (const link of links) {
      const normalizedLink = this.normalizeUrl(link);
      if (normalizedLink && 
          !this.visited.has(normalizedLink) && 
          !this.linkQueue.includes(normalizedLink)) {
        this.linkQueue.push(normalizedLink);
        newLinksAdded++;
        this.debug(`  + Queued: ${normalizedLink}`);
      }
    }
    
    this.debug(`Added ${newLinksAdded} new links to queue (total queue: ${this.linkQueue.length})`);
  }

  extractContent($, url) {
    // Remove navigation, footer, sidebar elements
    $('footer, .navigation, .toc, script, style, nav').remove();
    
    // Extract main content - look for the main content area
    let content = $('#content main, main, .content, .documentation, article, .docs-content, .markdown-body').first();
    
    // If no specific content area found, use body but remove sidebar
    if (!content.length) {
      content = $('body');
      content.find('#sidebar, .sidebar, nav').remove();
    }
    
    // Extract metadata
    const title = $('h1').first().text().trim() || 
                  $('title').text().replace(' - Onyx Documentation', '').trim() || 
                  $('meta[property="og:title"]').attr('content') || 
                  'Untitled';
    
    const headings = [];
    content.find('h1, h2, h3, h4, h5, h6').each((i, el) => {
      const text = $(el).text().trim();
      if (text) {
        headings.push({
          level: parseInt(el.tagName.charAt(1)),
          text: text,
          id: $(el).attr('id') || null
        });
      }
    });
    
    // Extract code examples with better detection
    const codeExamples = [];
    content.find('pre code, .code-example, .highlight, code').each((i, el) => {
      const code = $(el).text().trim();
      if (code && code.length > 10) { // Only capture substantial code blocks
        codeExamples.push({
          code,
          language: this.detectLanguage($(el)),
          context: $(el).closest('section, div, article').find('h1, h2, h3, h4').first().text().trim()
        });
      }
    });
    
    // Clean up content text
    const cleanContent = content.text()
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();
    
    this.debug(`Extracted: title="${title}", headings=${headings.length}, code=${codeExamples.length}, content=${cleanContent.length} chars`);
    
    return {
      url,
      title,
      content: cleanContent,
      headings,
      codeExamples,
      crawledAt: new Date().toISOString()
    };
  }

  findDocLinks($, currentUrl) {
    const links = new Set();
    
    this.debug(`Scanning links on: ${currentUrl}`);
    
    let totalLinks = 0;
    let skippedLinks = 0;
    let validLinks = 0;
    
    $('a[href]').each((i, el) => {
      try {
        const href = $(el).attr('href');
        if (!href) return;
        
        totalLinks++;
        
        // Skip obviously external or non-doc links
        if (href.startsWith('mailto:') || 
            href.startsWith('tel:') || 
            href.startsWith('javascript:') ||
            href.includes('github.com') ||
            href.includes('twitter.com') ||
            href.includes('onyxlang.io/playground') ||
            href.includes('webassembly.org')) {
          skippedLinks++;
          return;
        }
        
        const fullUrl = new URL(href, currentUrl);
        
        // Skip non-HTTP links
        if (!fullUrl.protocol.startsWith('http')) {
          skippedLinks++;
          return;
        }
        
        // For Onyx docs, accept any link that:
        // 1. Is on docs.onyxlang.io domain
        // 2. Has path starting with /book/ OR /packages/
        // 3. Is not the print page or favicon
        if (fullUrl.hostname === 'docs.onyxlang.io' && 
            (fullUrl.pathname.startsWith('/book/') || fullUrl.pathname.startsWith('/packages/')) &&
            !fullUrl.pathname.includes('/print.html') &&
            !fullUrl.pathname.includes('favicon') &&
            fullUrl.pathname !== '/book/' &&
            fullUrl.pathname !== '/packages/') {
          
          const normalizedUrl = this.normalizeUrl(fullUrl.href);
          if (normalizedUrl) {
            links.add(normalizedUrl);
            validLinks++;
            this.debug(`  ✓ Valid link: ${normalizedUrl}`);
          }
        } else {
          skippedLinks++;
        }
      } catch (error) {
        this.debug(`  ❌ Error parsing link: ${href} - ${error.message}`);
        skippedLinks++;
      }
    });
    
    console.log(`\n📈 Link processing stats for ${currentUrl}:`);
    console.log(`- Total links found: ${totalLinks}`);
    console.log(`- Valid documentation links: ${validLinks}`);
    console.log(`- Skipped links: ${skippedLinks}`);
    
    const linkArray = Array.from(links);
    this.debug(`Found ${linkArray.length} unique valid doc links`);
    return linkArray;
  }

  detectLanguage(codeElement) {
    const classes = codeElement.attr('class') || '';
    const parent = codeElement.parent();
    const parentClasses = parent.attr('class') || '';
    
    // Check for language indicators
    if (classes.includes('language-onyx') || parentClasses.includes('language-onyx')) return 'onyx';
    if (classes.includes('language-javascript') || parentClasses.includes('language-javascript')) return 'javascript';
    if (classes.includes('language-json') || parentClasses.includes('language-json')) return 'json';
    if (classes.includes('language-bash') || parentClasses.includes('language-bash')) return 'bash';
    if (classes.includes('onyx')) return 'onyx';
    if (classes.includes('javascript') || classes.includes('js')) return 'javascript';
    if (classes.includes('json')) return 'json';
    
    return 'onyx'; // Default assumption for Onyx docs
  }

  async checkRecentCrawls(urls) {
    const recentlyCrawled = [];
    const statsPath = path.join(OUTPUT_DIR, 'crawl-stats.json');
    
    try {
      const statsData = await fs.readFile(statsPath, 'utf8');
      const stats = JSON.parse(statsData);
      
      if (!stats.crawlDate) {
        this.debug('No crawl date found in stats file');
        return recentlyCrawled;
      }
      
      const lastCrawlDate = new Date(stats.crawlDate);
      const now = new Date();
      const daysSinceLastCrawl = Math.floor((now - lastCrawlDate) / (1000 * 60 * 60 * 24));
      
      this.debug(`Last crawl was ${daysSinceLastCrawl} days ago (${lastCrawlDate.toISOString()})`);
      
      if (daysSinceLastCrawl < RECRAWL_THRESHOLD_DAYS) {
        // Check which of the current URLs were in the last crawl
        const lastCrawledUrls = stats.baseUrls || [];
        
        for (const url of urls) {
          const normalizedUrl = this.normalizeUrl(url);
          if (lastCrawledUrls.some(lastUrl => this.normalizeUrl(lastUrl) === normalizedUrl)) {
            recentlyCrawled.push({
              url: url,
              lastCrawled: lastCrawlDate.toLocaleDateString(),
              daysAgo: daysSinceLastCrawl
            });
          }
        }
      }
      
    } catch (error) {
      this.debug('Could not read previous crawl stats:', error.message);
      // If we can't read stats, assume no recent crawls
    }
    
    return recentlyCrawled;
  }

  async saveDocs() {
    const outputPath = path.join(OUTPUT_DIR, 'onyx-docs.json');
    await fs.writeFile(outputPath, JSON.stringify(this.docs, null, 2));
    
    // Also save a simplified version for quick searching
    const simplified = this.docs.map(doc => ({
      url: doc.url,
      title: doc.title,
      content: doc.content.substring(0, 500) + (doc.content.length > 500 ? '...' : ''),
      headings: doc.headings.map(h => h.text),
      codeCount: doc.codeExamples.length
    }));
    
    await fs.writeFile(
      path.join(OUTPUT_DIR, 'onyx-docs-index.json'), 
      JSON.stringify(simplified, null, 2)
    );
    
    // Generate detailed stats
    const uniqueDomains = [...new Set(this.docs.map(doc => new URL(doc.url).hostname))];
    const urlsByDomain = {};
    
    this.docs.forEach(doc => {
      const domain = new URL(doc.url).hostname;
      if (!urlsByDomain[domain]) urlsByDomain[domain] = 0;
      urlsByDomain[domain]++;
    });
    
    const stats = {
      totalDocs: this.docs.length,
      totalCodeExamples: this.docs.reduce((sum, doc) => sum + doc.codeExamples.length, 0),
      urlsCrawled: this.visited.size,
      uniqueDomains: uniqueDomains.length,
      urlsByDomain,
      crawlDate: new Date().toISOString(),
      baseUrls: this.baseUrls || BASE_URLS,
      // Debug info
      visitedUrls: Array.from(this.visited).sort(),
      docsWithoutContent: this.docs.filter(doc => !doc.content.trim()).length
    };
    
    await fs.writeFile(
      path.join(OUTPUT_DIR, 'crawl-stats.json'), 
      JSON.stringify(stats, null, 2)
    );
    
    console.log(`✅ Saved ${this.docs.length} documents to ${outputPath}`);
    console.log(`📊 Crawl stats: ${stats.totalCodeExamples} code examples from ${stats.uniqueDomains} domains`);
    console.log('📈 URLs per domain:', urlsByDomain);
    console.log(`🔍 Debug info saved to crawl-stats.json`);
  }
}

// Run crawler if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let startUrls = null;
  let forceRecrawl = false;
  
  // Parse flags and URLs
  const filteredArgs = [];
  for (const arg of args) {
    if (arg === '--force' || arg === '-f') {
      forceRecrawl = true;
      console.log('🔄 Force recrawl enabled');
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
🕷️  Onyx Documentation Crawler

Usage: node crawler.js [options] [urls...]

Options:
  --force, -f     Force recrawl even if site was crawled within the last week
  --help, -h      Show this help message

Examples:
  node crawler.js                                    # Crawl default URLs
  node crawler.js --force                           # Force crawl default URLs
  node crawler.js https://docs.onyxlang.io/book/Overview.html # Crawl specific URL
  node crawler.js --force https://docs.example.com/ # Force crawl specific URL

The crawler will automatically skip sites that were crawled within the last ${RECRAWL_THRESHOLD_DAYS} days
unless the --force flag is used.
      `);
      process.exit(0);
    } else if (arg.startsWith('http')) {
      filteredArgs.push(arg);
    } else {
      console.warn(`⚠️  Unknown argument: ${arg}`);
    }
  }
  
  if (filteredArgs.length > 0) {
    startUrls = filteredArgs;
    console.log('🎯 Using provided URLs:', startUrls);
  } else {
    console.log('📚 Using default URLs from BASE_URLS configuration');
  }
  
  const crawler = new OnyxDocsCrawler({ force: forceRecrawl });
  
  // Add process monitoring
  console.log('🚀 Starting Onyx documentation crawler...');
  const startTime = Date.now();
  
  crawler.crawl(startUrls)
    .then(() => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`🏁 Crawl completed successfully in ${duration} seconds`);
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Crawl failed:', error);
      console.error(error.stack);
      process.exit(1);
    });
}

export default OnyxDocsCrawler;
