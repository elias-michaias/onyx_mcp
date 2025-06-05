import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { SearchEngine } from './search-engine.js';

// =============================================================================
// CONFIGURABLE CONTEXT MESSAGE
// =============================================================================
// This message will be prepended to all MCP tool responses.
// Modify this section to customize the context provided to the assistant.
export const GLOBAL_CONTEXT_MESSAGE = `
You are assisting with Onyx programming language queries. 
Onyx is a modern systems programming language focused on simplicity and performance.

Key Onyx characteristics:
- Compiled systems language with manual memory management
- Supports allocators, defer, and free for memory management
- Compiles solely to WebAssembly (WASM)
- Strong type system with type inference
- Built-in support for data-oriented programming
- Supports functional programming features like pipe operators and one-line functions
- Focuses on procedural programming as opposed to object-oriented paradigms

When providing code examples or explanations, focus on:
- Clear, idiomatic Onyx code
- Practical usage patterns
- Performance considerations where relevant
- Correct code that compiles and runs without errors
- Checking your code against Onyx documentation and examples
- Not making up features, functions, or syntax that do not exist in Onyx

This is a description of the specific MCP tool you are using:
`;

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================
// Central definition of all MCP tools with their schemas
export const TOOL_DEFINITIONS = [
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
        topic: { type: 'string', description: 'Topic to search for' },
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
  {
    name: 'run_wasm',
    description: 'Execute a WebAssembly (WASM) file using "onyx run file.wasm" command',
    inputSchema: {
      type: 'object',
      properties: {
        wasmPath: { type: 'string', description: 'Path to the WASM file to execute' },
        directory: { type: 'string', description: 'Directory to run the command from (defaults to current working directory)', default: '.' },
        timeout: { type: 'number', description: 'Execution timeout in seconds', default: 10 }
      },
      required: ['wasmPath']
    }
  },
  {
    name: 'build_onyx_code',
    description: 'Build Onyx code file using "onyx build" in a specified directory',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Onyx code to build' },
        filename: { type: 'string', description: 'Filename for the Onyx file', default: 'main.onyx' },
        directory: { type: 'string', description: 'Directory to build in (defaults to current working directory)', default: '.' },
        timeout: { type: 'number', description: 'Build timeout in seconds', default: 30 }
      },
      required: ['code']
    }
  },
  {
    name: 'onyx_pkg_build',
    description: 'Build an Onyx package using "onyx pkg build" in a specified directory',
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Directory containing the Onyx package (defaults to current working directory)', default: '.' },
        timeout: { type: 'number', description: 'Build timeout in seconds', default: 60 }
      }
    }
  },
];

// =============================================================================
// SHARED MCP IMPLEMENTATION
// =============================================================================
export class SharedMcpImplementation {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.searchEngine = new SearchEngine(this.dataDir);
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
  async runWasm(wasmPath, directory = '.', timeout = 10) {
    const toolMessage = `Executing WebAssembly file: ${wasmPath} using "onyx run" command`;
    
    try {
      // Resolve the target directory and WASM file path
      const targetDir = path.resolve(directory);
      let fullWasmPath;
      
      // If wasmPath is absolute, use it directly; otherwise, resolve relative to target directory
      if (path.isAbsolute(wasmPath)) {
        fullWasmPath = wasmPath;
      } else {
        fullWasmPath = path.resolve(targetDir, wasmPath);
      }
      
      // Check if directory exists
      try {
        await fs.access(targetDir);
      } catch (error) {
        throw new Error(`Directory does not exist: ${targetDir}`);
      }
      
      // Check if WASM file exists
      try {
        await fs.access(fullWasmPath);
      } catch (error) {
        throw new Error(`WASM file does not exist: ${fullWasmPath}`);
      }
      
      // Execute the WASM file using onyx run
      const result = await this.executeOnyxCommand(['run', fullWasmPath], timeout, targetDir);
      
      // Format the response with execution results
      const response = {
        success: result.success,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        executionTime: result.executionTime,
        command: `onyx run ${fullWasmPath}`,
        wasmPath: fullWasmPath,
        workingDirectory: targetDir
      };
      
      return this.formatResponse(JSON.stringify(response, null, 2), toolMessage);
      
    } catch (error) {
      const errorResponse = {
        success: false,
        error: error.message,
        command: `onyx run ${wasmPath}`,
        wasmPath: wasmPath,
        workingDirectory: directory
      };
      
      return this.formatResponse(JSON.stringify(errorResponse, null, 2), toolMessage);
    }
  }
  
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
  
