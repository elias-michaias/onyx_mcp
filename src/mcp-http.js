#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import shared MCP functionality
import { TOOL_DEFINITIONS, SharedMcpImplementation } from './core/mcp-shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class OnyxMcpHttpServer {
  constructor(port = 3001) {
    this.port = port;
    this.app = express();
    this.dataDir = path.join(__dirname, '../data');
    this.mcpImpl = new SharedMcpImplementation(this.dataDir);

    this.setupMiddleware();
    this.setupRoutes();
  }

  // Helper method to convert tool definitions to HTTP API format
  convertToolToHttpFormat(tool) {
    const httpTool = {
      name: tool.name,
      description: tool.description,
      method: 'POST',
      endpoint: `/tools/${tool.name}`,
      parameters: {}
    };

    // Convert input schema to HTTP parameter format
    if (tool.inputSchema && tool.inputSchema.properties) {
      for (const [key, prop] of Object.entries(tool.inputSchema.properties)) {
        httpTool.parameters[key] = {
          type: prop.type,
          description: prop.description,
          required: tool.inputSchema.required?.includes(key) || false
        };
        
        if (prop.default !== undefined) {
          httpTool.parameters[key].default = prop.default;
        }
        
        if (prop.enum) {
          httpTool.parameters[key].enum = prop.enum;
        }
      }
    }

    return httpTool;
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
      const httpTools = TOOL_DEFINITIONS.map(tool => {
        const httpTool = this.convertToolToHttpFormat(tool);
        
        // Special handling for list_github_repos which uses GET
        if (tool.name === 'list_github_repos') {
          httpTool.method = 'GET';
        }
        
        return httpTool;
      });
      
      res.json({
        totalTools: httpTools.length,
        tools: httpTools
      });
    });

    // Generic tool execution endpoint using shared implementation
    const createToolEndpoint = (toolName, method = 'POST') => {
      const handler = async (req, res) => {
        try {
          const args = method === 'GET' ? req.query : req.body;
          
          // Validate required parameters based on tool definition
          const toolDef = TOOL_DEFINITIONS.find(t => t.name === toolName);
          if (toolDef && toolDef.inputSchema && toolDef.inputSchema.required) {
            for (const required of toolDef.inputSchema.required) {
              if (!args[required]) {
                return res.status(400).json({ 
                  error: `${required} parameter is required` 
                });
              }
            }
          }
          
          const result = await this.mcpImpl.executeToolForHttp(toolName, args);
          res.json(result);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      };
      
      if (method === 'GET') {
        this.app.get(`/tools/${toolName}`, handler);
      } else {
        this.app.post(`/tools/${toolName}`, handler);
      }
    };
    
    // Create endpoints for all tools dynamically
    TOOL_DEFINITIONS.forEach(tool => {
      // Special handling for list_github_repos which uses GET
      const method = tool.name === 'list_github_repos' ? 'GET' : 'POST';
      createToolEndpoint(tool.name, method);
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
      const availableEndpoints = [
        'GET /health',
        'GET /tools',
        ...TOOL_DEFINITIONS.map(tool => {
          const method = tool.name === 'list_github_repos' ? 'GET' : 'POST';
          return `${method} /tools/${tool.name}`;
        })
      ];
      
      res.status(404).json({
        error: 'Endpoint not found',
        availableEndpoints
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
