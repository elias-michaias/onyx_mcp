// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { TOOL_DEFINITIONS, SharedMcpImplementation } from './core/mcp-shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function startMcpServer(devMode = false) {
  const server = new OnyxMcpServer();
  await server.start();
}

class OnyxMcpServer {
  constructor() {
    this.dataDir = path.join(__dirname, '../data');
    this.mcpImpl = new SharedMcpImplementation(this.dataDir);
    
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
        tools: TOOL_DEFINITIONS
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return await this.mcpImpl.executeTool(name, args);
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

export { OnyxMcpServer };
