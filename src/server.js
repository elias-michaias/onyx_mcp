import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import GitHubOnyxCrawler from './lib/github-crawler.js';
import { SearchEngine } from './lib/search-engine.js';
import { URLCrawler } from './lib/url-crawler.js';
import OnyxDocsCrawler from './docs-crawler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class EnhancedOnyxMCP {
  constructor() {
    this.dataDir = path.join(__dirname, '../data');
    this.searchEngine = new SearchEngine(this.dataDir);
    
    this.server = new Server(
      { name: 'onyx-enhanced-mcp', version: '2.0.0' },
      { capabilities: { tools: {} } }
    );
    
    this.setupHandlers();
  }

  setupHandlers() {
    // List all available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Original documentation tools
          {
            name: 'search_onyx_docs',
            description: 'Search official Onyx programming language documentation',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query for documentation' },
                limit: { type: 'number', description: 'Maximum number of results', default: 5 }
              },
              required: ['query']
            }
          },
          {
            name: 'crawl_onyx_docs',
            description: 'Crawl and update official Onyx documentation',
            inputSchema: {
              type: 'object',
              properties: {
                force: { type: 'boolean', description: 'Force recrawl even if recently updated', default: false }
              }
            }
          },

          // GitHub repository tools
          {
            name: 'search_github_examples',
            description: 'Search Onyx code examples from GitHub repositories by topic',
            inputSchema: {
              type: 'object',
              properties: {
                topic: { type: 'string', description: 'Topic to search for (e.g., "networking", "json", "http")' },
                limit: { type: 'number', description: 'Maximum number of examples', default: 5 }
              },
              required: ['topic']
            }
          },
          {
            name: 'get_onyx_functions',
            description: 'Get Onyx function definitions and examples from GitHub',
            inputSchema: {
              type: 'object',
              properties: {
                functionName: { type: 'string', description: 'Function name to search for (optional)' },
                limit: { type: 'number', description: 'Maximum number of examples', default: 10 }
              }
            }
          },
          {
            name: 'get_onyx_structs',
            description: 'Get Onyx struct definitions and examples from GitHub',
            inputSchema: {
              type: 'object',
              properties: {
                structName: { type: 'string', description: 'Struct name to search for (optional)' },
                limit: { type: 'number', description: 'Maximum number of examples', default: 10 }
              }
            }
          },
          {
            name: 'crawl_github_repos',
            description: 'Crawl GitHub repositories for Onyx code examples',
            inputSchema: {
              type: 'object',
              properties: {
                repoLimit: { type: 'number', description: 'Maximum number of repositories to crawl', default: 20 },
                force: { type: 'boolean', description: 'Force recrawl even if recently updated', default: false }
              }
            }
          },
          {
            name: 'list_github_repos',
            description: 'List all discovered GitHub repositories with Onyx code',
            inputSchema: {
              type: 'object',
              properties: {
                sortBy: { type: 'string', enum: ['stars', 'name'], description: 'Sort repositories by', default: 'stars' }
              }
            }
          },

          // Arbitrary URL tools
          {
            name: 'crawl_url',
            description: 'Crawl and extract content from any URL',
            inputSchema: {
              type: 'object',
              properties: {
                url: { type: 'string', description: 'URL to crawl' },
                extractCode: { type: 'boolean', description: 'Extract code blocks specifically', default: true }
              },
              required: ['url']
            }
          },

          // Unified search tools
          {
            name: 'search_all_sources',
            description: 'Search all crawled content (docs, GitHub, URLs)',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query' },
                sources: { 
                  type: 'array', 
                  items: { type: 'string', enum: ['docs', 'github'] },
                  description: 'Sources to search in',
                  default: ['docs', 'github']
                },
                limit: { type: 'number', description: 'Maximum number of results', default: 10 }
              },
              required: ['query']
            }
          },

          // Legacy tools for compatibility
          {
            name: 'get_onyx_examples',
            description: 'Get code examples for specific Onyx features or functions',
            inputSchema: {
              type: 'object',
              properties: {
                topic: { type: 'string', description: 'Topic or feature to find examples for' },
                limit: { type: 'number', description: 'Maximum number of examples to return', default: 3 }
              },
              required: ['topic']
            }
          },
          {
            name: 'get_onyx_function_docs',
            description: 'Get detailed documentation for a specific Onyx function or method',
            inputSchema: {
              type: 'object',
              properties: {
                functionName: { type: 'string', description: 'Name of the function to look up' }
              },
              required: ['functionName']
            }
          },
          {
            name: 'browse_onyx_sections',
            description: 'Browse Onyx documentation by section or category',
            inputSchema: {
              type: 'object',
              properties: {
                section: { type: 'string', description: 'Section name (e.g., "getting started", "syntax", "stdlib")' }
              },
              required: ['section']
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          // Documentation tools
          case 'search_onyx_docs':
            return await this.searchOnyxDocs(args.query, args.limit);
          
          case 'crawl_onyx_docs':
            return await this.crawlOnyxDocs(args.force);

          // GitHub tools
          case 'search_github_examples':
            return await this.searchGitHubExamples(args.topic, args.limit);
          
          case 'get_onyx_functions':
            return await this.getOnyxFunctions(args.functionName, args.limit);
          
          case 'get_onyx_structs':
            return await this.getOnyxStructs(args.structName, args.limit);
          
          case 'crawl_github_repos':
            return await this.crawlGitHubRepos(args.repoLimit, args.force);
          
          case 'list_github_repos':
            return await this.listGitHubRepos(args.sortBy);

          // URL tools
          case 'crawl_url':
            return await this.crawlUrl(args.url, args.extractCode);

          // Unified search
          case 'search_all_sources':
            return await this.searchAllSources(args.query, args.sources, args.limit);

          // Legacy compatibility tools
          case 'get_onyx_examples':
            return await this.getOnyxExamples(args.topic, args.limit);
          
          case 'get_onyx_function_docs':
            return await this.getOnyxFunctionDocs(args.functionName);
          
          case 'browse_onyx_sections':
            return await this.browseOnyxSections(args.section);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`
          }]
        };
      }
    });
  }

  // Documentation methods
  async searchOnyxDocs(query, limit = 5) {
    const results = await this.searchEngine.searchDocs(query, limit);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(results, null, 2)
      }]
    };
  }

  async crawlOnyxDocs(force = false) {
    const crawler = new OnyxDocsCrawler({ force });
    await crawler.crawl();
    
    return {
      content: [{
        type: 'text',
        text: 'Successfully crawled Onyx documentation. Use search_onyx_docs to query the updated content.'
      }]
    };
  }

  // GitHub methods
  async searchGitHubExamples(topic, limit = 5) {
    const results = await this.searchEngine.searchGitHubExamples(topic, limit);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(results, null, 2)
      }]
    };
  }

  async getOnyxFunctions(functionName, limit = 10) {
    const results = await this.searchEngine.getOnyxFunctionExamples(functionName, limit);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(results, null, 2)
      }]
    };
  }

  async getOnyxStructs(structName, limit = 10) {
    const results = await this.searchEngine.getOnyxStructExamples(structName, limit);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(results, null, 2)
      }]
    };
  }

  async crawlGitHubRepos(repoLimit = 20, force = false) {
    const crawler = new GitHubOnyxCrawler({
      outputDir: path.join(this.dataDir, 'github'),
      debug: true
    });

    await crawler.crawlAllRepositories(repoLimit);

    return {
      content: [{
        type: 'text',
        text: `Successfully crawled ${repoLimit} GitHub repositories for Onyx code. Use search_github_examples to explore the examples.`
      }]
    };
  }

  async listGitHubRepos(sortBy = 'stars') {
    try {
      const reposPath = path.join(this.dataDir, 'github', 'repositories.json');
      let repos = JSON.parse(await fs.readFile(reposPath, 'utf8'));
      
      // Sort repositories
      switch (sortBy) {
        case 'stars':
          repos.sort((a, b) => b.stars - a.stars);
          break;
        case 'name':
          repos.sort((a, b) => a.name.localeCompare(b.name));
          break;
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalRepos: repos.length,
            sortedBy: sortBy,
            repositories: repos.map(repo => ({
              name: repo.fullName,
              description: repo.description,
              stars: repo.stars,
              url: repo.url
            }))
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Repository list not available. Run crawl_github_repos first. Error: ${error.message}`
        }]
      };
    }
  }

  // URL crawling methods
  async crawlUrl(url, extractCode = true) {
    const crawler = new URLCrawler({
      extractCode,
      outputDir: path.join(this.dataDir, 'urls'),
      debug: true
    });

    const result = await crawler.crawlSingle(url);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };
  }

  // Unified search
  async searchAllSources(query, sources = ['docs', 'github'], limit = 10) {
    const results = await this.searchEngine.searchAll(query, sources, limit);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(results, null, 2)
      }]
    };
  }

  // Legacy compatibility methods
  async getOnyxExamples(topic, limit = 3) {
    // Use GitHub examples as the primary source now
    const results = await this.searchGitHubExamples(topic, limit);
    return results;
  }

  async getOnyxFunctionDocs(functionName) {
    // Search both docs and GitHub
    const results = await this.searchAllSources(functionName, ['docs', 'github'], 5);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          functionName,
          searchResults: results
        }, null, 2)
      }]
    };
  }

  async browseOnyxSections(section) {
    // Use documentation search
    const results = await this.searchOnyxDocs(section, 10);
    return results;
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('Enhanced Onyx MCP Server running with GitHub and URL crawling capabilities...');
  }
}

// Start the server
const server = new EnhancedOnyxMCP();
server.start().catch(console.error);