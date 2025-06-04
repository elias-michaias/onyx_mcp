import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function validateSetup() {
  console.log('🔍 Quick validation of Onyx MCP setup...\n');
  
  const validator = new ProjectValidator();
  await validator.validate();
}

class ProjectValidator {
  async validate() {
    let passed = 0;
    let failed = 0;

    // Test package.json
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(__dirname, '../package.json'), 'utf8'));
      console.log(`✅ Package.json: ${pkg.name} v${pkg.version}`);
      passed++;
    } catch (error) {
      console.log(`❌ Package.json: ${error.message}`);
      failed++;
    }

    // Test SearchEngine
    try {
      const { SearchEngine } = await import('./core/search-engine.js');
      const engine = new SearchEngine('/tmp');
      console.log('✅ SearchEngine: Module loads and instantiates');
      passed++;
    } catch (error) {
      console.log(`❌ SearchEngine: ${error.message}`);
      failed++;
    }

    // Test GitHubCrawler
    try {
      const GitHubCrawler = (await import('./crawlers/github.js')).default;
      const crawler = new GitHubCrawler();
      console.log('✅ GitHubCrawler: Module loads and instantiates');
      passed++;
    } catch (error) {
      console.log(`❌ GitHubCrawler: ${error.message}`);
      failed++;
    }

    // Test UrlCrawler
    try {
      const { UrlCrawler } = await import('./crawlers/urls.js');
      const crawler = new UrlCrawler();
      console.log('✅ UrlCrawler: Module loads and instantiates');
      passed++;
    } catch (error) {
      console.log(`❌ UrlCrawler: ${error.message}`);
      failed++;
    }

    // Test data directory
    try {
      await fs.mkdir(path.join(__dirname, '../data'), { recursive: true });
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
      console.log('1. Run: onyx-mcp test');
      console.log('2. Run: onyx-mcp crawl all');
      console.log('3. Run: onyx-mcp server');
    } else {
      console.log('⚠️  Some validation checks failed.');
      process.exit(1);
    }
  }
}
