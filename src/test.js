import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runTests() {
  console.log('🚀 Starting Onyx MCP Test Suite\n');
  
  const runner = new TestRunner();
  await runner.runAllTests();
}

class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.dataDir = path.join(__dirname, '../data');
  }

  async test(name, testFn) {
    try {
      console.log(`🧪 Testing: ${name}`);
      await testFn();
      console.log(`✅ PASS: ${name}`);
      this.passed++;
    } catch (error) {
      console.log(`❌ FAIL: ${name} - ${error.message}`);
      this.failed++;
    }
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async isValidJson(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      JSON.parse(content);
      return true;
    } catch {
      return false;
    }
  }

  async runScript(scriptName) {
    return new Promise((resolve, reject) => {
      const child = spawn('npm', ['run', scriptName], {
        stdio: 'inherit',
        cwd: path.dirname(__dirname)
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Script ${scriptName} failed with code ${code}`));
        }
      });

      child.on('error', reject);
    });
  }

  async runAllTests() {
    console.log('🚀 Starting Onyx MCP Test Suite\n');

    // Test 1: Check file structure
    await this.test('File structure exists', async () => {
      const requiredFiles = [
        'src/mcp-server.js',
        'src/crawlers/docs.js',
        'src/crawlers/github.js',
        'src/core/search-engine.js',
        'src/crawlers/urls.js',
        'package.json',
        'README.md'
      ];

      for (const file of requiredFiles) {
        const filePath = path.join(__dirname, '..', file);
        if (!(await this.fileExists(filePath))) {
          throw new Error(`Required file missing: ${file}`);
        }
      }
    });

    // Test 2: Package.json validation
    await this.test('Package.json is valid', async () => {
      const pkgPath = path.join(__dirname, '..', 'package.json');
      if (!(await this.isValidJson(pkgPath))) {
        throw new Error('package.json is not valid JSON');
      }

      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
      
      if (pkg.name !== 'onyx_mcp') {
        throw new Error(`Expected package name 'onyx_mcp', got '${pkg.name}'`);
      }

      if (pkg.version !== '2.0.0') {
        throw new Error(`Expected version '2.0.0', got '${pkg.version}'`);
      }

      const requiredScripts = ['crawl:docs', 'crawl:github', 'crawl:all', 'start', 'dev'];
      for (const script of requiredScripts) {
        if (!pkg.scripts[script]) {
          throw new Error(`Missing required script: ${script}`);
        }
      }
    });

    // Test 3: Module imports work
    await this.test('Module imports work', async () => {
      try {
        const { SearchEngine } = await import('./core/search-engine.js');
        const GitHubCrawler = (await import('./crawlers/github.js')).default;
        const { UrlCrawler } = await import('./crawlers/urls.js');
        
        // Test that classes can be instantiated
        new SearchEngine('/tmp');
        new GitHubCrawler();
        new UrlCrawler();
      } catch (error) {
        throw new Error(`Module import failed: ${error.message}`);
      }
    });

    // Test 4: Data directory structure
    await this.test('Data directory can be created', async () => {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.mkdir(path.join(this.dataDir, 'github'), { recursive: true });
      await fs.mkdir(path.join(this.dataDir, 'urls'), { recursive: true });
    });

    // Test 5: SearchEngine functionality
    await this.test('SearchEngine handles missing data gracefully', async () => {
      const { SearchEngine } = await import('./core/search-engine.js');
      
      // Use a temporary directory that definitely doesn't have data files
      const tempDir = path.join(this.dataDir, 'temp-test-' + Date.now());
      const searchEngine = new SearchEngine(tempDir);
      
      // Suppress console.error during test
      const originalConsoleError = console.error;
      console.error = () => {}; // Silent
      
      try {
        // These should return error messages, not throw exceptions
        const docsResult = await searchEngine.searchDocs('test');
        if (!docsResult.error) {
          throw new Error('Expected error for missing docs data, but got: ' + JSON.stringify(docsResult));
        }

        const githubResult = await searchEngine.searchGitHubExamples('test');
        if (!githubResult.error) {
          throw new Error('Expected error for missing GitHub data, but got: ' + JSON.stringify(githubResult));
        }
      } finally {
        // Restore console.error
        console.error = originalConsoleError;
      }
    });

    // Test 6: URLCrawler basic functionality
    await this.test('URLCrawler can be configured', async () => {
      const { UrlCrawler } = await import('./crawlers/urls.js');
      const crawler = new UrlCrawler({
        extractCode: true,
        followLinks: false,
        maxDepth: 1,
        debug: false
      });

      // Test that it doesn't crash with a simple configuration
      if (!crawler.extractCode || crawler.followLinks || crawler.maxDepth !== 1) {
        throw new Error('URLCrawler configuration not applied correctly');
      }
    });

    // Test 7: GitHub crawler configuration
    await this.test('GitHub crawler initializes correctly', async () => {
      const GitHubCrawler = (await import('./crawlers/github.js')).default;
      const crawler = new GitHubCrawler({
        debug: false,
        maxFilesPerRepo: 10,
        maxFileSize: 1000
      });

      if (crawler.maxFilesPerRepo !== 10 || crawler.maxFileSize !== 1000) {
        throw new Error('GitHub crawler configuration not applied correctly');
      }
    });

    // Print results
    console.log('\n📊 Test Results:');
    console.log(`✅ Passed: ${this.passed}`);
    console.log(`❌ Failed: ${this.failed}`);
    console.log(`📈 Success Rate: ${Math.round((this.passed / (this.passed + this.failed)) * 100)}%`);

    if (this.failed === 0) {
      console.log('\n🎉 All tests passed! Your Onyx MCP is ready to use.');
      console.log('\n📝 Next steps:');
      console.log('1. Run "npm run crawl:all" to populate data');
      console.log('2. Run "npm start" to start the MCP server');
      console.log('3. Configure Claude Desktop to use the server');
    } else {
      console.log('\n⚠️  Some tests failed. Please fix the issues before using the server.');
      process.exit(1);
    }
  }
}
