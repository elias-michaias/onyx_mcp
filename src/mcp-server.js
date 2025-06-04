// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { SearchEngine } from './core/search-engine.js';
import GitHubCrawler from './crawlers/github.js';
import { UrlCrawler } from './crawlers/urls.js';
import { DocumentationCrawler } from './crawlers/docs.js';

// =============================================================================
// CONFIGURABLE CONTEXT MESSAGE
// =============================================================================
// This message will be prepended to all MCP tool responses.
// Modify this section to customize the context provided to the assistant.
const GLOBAL_CONTEXT_MESSAGE = `You are assisting with Onyx programming language queries. Onyx is a modern systems programming language focused on simplicity and performance.

Key Onyx characteristics:
- Compiled systems language with manual memory management
- Strong type system with type inference
- Built-in support for data-oriented programming
- Compiles solely to WebAssembly (WASM) for portability

When providing code examples or explanations, focus on:
- Clear, idiomatic Onyx code
- Practical usage patterns
- Successful compilation
- Correct language syntax (check against the docs, core packages, or main onyx repo)
- That all functions and structs used are defined correctly or already exist in the Onyx standard library or core or external packages (check against the docs, core or external packages, or main onyx repo)

The following search results contain relevant information for the user's query:`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function startMcpServer(devMode = false) {
  const server = new OnyxMcpServer();
  await server.start();
}

