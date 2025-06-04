#!/usr/bin/env node

import GitHubOnyxCrawler from './lib/github-crawler.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse command line arguments
const args = process.argv.slice(2);
let repoLimit = 20;
let force = false;

for (const arg of args) {
  if (arg === '--help' || arg === '-h') {
    console.log(`
🐙 GitHub Onyx Code Crawler

Usage: node src/github-crawler-cli.js [options]

Options:
  --limit, -l <num>    Maximum number of repositories to crawl (default: 20)
  --force, -f          Force recrawl even if recently crawled
  --help, -h           Show this help message

Examples:
  node src/github-crawler-cli.js
  node src/github-crawler-cli.js --limit 50
  node src/github-crawler-cli.js --force --limit 30

Environment Variables:
  GITHUB_TOKEN         GitHub personal access token (optional, but recommended)
    `);
    process.exit(0);
  } else if (arg === '--force' || arg === '-f') {
    force = true;
  } else if (arg === '--limit' || arg === '-l') {
    const nextArg = args[args.indexOf(arg) + 1];
    if (nextArg && !isNaN(parseInt(nextArg))) {
      repoLimit = parseInt(nextArg);
    }
  }
}

console.log('🚀 Starting GitHub Onyx code crawler...');
console.log(`📊 Settings: Repo limit: ${repoLimit}, Force: ${force}`);

if (process.env.GITHUB_TOKEN) {
  console.log('🔑 GitHub token detected - higher rate limits available');
} else {
  console.log('⚠️  No GitHub token found - using lower rate limits');
  console.log('   Set GITHUB_TOKEN environment variable for better performance');
}

const crawler = new GitHubOnyxCrawler({
  outputDir: path.join(__dirname, '../data/github'),
  debug: true,
  maxFilesPerRepo: 50,
  maxFileSize: 100000
});

const startTime = Date.now();

crawler.crawlAllRepositories(repoLimit)
  .then(() => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`🏁 GitHub crawl completed successfully in ${duration} seconds`);
    console.log('📄 Use the MCP server tools to search and explore the crawled code!');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 GitHub crawl failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  });