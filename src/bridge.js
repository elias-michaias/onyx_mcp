#!/usr/bin/env node

/**
 * MCP-to-HTTP Bridge
 * 
 * This bridge server accepts MCP requests via stdio (from Claude Desktop)
 * and forwards them to the Onyx MCP HTTP server, then returns the responses.
 * 
 * Usage:
 * 1. Start the HTTP server: npm run http
 * 2. Run this bridge: npm run bridge
 * 3. Configure Claude Desktop to use this bridge instead of the direct MCP server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Use fetch instead of axios for simpler dependencies

class McpHttpBridge {
  constructor(httpServerUrl = 'http://localhost:3001') {
    this.httpServerUrl = httpServerUrl;
    this.server = new Server(
      { name: 'onyx-mcp-bridge', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    
    this.setupHandlers();
  }

  async fetchJson(url, options = {}) {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  }

  setupHandlers() {
    // List tools by fetching from HTTP server
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        const response = await this.fetchJson(`${this.httpServerUrl}/tools`);
        
        // Convert HTTP API format to MCP format
        const mcpTools = response.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: {
            type: 'object',
            properties: this.convertParametersToJsonSchema(tool.parameters),
            required: this.getRequiredParameters(tool.parameters)
          }
        }));

        return { tools: mcpTools };
      } catch (error) {
        console.error('Failed to fetch tools from HTTP server:', error.message);
        return { tools: [] };
      }
    });

    // Handle tool calls by forwarding to HTTP server
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Map tool names to HTTP endpoints
        const endpoint = this.getHttpEndpoint(name);
        const method = this.getHttpMethod(name);
        const url = `${this.httpServerUrl}${endpoint}`;
        
        let response;
        if (method === 'GET') {
          const params = new URLSearchParams(args).toString();
          const fullUrl = params ? `${url}?${params}` : url;
          response = await this.fetchJson(fullUrl);
        } else {
          response = await this.fetchJson(url, {
            method: 'POST',
            body: JSON.stringify(args)
          });
        }

        // Convert HTTP response to MCP format
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }]
        };
      } catch (error) {
        console.error(`Tool ${name} failed:`, error.message);
        
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`
          }]
        };
      }
    });
  }

  convertParametersToJsonSchema(parameters) {
    const properties = {};
    
    for (const [key, param] of Object.entries(parameters)) {
      properties[key] = {
        type: param.type,
        description: param.description
      };
      
      if (param.default !== undefined) {
        properties[key].default = param.default;
      }
      
      if (param.enum) {
        properties[key].enum = param.enum;
      }
    }
    
    return properties;
  }

  getRequiredParameters(parameters) {
    return Object.entries(parameters)
      .filter(([key, param]) => param.required)
      .map(([key]) => key);
  }

  getHttpEndpoint(toolName) {
    // Map MCP tool names to HTTP endpoints
    const endpointMap = {
      'search_onyx_docs': '/tools/search_onyx_docs',
      'crawl_onyx_docs': '/tools/crawl_onyx_docs',
      'search_github_examples': '/tools/search_github_examples',
      'get_onyx_functions': '/tools/get_onyx_functions',
      'get_onyx_structs': '/tools/get_onyx_structs',
      'crawl_github_repos': '/tools/crawl_github_repos',
      'list_github_repos': '/tools/list_github_repos',
      'crawl_url': '/tools/crawl_url',
      'search_all_sources': '/tools/search_all_sources',
      'get_onyx_examples': '/tools/get_onyx_examples',
      'get_onyx_function_docs': '/tools/get_onyx_function_docs',
      'browse_onyx_sections': '/tools/browse_onyx_sections'
    };

    return endpointMap[toolName] || `/tools/${toolName}`;
  }

  getHttpMethod(toolName) {
    // Most tools use POST, except list operations
    const getMethods = ['list_github_repos'];
    return getMethods.includes(toolName) ? 'GET' : 'POST';
  }

  async start() {
    try {
      // Test connection to HTTP server
      await this.fetchJson(`${this.httpServerUrl}/health`);
    } catch (error) {
      console.error('❌ Failed to connect to HTTP server at', this.httpServerUrl);
      console.error('💡 Make sure to start the HTTP server first: npm run http');
      process.exit(1);
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

// Export for use as module
export default async function startBridge() {
  const httpServerUrl = process.env.HTTP_SERVER_URL || 'http://localhost:3001';
  const bridge = new McpHttpBridge(httpServerUrl);
  
  await bridge.start();
}

// Start the bridge if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Parse command line arguments for npx usage
  const args = process.argv.slice(2);
  let httpServerUrl = 'https://mcp.onyxlang.io'; // Default to hosted server for npx
  
  // Look for --url argument
  const urlIndex = args.indexOf('--url');
  if (urlIndex !== -1 && args[urlIndex + 1]) {
    httpServerUrl = args[urlIndex + 1];
  }
  
  // Look for -u argument
  const uIndex = args.indexOf('-u');
  if (uIndex !== -1 && args[uIndex + 1]) {
    httpServerUrl = args[uIndex + 1];
  }
  
  // Use environment variable if set
  if (process.env.HTTP_SERVER_URL) {
    httpServerUrl = process.env.HTTP_SERVER_URL;
  }
  
  console.log(`🌉 Starting Onyx MCP Bridge...`);
  console.log(`🔗 Connecting to: ${httpServerUrl}`);
  console.log(`💡 Usage: Configure Claude Desktop to use this bridge process`);
  console.log(``);
  
  const bridge = new McpHttpBridge(httpServerUrl);

  bridge.start().catch((error) => {
    console.error('Failed to start bridge:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.error('\n🛑 Shutting down bridge...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.error('\n🛑 Shutting down bridge...');
    process.exit(0);
  });
}