  // Build Onyx code in specified directory
  async buildOnyxCode(code, filename = 'main.onyx', directory = '.', timeout = 30) {
    const toolMessage = `Building Onyx code using "onyx build" in directory: ${directory}`;
    
    try {
      // Resolve the target directory
      const targetDir = path.resolve(directory);
      
      // Check if directory exists
      try {
        await fs.access(targetDir);
      } catch (error) {
        throw new Error(`Directory does not exist: ${targetDir}`);
      }
      
      // Write the code to the specified file in target directory
      const filePath = path.join(targetDir, filename);
      await fs.writeFile(filePath, code, 'utf8');
      
      // Build the Onyx code in target directory
      const result = await this.executeOnyxCommand(['build', filename], timeout, targetDir);
      
      // Format the response with build results
      const response = {
        success: result.success,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        executionTime: result.executionTime,
        command: `onyx build ${filename}`,
        filename: filename,
        codeLength: code.length,
        workingDirectory: targetDir
      };
      
      return this.formatResponse(JSON.stringify(response, null, 2), toolMessage);
      
    } catch (error) {
      const errorResponse = {
        success: false,
        error: error.message,
        command: `onyx build ${filename}`,
        filename: filename,
        codeLength: code.length,
        workingDirectory: directory
      };
      
      return this.formatResponse(JSON.stringify(errorResponse, null, 2), toolMessage);
    }
  }
  
  // Build Onyx package in specified directory
  async onyxPkgBuild(directory = '.', timeout = 60) {
    const toolMessage = `Building Onyx package using "onyx pkg build" in directory: ${directory}`;
    
    try {
      // Resolve the target directory
      const targetDir = path.resolve(directory);
      
      // Check if directory exists
      try {
        await fs.access(targetDir);
      } catch (error) {
        throw new Error(`Directory does not exist: ${targetDir}`);
      }
      
      // Build the Onyx package in target directory
      const result = await this.executeOnyxCommand(['pkg', 'build'], timeout, targetDir);
      
      // Format the response with build results
      const response = {
        success: result.success,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        executionTime: result.executionTime,
        command: 'onyx pkg build',
        workingDirectory: targetDir
      };
      
      return this.formatResponse(JSON.stringify(response, null, 2), toolMessage);
      
    } catch (error) {
      const errorResponse = {
        success: false,
        error: error.message,
        command: 'onyx pkg build',
        workingDirectory: directory
      };
      
      return this.formatResponse(JSON.stringify(errorResponse, null, 2), toolMessage);
    }
  }
  
  // Helper method to execute Onyx files (for run_onyx_code)
  async executeOnyxFile(filePath, timeoutSeconds = 10) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let finished = false;
      
      // Try to run with 'onyx run' first
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
  
  // Helper method to execute Onyx commands (for build operations)
  async executeOnyxCommand(args, timeoutSeconds = 30, workingDirectory = null) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let finished = false;
      
      // Use specified directory or current working directory
      const cwd = workingDirectory || process.cwd();
      
      // Execute onyx command in specified directory
      const child = spawn('onyx', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: cwd
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
            stderr: stderr + '\n[TIMEOUT] Build/command exceeded ' + timeoutSeconds + ' seconds',
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

  // Tool execution dispatcher
  async executeTool(name, args) {
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
        
        case 'run_wasm':
          return await this.runWasm(args.wasmPath, args.directory, args.timeout);
        
        case 'build_onyx_code':
          return await this.buildOnyxCode(args.code, args.filename, args.directory, args.timeout);
        
        case 'onyx_pkg_build':
          return await this.onyxPkgBuild(args.directory, args.timeout);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return this.formatResponse(
        `Error: ${error.message}`,
        'An error occurred while processing your request'
      );
    }
  }

  // For HTTP responses (without MCP formatting)
  async executeToolForHttp(name, args) {
    try {
      const mcpResult = await this.executeTool(name, args);
      // Extract the JSON content from the MCP formatted response
      const content = mcpResult.content[0].text;
      const lines = content.split('\n\n');
      // The last part should be the JSON data
      const jsonPart = lines[lines.length - 1];
      try {
        return JSON.parse(jsonPart);
      } catch {
        // If parsing fails, return the raw content
        return { result: jsonPart };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
