#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import MCP server functionality
import { SearchEngine } from './core/search-engine.js';
import { crawlDocumentation } from './crawlers/docs.js';
import { crawlGitHub } from './crawlers/github.js';
import { crawlUrl } from './crawlers/urls.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class OnyxMcpHttpServer {
  constructor(port = 3001) {
    this.port = port;
    this.app = express();
    this.dataDir = path.join(__dirname, '../data');
    this.searchEngine = new SearchEngine(this.dataDir);
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // Enable CORS for all origins
    this.app.use(cors());
    
    // Parse JSON bodies
    this.app.use(express.json({ limit: '10mb' }));
    
    // Parse URL-encoded bodies
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        server: 'onyx-mcp-http',
        version: '2.0.0'
      });
    });

    // List all available tools
    this.app.get('/tools', (req, res) => {
      res.json({
        tools: [
          // Documentation tools
          {
            name: 'search_onyx_docs',
            description: 'Search official Onyx programming language documentation',
            method: 'POST',
            endpoint: '/tools/search_onyx_docs',
            parameters: {
              query: { type: 'string', required: true, description: 'Search query for documentation' },
              limit: { type: 'number', default: 5, description: 'Maximum number of results' }
            }
          },


          // GitHub repository tools
          {
            name: 'search_github_examples',
            description: 'Search Onyx code examples from GitHub repositories by topic',
            method: 'POST',
            endpoint: '/tools/search_github_examples',
            parameters: {
              topic: { type: 'string', required: true, description: 'Topic to search for' },
              limit: { type: 'number', default: 5, description: 'Maximum number of examples' }
            }
          },
          {
            name: 'get_onyx_functions',
            description: 'Get Onyx function definitions and examples from GitHub',
            method: 'POST',
            endpoint: '/tools/get_onyx_functions',
            parameters: {
              functionName: { type: 'string', description: 'Function name to search for (optional)' },
              limit: { type: 'number', default: 10, description: 'Maximum number of examples' }
            }
          },
          {
            name: 'get_onyx_structs',
            description: 'Get Onyx struct definitions and examples from GitHub',
            method: 'POST',
            endpoint: '/tools/get_onyx_structs',
            parameters: {
              structName: { type: 'string', description: 'Struct name to search for (optional)' },
              limit: { type: 'number', default: 10, description: 'Maximum number of examples' }
            }
          },

          {
            name: 'list_github_repos',
            description: 'List all discovered GitHub repositories with Onyx code',
            method: 'GET',
            endpoint: '/tools/list_github_repos',
            parameters: {
              sortBy: { type: 'string', enum: ['stars', 'name'], default: 'stars', description: 'Sort repositories by' }
            }
          },



          // Unified search tools
          {
            name: 'search_all_sources',
            description: 'Search all crawled content (docs, GitHub, URLs)',
            method: 'POST',
            endpoint: '/tools/search_all_sources',
            parameters: {
              query: { type: 'string', required: true, description: 'Search query' },
              sources: { type: 'array', default: ['docs', 'github'], description: 'Sources to search in' },
              limit: { type: 'number', default: 10, description: 'Maximum number of results' }
            }
          }
        ]
      });
    });

    // Documentation endpoints
    this.app.post('/tools/search_onyx_docs', async (req, res) => {
      try {
        const { query, limit = 5 } = req.body;
        if (!query) {
          return res.status(400).json({ error: 'query parameter is required' });
        }
        
        const results = await this.searchEngine.searchDocs(query, limit);
        res.json(results);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });



    // GitHub endpoints
    this.app.post('/tools/search_github_examples', async (req, res) => {
      try {
        const { topic, limit = 5 } = req.body;
        if (!topic) {
          return res.status(400).json({ error: 'topic parameter is required' });
        }
        
        const results = await this.searchEngine.searchGitHubExamples(topic, limit);
        res.json(results);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/tools/get_onyx_functions', async (req, res) => {
      try {
        const { functionName, limit = 10 } = req.body;
        const results = await this.searchEngine.getOnyxFunctionExamples(functionName, limit);
        res.json(results);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/tools/get_onyx_structs', async (req, res) => {
      try {
        const { structName, limit = 10 } = req.body;
        const results = await this.searchEngine.getOnyxStructExamples(structName, limit);
        res.json(results);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });



    this.app.get('/tools/list_github_repos', async (req, res) => {
      try {
        const { sortBy = 'stars' } = req.query;
        
        try {
          const fs = await import('fs/promises');
          const reposPath = path.join(this.dataDir, 'github', 'repositories.json');
          let repos = JSON.parse(await fs.readFile(reposPath, 'utf8'));
          
          // Sort repositories
          switch (sortBy) {
            case 'stars':
              repos.sort((a, b) => (b.stars || 0) - (a.stars || 0));
              break;
            case 'name':
              repos.sort((a, b) => a.name.localeCompare(b.name));
              break;
          }

          res.json({
            totalRepos: repos.length,
            sortedBy: sortBy,
            repositories: repos.map(repo => ({
              name: repo.fullName,
              description: repo.description,
              stars: repo.stars,
              url: repo.url
            }))
          });
        } catch (error) {
          res.status(404).json({
            error: 'Repository list not available. Data may need to be populated first.',
            details: error.message
          });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });



    // Unified search endpoints
    this.app.post('/tools/search_all_sources', async (req, res) => {
      try {
        const { query, sources = ['docs', 'github'], limit = 10 } = req.body;
        if (!query) {
          return res.status(400).json({ error: 'query parameter is required' });
        }
        
        const results = await this.searchEngine.searchAll(query, sources, limit);
        res.json(results);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Legacy compatibility endpoints
    this.app.post('/tools/get_onyx_examples', async (req, res) => {
      try {
        const { topic, limit = 3 } = req.body;
        if (!topic) {
          return res.status(400).json({ error: 'topic parameter is required' });
        }
        
        const results = await this.searchEngine.searchGitHubExamples(topic, limit);
        res.json(results);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/tools/get_onyx_function_docs', async (req, res) => {
      try {
        const { functionName } = req.body;
        if (!functionName) {
          return res.status(400).json({ error: 'functionName parameter is required' });
        }
        
        const results = await this.searchEngine.searchAll(functionName, ['docs', 'github'], 5);
        res.json({
          functionName,
          searchResults: results
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/tools/browse_onyx_sections', async (req, res) => {
      try {
        const { section } = req.body;
        if (!section) {
          return res.status(400).json({ error: 'section parameter is required' });
        }
        
        const results = await this.searchEngine.searchDocs(section, 10);
        res.json(results);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Error handling middleware
    this.app.use((error, req, res, next) => {
      console.error('Server error:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: error.message 
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ 
        error: 'Endpoint not found',
        availableEndpoints: [
          'GET /health',
          'GET /tools',
          'POST /tools/search_onyx_docs',

          'POST /tools/search_github_examples',
          'POST /tools/get_onyx_functions',
          'POST /tools/get_onyx_structs',

          'GET /tools/list_github_repos',

          'POST /tools/search_all_sources'
        ]
      });
    });
  }

  start() {
    return new Promise((resolve, reject) => {
      const server = this.app.listen(this.port, (error) => {
        if (error) {
          reject(error);
        } else {
          console.log(`🌐 Onyx MCP HTTP Server running on port ${this.port}`);
          console.log(`📋 API Documentation: http://localhost:${this.port}/tools`);
          console.log(`❤️  Health Check: http://localhost:${this.port}/health`);
          resolve(server);
        }
      });

      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`❌ Port ${this.port} is already in use`);
          console.error(`💡 Try using a different port: PORT=3002 npm run http`);
        } else {
          console.error('❌ Server error:', error.message);
        }
        reject(error);
      });
    });
  }
}

// Export for use as module
export { OnyxMcpHttpServer };

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT || 3001;
  const server = new OnyxMcpHttpServer(port);
  
  server.start().catch((error) => {
    console.error('Failed to start HTTP server:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down HTTP server...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down HTTP server...');
    process.exit(0);
  });
}