class OnyxMcpServer {
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
          // Documentation search tools
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
            name: 'list_github_repos',
            description: 'List all discovered GitHub repositories with Onyx code',
            inputSchema: {
              type: 'object',
              properties: {
                sortBy: { type: 'string', enum: ['stars', 'name'], description: 'Sort repositories by', default: 'stars' }
              }
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

          // Code execution tools
          {
            name: 'run_onyx_code',
            description: 'Execute Onyx code and return the output/errors for testing and debugging',
            inputSchema: {
              type: 'object',
              properties: {
                code: { type: 'string', description: 'Onyx code to execute' },
                filename: { type: 'string', description: 'Optional filename (defaults to temp.onyx)', default: 'temp.onyx' },
                timeout: { type: 'number', description: 'Execution timeout in seconds', default: 10 }
              },
              required: ['code']
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

          // GitHub tools
          case 'search_github_examples':
            return await this.searchGitHubExamples(args.topic, args.limit);
          
          case 'get_onyx_functions':
            return await this.getOnyxFunctions(args.functionName, args.limit);
          
          case 'get_onyx_structs':
            return await this.getOnyxStructs(args.structName, args.limit);
          
          case 'list_github_repos':
            return await this.listGitHubRepos(args.sortBy);

          // Unified search
          case 'search_all_sources':
            return await this.searchAllSources(args.query, args.sources, args.limit);

          // Code execution
          case 'run_onyx_code':
            return await this.runOnyxCode(args.code, args.filename, args.timeout);

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
        return this.formatResponse(
          `Error: ${error.message}`,
          'An error occurred while processing your request'
        );
      }
    });
  }

  // Helper method to format responses with context
  formatResponse(content, toolSpecificMessage = '') {
    const fullMessage = GLOBAL_CONTEXT_MESSAGE + 
      (toolSpecificMessage ? '\n\n' + toolSpecificMessage : '') + 
      '\n\n' + content;
    
    return {
      content: [{
        type: 'text',
        text: fullMessage
      }]
    };
  }

  // Documentation methods
  async searchOnyxDocs(query, limit = 5) {
    const results = await this.searchEngine.searchDocs(query, limit);
    const toolMessage = `Searching official Onyx documentation for: "${query}"`;
    return this.formatResponse(JSON.stringify(results, null, 2), toolMessage);
  }

  // GitHub methods
  async searchGitHubExamples(topic, limit = 5) {
    const results = await this.searchEngine.searchGitHubExamples(topic, limit);
    const toolMessage = `Searching GitHub repositories for Onyx code examples related to: "${topic}"`;
    return this.formatResponse(JSON.stringify(results, null, 2), toolMessage);
  }

  async getOnyxFunctions(functionName, limit = 10) {
    const results = await this.searchEngine.getOnyxFunctionExamples(functionName, limit);
    const toolMessage = functionName ? 
      `Searching for Onyx function examples: "${functionName}"` :
      'Searching for all available Onyx function examples';
    return this.formatResponse(JSON.stringify(results, null, 2), toolMessage);
  }

  async getOnyxStructs(structName, limit = 10) {
    const results = await this.searchEngine.getOnyxStructExamples(structName, limit);
    const toolMessage = structName ? 
      `Searching for Onyx struct definitions: "${structName}"` :
      'Searching for all available Onyx struct definitions';
    return this.formatResponse(JSON.stringify(results, null, 2), toolMessage);
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

      const toolMessage = `Listing available GitHub repositories with Onyx code, sorted by ${sortBy}`;
      return this.formatResponse(JSON.stringify({
        totalRepos: repos.length,
        sortedBy: sortBy,
        repositories: repos.map(repo => ({
          name: repo.fullName,
          description: repo.description,
          stars: repo.stars,
          url: repo.url
        }))
      }, null, 2), toolMessage);
    } catch (error) {
      const toolMessage = 'Unable to list GitHub repositories - data may not be available yet';
      return this.formatResponse(
        `Repository list not available. Data may need to be populated first. Error: ${error.message}`,
        toolMessage
      );
    }
  }

  // Unified search
  async searchAllSources(query, sources = ['docs', 'github'], limit = 10) {
    const results = await this.searchEngine.searchAll(query, sources, limit);
    const toolMessage = `Searching across multiple sources (${sources.join(', ')}) for: "${query}"`;
    return this.formatResponse(JSON.stringify(results, null, 2), toolMessage);
  }

  // Code execution
  async runOnyxCode(code, filename = 'temp.onyx', timeout = 10) {
    const toolMessage = `Executing Onyx code to test and validate functionality`;
    
    try {
      // Create a temporary directory for code execution
      const tempDir = path.join(this.dataDir, 'temp');
      await fs.mkdir(tempDir, { recursive: true });
      
      // Write the code to a temporary file
      const filePath = path.join(tempDir, filename);
      await fs.writeFile(filePath, code, 'utf8');
      
      // Execute the Onyx code
      const result = await this.executeOnyxFile(filePath, timeout);
      
      // Clean up the temporary file
      try {
        await fs.unlink(filePath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      // Format the response with execution results
      const response = {
        success: result.success,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        executionTime: result.executionTime,
        filename: filename,
        codeLength: code.length
      };
      
      return this.formatResponse(JSON.stringify(response, null, 2), toolMessage);
      
    } catch (error) {
      const errorResponse = {
        success: false,
        error: error.message,
        filename: filename,
        codeLength: code.length
      };
      
      return this.formatResponse(JSON.stringify(errorResponse, null, 2), toolMessage);
    }
  }
  
  // Helper method to execute Onyx files
  async executeOnyxFile(filePath, timeoutSeconds = 10) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let finished = false;
      
      // Try to run with 'onyx run' first, fall back to 'onyx' if that fails
      const child = spawn('onyx', ['run', filePath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.dirname(filePath)
      });
      
      // Set up timeout
      const timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          child.kill('SIGTERM');
          resolve({
            success: false,
            exitCode: -1,
            stdout: stdout,
            stderr: stderr + '\n[TIMEOUT] Execution exceeded ' + timeoutSeconds + ' seconds',
            executionTime: Date.now() - startTime
          });
        }
      }, timeoutSeconds * 1000);
      
      // Collect stdout
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      // Collect stderr
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      // Handle process completion
      child.on('close', (code) => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          
          resolve({
            success: code === 0,
            exitCode: code,
            stdout: stdout,
            stderr: stderr,
            executionTime: Date.now() - startTime
          });
        }
      });
      
      // Handle process errors (e.g., 'onyx' command not found)
      child.on('error', (error) => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          
          resolve({
            success: false,
            exitCode: -1,
            stdout: stdout,
            stderr: `Error executing Onyx: ${error.message}\n\nNote: Make sure 'onyx' is installed and available in PATH.\nInstall from: https://onyxlang.io/install`,
            executionTime: Date.now() - startTime
          });
        }
      });
    });
  }

  // Legacy compatibility methods
  async getOnyxExamples(topic, limit = 3) {
    // Use GitHub examples as the primary source now
    const results = await this.searchEngine.searchGitHubExamples(topic, limit);
    const toolMessage = `Finding Onyx code examples for: "${topic}" (legacy compatibility method)`;
    return this.formatResponse(JSON.stringify(results, null, 2), toolMessage);
  }

  async getOnyxFunctionDocs(functionName) {
    // Search both docs and GitHub
    const results = await this.searchEngine.searchAll(functionName, ['docs', 'github'], 5);
    const toolMessage = `Looking up function documentation for: "${functionName}" (legacy compatibility method)`;
    return this.formatResponse(JSON.stringify({
      functionName,
      searchResults: results
    }, null, 2), toolMessage);
  }

  async browseOnyxSections(section) {
    // Use documentation search
    const results = await this.searchEngine.searchDocs(section, 10);
    const toolMessage = `Browsing Onyx documentation section: "${section}" (legacy compatibility method)`;
    return this.formatResponse(JSON.stringify(results, null, 2), toolMessage);
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
