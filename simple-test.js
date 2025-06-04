#!/usr/bin/env node

// Simple test to see if imports work
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('Testing module imports...');
console.log('Current directory:', __dirname);

try {
  console.log('1. Testing SearchEngine import...');
  const { SearchEngine } = await import('./src/lib/search-engine.js');
  console.log('✅ SearchEngine imported successfully');
  
  const searchEngine = new SearchEngine('/tmp');
  console.log('✅ SearchEngine instantiated successfully');
  
  console.log('2. Testing GitHubOnyxCrawler import...');
  const GitHubOnyxCrawler = (await import('./src/lib/github-crawler.js')).default;
  console.log('✅ GitHubOnyxCrawler imported successfully');
  
  const githubCrawler = new GitHubOnyxCrawler();
  console.log('✅ GitHubOnyxCrawler instantiated successfully');
  
  console.log('3. Testing URLCrawler import...');
  const { URLCrawler } = await import('./src/lib/url-crawler.js');
  console.log('✅ URLCrawler imported successfully');
  
  const urlCrawler = new URLCrawler();
  console.log('✅ URLCrawler instantiated successfully');
  
  console.log('\n🎉 All imports successful!');
  
} catch (error) {
  console.error('❌ Import failed:', error.message);
  console.error('Full error:', error);
}
