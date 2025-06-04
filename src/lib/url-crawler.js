import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';

export class URLCrawler {
  constructor(options = {}) {
    this.extractCode = options.extractCode !== false;
    this.followLinks = options.followLinks || false;
    this.maxDepth = options.maxDepth || 1;
    this.outputDir = options.outputDir || path.join(process.cwd(), 'data/urls');
    this.debugMode = options.debug || true;
    
    this.axiosInstance = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OnyxMCP-URLCrawler/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
  }
  
  debug(...args) {
    if (this.debugMode) {
      console.log('[URL]', ...args);
    }
  }

  async crawlSingle(url) {
    this.debug(`Crawling single URL: ${url}`);
    
    try {
      const response = await this.axiosInstance.get(url);
      const $ = cheerio.load(response.data);
      
      const result = this.extractContent($, url);
      
      // Save to file if outputDir is specified
      if (this.outputDir) {
        await fs.mkdir(this.outputDir, { recursive: true });
        const filename = this.generateFilename(url);
        const outputPath = path.join(this.outputDir, filename);
        await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
        this.debug(`Saved content to ${outputPath}`);
      }
      
      return result;
    } catch (error) {
      this.debug(`Failed to crawl ${url}:`, error.message);
      return {
        url: url,
        error: error.message,
        crawledAt: new Date().toISOString()
      };
    }
  }

  extractContent($, url) {
    // Remove script, style, and navigation elements
    $('script, style, nav, footer, .navigation, .sidebar').remove();
    
    // Extract title
    const title = $('title').text().trim() || 
                  $('h1').first().text().trim() || 
                  'Untitled';
    
    // Extract main content
    let content = $('main, article, .content, .post, .entry').first();
    if (!content.length) {
      content = $('body');
    }
    
    // Extract text content
    const textContent = content.text()
      .replace(/\s+/g, ' ')
      .trim();
    
    // Extract headings
    const headings = [];
    content.find('h1, h2, h3, h4, h5, h6').each((i, el) => {
      const text = $(el).text().trim();
      if (text) {
        headings.push({
          level: parseInt(el.tagName.charAt(1)),
          text: text
        });
      }
    });
    
    // Extract code blocks if requested
    const codeBlocks = [];
    if (this.extractCode) {
      content.find('pre, code, .code, .highlight, .codehilite').each((i, el) => {
        const code = $(el).text().trim();
        if (code && code.length > 5) {
          const language = this.detectLanguage($(el));
          codeBlocks.push({
            code: code,
            language: language,
            context: $(el).closest('section, div, article')
              .find('h1, h2, h3, h4').first().text().trim()
          });
        }
      });
    }
    
    // Extract links
    const links = [];
    content.find('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      const linkText = $(el).text().trim();
      if (href && linkText) {
        try {
          const fullUrl = new URL(href, url);
          links.push({
            url: fullUrl.href,
            text: linkText
          });
        } catch (error) {
          // Skip invalid URLs
        }
      }
    });
    
    return {
      url: url,
      title: title,
      content: textContent,
      headings: headings,
      codeBlocks: codeBlocks,
      links: links.slice(0, 20), // Limit to 20 links
      contentLength: textContent.length,
      codeBlockCount: codeBlocks.length,
      crawledAt: new Date().toISOString()
    };
  }

  detectLanguage(codeElement) {
    const classes = codeElement.attr('class') || '';
    const parentClasses = codeElement.parent().attr('class') || '';
    const allClasses = classes + ' ' + parentClasses;
    
    // Check for language indicators
    if (allClasses.includes('onyx')) return 'onyx';
    if (allClasses.includes('javascript') || allClasses.includes('js')) return 'javascript';
    if (allClasses.includes('python') || allClasses.includes('py')) return 'python';
    if (allClasses.includes('java')) return 'java';
    if (allClasses.includes('cpp') || allClasses.includes('c++')) return 'cpp';
    if (allClasses.includes('rust')) return 'rust';
    if (allClasses.includes('go')) return 'go';
    if (allClasses.includes('bash') || allClasses.includes('shell')) return 'bash';
    if (allClasses.includes('json')) return 'json';
    if (allClasses.includes('yaml') || allClasses.includes('yml')) return 'yaml';
    if (allClasses.includes('html')) return 'html';
    if (allClasses.includes('css')) return 'css';
    
    return 'unknown';
  }

  generateFilename(url) {
    // Create a safe filename from URL
    const urlObj = new URL(url);
    const safeName = (urlObj.hostname + urlObj.pathname)
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 100);
    
    return `${safeName}_${Date.now()}.json`;
  }

  async crawlMultiple(urls) {
    const results = [];
    
    for (const url of urls) {
      const result = await this.crawlSingle(url);
      results.push(result);
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return results;
  }
}