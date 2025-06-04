#!/usr/bin/env node

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

import { Command } from 'commander';
import { fileURLToPath } from 'url';
import path from 'path';

// Import core modules
import { startMcpServer } from './mcp-server.js';
import { crawlDocumentation } from './crawlers/docs.js';
import { crawlGitHub } from './crawlers/github.js';
import { crawlUrl } from './crawlers/urls.js';
import { runTests } from './test.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const program = new Command();

program
  .name('onyx-mcp')
  .description('Enhanced MCP server for Onyx programming language')
  .version('2.0.0');

// MCP Server command
program
  .command('server')
  .description('Start the MCP server')
  .option('-d, --dev', 'Enable development mode with auto-reload')
  .action((options) => {
    startMcpServer(options.dev);
  });

// Crawl commands
const crawlCmd = program
  .command('crawl')
  .description('Crawl various data sources');

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
  .description('Crawl all data sources')
  .option('-f, --force', 'Force recrawl documentation')
  .option('-l, --limit <number>', 'Repository limit for GitHub crawl', '20')
  .action(async (repositories, options) => {
    console.log('🔄 Starting comprehensive crawl...');
    
    // Crawl docs
    await crawlDocumentation({ force: options.force });
    
    // Crawl GitHub with provided repos or defaults
    const repos = repositories.length > 0 ? repositories : [
      'onyx-lang/onyx',
      'onyx-lang/onyx-examples',
      'onyx-lang/onyx-website',
      'onyx-lang/pkg-glfw3',
      'onyx-lang/pkg-http-client',
      'onyx-lang/pkg-http-server',
      'onyx-lang/pkg-json-rpc',
      'onyx-lang/pkg-ncurses',
      'onyx-lang/pkg-openal',
      'onyx-lang/pkg-opencl',
      'onyx-lang/pkg-opengles',
      'onyx-lang/pkg-openssl',
      'onyx-lang/pkg-otmp',
      'onyx-lang/pkg-perlin',
      'onyx-lang/pkg-postgres-orm',
      'onyx-lang/pkg-postgres',
      'onyx-lang/pkg-protobuf',
      'onyx-lang/pkg-qoi',
      'onyx-lang/pkg-raylib',
      'onyx-lang/pkg-stb_image',
      'onyx-lang/pkg-stb_truetype',
      'onyx-lang/pkg-webgl2'
    ];
    await crawlGitHub(repos, { limit: parseInt(options.limit) });
    
    console.log('✅ Comprehensive crawl complete!');
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
