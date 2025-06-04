import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class OnyxDocsMCP {
  constructor() {
    this.docs = [];
    this.server = new Server(
      { name: 'onyx-docs-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    
    this.setupHandlers();
  }

  async loadDocs() {
    try {
      const docsPath = path.join(__dirname, '../data/onyx-docs.json');
      const data = await fs.readFile(docsPath, 'utf-8');
      this.docs = JSON.parse(data);
      console.log(`Loaded ${this.docs.length} Onyx documentation pages`);
    } catch (error) {
      console.error('Failed to load docs:', error.message);
      console.log('Run "npm run crawl" first to generate documentation data');
    }
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_onyx_docs',
            description: 'Search Onyx documentation for specific topics, functions, or concepts',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query (keywords, function names, concepts)'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return',
                  default: 5
                }
              },
              required: ['query']
            }
          },
          {
            name: 'get_onyx_examples',
            description: 'Get code examples for specific Onyx features or functions',
            inputSchema: {
              type: 'object',
              properties: {
                topic: {
                  type: 'string',
                  description: 'Topic or feature to find examples for'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of examples to return',
                  default: 3
                }
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
                functionName: {
                  type: 'string',
                  description: 'Name of the function to look up'
                }
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
                section: {
                  type: 'string',
                  description: 'Section name (e.g., "getting started", "syntax", "stdlib")'
                }
              },
              required: ['section']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'search_onyx_docs':
          return await this.searchDocs(args.query, args.limit || 5);
        
        case 'get_onyx_examples':
          return await this.getExamples(args.topic, args.limit || 3);
        
        case 'get_onyx_function_docs':
          return await this.getFunctionDocs(args.functionName);
        
        case 'browse_onyx_sections':
          return await this.browseSections(args.section);
        
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  async searchDocs(query, limit) {
    const queryLower = query.toLowerCase();
    const results = [];

    for (const doc of this.docs) {
      let score = 0;
      const titleMatch = doc.title.toLowerCase().includes(queryLower);
      const contentMatch = doc.content.toLowerCase().includes(queryLower);
      
      if (titleMatch) score += 10;
      if (contentMatch) score += 1;
      
      // Check headings
      for (const heading of doc.headings) {
        if (heading.text.toLowerCase().includes(queryLower)) {
          score += 5;
        }
      }
      
      if (score > 0) {
        results.push({
          ...doc,
          score,
          snippet: this.getSnippet(doc.content, queryLower)
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            query,
            totalResults: results.length,
            results: results.slice(0, limit).map(r => ({
              title: r.title,
              url: r.url,
              snippet: r.snippet,
              headings: r.headings.map(h => h.text).slice(0, 3)
            }))
          }, null, 2)
        }
      ]
    };
  }

  async getExamples(topic, limit) {
    const topicLower = topic.toLowerCase();
    const examples = [];

    for (const doc of this.docs) {
      for (const example of doc.codeExamples) {
        const contextMatch = example.context.toLowerCase().includes(topicLower);
        const codeMatch = example.code.toLowerCase().includes(topicLower);
        
        if (contextMatch || codeMatch) {
          examples.push({
            code: example.code,
            context: example.context,
            source: doc.title,
            url: doc.url
          });
        }
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            topic,
            totalExamples: examples.length,
            examples: examples.slice(0, limit)
          }, null, 2)
        }
      ]
    };
  }

  async getFunctionDocs(functionName) {
    const funcLower = functionName.toLowerCase();
    const matches = [];

    for (const doc of this.docs) {
      // Look for function in title or headings
      if (doc.title.toLowerCase().includes(funcLower)) {
        matches.push(doc);
        continue;
      }
      
      for (const heading of doc.headings) {
        if (heading.text.toLowerCase().includes(funcLower)) {
          matches.push(doc);
          break;
        }
      }
      
      // Look for function in code examples
      for (const example of doc.codeExamples) {
        if (example.code.toLowerCase().includes(funcLower)) {
          matches.push(doc);
          break;
        }
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            functionName,
            matches: matches.slice(0, 3).map(doc => ({
              title: doc.title,
              url: doc.url,
              content: doc.content.substring(0, 800) + '...',
              codeExamples: doc.codeExamples.filter(ex => 
                ex.code.toLowerCase().includes(funcLower)
              ).slice(0, 2)
            }))
          }, null, 2)
        }
      ]
    };
  }

  async browseSections(section) {
    const sectionLower = section.toLowerCase();
    const sections = [];

    for (const doc of this.docs) {
      const urlMatch = doc.url.toLowerCase().includes(sectionLower);
      const titleMatch = doc.title.toLowerCase().includes(sectionLower);
      
      if (urlMatch || titleMatch) {
        sections.push({
          title: doc.title,
          url: doc.url,
          headings: doc.headings.map(h => h.text),
          summary: doc.content.substring(0, 300) + '...'
        });
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            section,
            totalSections: sections.length,
            sections: sections.slice(0, 10)
          }, null, 2)
        }
      ]
    };
  }

  getSnippet(content, query, contextLength = 150) {
    const index = content.toLowerCase().indexOf(query);
    if (index === -1) return content.substring(0, contextLength) + '...';
    
    const start = Math.max(0, index - contextLength / 2);
    const end = Math.min(content.length, index + query.length + contextLength / 2);
    
    return (start > 0 ? '...' : '') + 
           content.substring(start, end) + 
           (end < content.length ? '...' : '');
  }

  async start() {
    await this.loadDocs();
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('Onyx Docs MCP server running');
  }
}

// Start the server
const server = new OnyxDocsMCP();
server.start().catch(console.error);
