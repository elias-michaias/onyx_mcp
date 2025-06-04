#!/usr/bin/env node

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

import { Command } from 'commander';
import { fileURLToPath } from 'url';
import path from 'path';

// Import core modules
import { startMcpServer } from './mcp-server.js';
import { OnyxMcpHttpServer } from './mcp-http.js';
import { crawlDocumentation } from './crawlers/docs.js';
import { crawlGitHub } from './crawlers/github.js';
import { crawlUrl } from './crawlers/urls.js';
import { runTests } from './test.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const program = new Command();

program
  .name('onyx-mcp')
  .description('MCP server for Onyx programming language - search and query functionality only')
  .version('2.0.0');

// NOTE: This MCP server is designed for search and query operations only.
// Crawling functionality exists in the crawler files but is not exposed through MCP interface.

// MCP Server command
program
  .command('server')
  .description('Start the MCP server')
  .option('-d, --dev', 'Enable development mode with auto-reload')
  .action((options) => {
    startMcpServer(options.dev);
  });

// HTTP Server command  
program
  .command('http')
  .description('Start the HTTP server for REST API access')
  .option('-p, --port <number>', 'Port number', '3001')
  .option('-d, --dev', 'Enable development mode')
  .action(async (options) => {
    console.log('🌐 Starting Onyx MCP HTTP Server...');
    const port = parseInt(options.port);
    const server = new OnyxMcpHttpServer(port);
    
    try {
      await server.start();
      if (options.dev) {
        console.log('📊 Development mode enabled');
      }
    } catch (error) {
      console.error('❌ Failed to start HTTP server:', error.message);
      process.exit(1);
    }
  });

// Bridge command
program
  .command('bridge')
  .description('Start the MCP-to-HTTP bridge (connects MCP to HTTP server)')
  .option('-u, --url <url>', 'HTTP server URL', 'http://localhost:3001')
  .action(async (options) => {
    // Set environment variable for the bridge
    process.env.HTTP_SERVER_URL = options.url;
    
    // Import and start the bridge
    const { default: startBridge } = await import('./bridge.js');
    await startBridge();
  });

// Crawl commands - available in CLI but NOT through MCP interface
const crawlCmd = program
  .command('crawl')
  .description('Crawl various data sources to populate MCP data');

crawlCmd
  .command('docs')
  .description('Crawl official Onyx documentation')
  .option('-f, --force', 'Force recrawl even if recently updated')
  .action((options) => {
    crawlDocumentation(options);
  });

crawlCmd
  .command('github <repositories...>')
  .description('Crawl GitHub repositories for Onyx code')
  .option('-l, --limit <number>', 'Maximum number of repositories to process', '20')
  .action((repositories, options) => {
    const limit = parseInt(options.limit);
    crawlGitHub(repositories, { limit });
  });

crawlCmd
  .command('url <url>')
  .description('Crawl a specific URL for content')
  .option('--no-code', 'Skip code block extraction')
  .action((url, options) => {
    crawlUrl(url, { extractCode: options.code });
  });

crawlCmd
  .command('all [repositories...]')
  .description('Crawl all data sources to populate MCP')
  .option('-f, --force', 'Force recrawl documentation')
  .option('-l, --limit <number>', 'Repository limit for GitHub crawl', '20')
  .action(async (repositories, options) => {
    console.log('🔄 Starting comprehensive crawl to populate MCP data...');
    
    // Crawl docs
    await crawlDocumentation({ force: options.force });
    
    // Crawl GitHub - let github.js handle defaults if no repos provided
    await crawlGitHub(repositories.length > 0 ? repositories : null, { limit: parseInt(options.limit) });
    
    console.log('✅ Comprehensive crawl complete! MCP is now ready to use.');
  });

// Test command
program
  .command('test')
  .description('Run the test suite')
  .action(() => {
    runTests();
  });

// Validate command
program
  .command('validate')
  .description('Validate project setup')
  .action(async () => {
    const { validateSetup } = await import('./validate.js');
    validateSetup();
  });

// Default to server command if no command provided
if (process.argv.length === 2) {
  console.log('🚀 Starting Onyx MCP Server (default)...');
  startMcpServer();
} else {
  program.parse();
}
