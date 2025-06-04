#!/usr/bin/env node

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🔍 Quick validation of Onyx MCP setup...\n');

async function validate() {
  let passed = 0;
  let failed = 0;

  // Test package.json
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(__dirname, 'package.json'), 'utf8'));
    console.log(`✅ Package.json: ${pkg.name} v${pkg.version}`);
    passed++;
  } catch (error) {
    console.log(`❌ Package.json: ${error.message}`);
    failed++;
  }

  // Test SearchEngine
  try {
    const { SearchEngine } = await import('./src/lib/search-engine.js');
    const engine = new SearchEngine('/tmp');
    console.log('✅ SearchEngine: Module loads and instantiates');
    passed++;
  } catch (error) {
    console.log(`❌ SearchEngine: ${error.message}`);
    failed++;
  }

  // Test GitHubOnyxCrawler
  try {
    const GitHubOnyxCrawler = (await import('./src/lib/github-crawler.js')).default;
    const crawler = new GitHubOnyxCrawler();
    console.log('✅ GitHubOnyxCrawler: Module loads and instantiates');
    passed++;
  } catch (error) {
    console.log(`❌ GitHubOnyxCrawler: ${error.message}`);
    failed++;
  }

  // Test URLCrawler
  try {
    const { URLCrawler } = await import('./src/lib/url-crawler.js');
    const crawler = new URLCrawler();
    console.log('✅ URLCrawler: Module loads and instantiates');
    passed++;
  } catch (error) {
    console.log(`❌ URLCrawler: ${error.message}`);
    failed++;
  }

  // Test data directory
  try {
    await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
    console.log('✅ Data directory: Created successfully');
    passed++;
  } catch (error) {
    console.log(`❌ Data directory: ${error.message}`);
    failed++;
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All validation checks passed!');
    console.log('\n📝 Next steps:');
    console.log('1. Run: npm test');
    console.log('2. Run: npm run crawl:all');
    console.log('3. Run: npm start');
  } else {
    console.log('⚠️  Some validation checks failed.');
    process.exit(1);
  }
}

validate().catch(console.error);
