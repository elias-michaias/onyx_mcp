# Onyx MCP Server

A Model Context Protocol (MCP) server providing search and query access to Onyx programming language documentation and GitHub code examples. The server includes comprehensive crawling capabilities to populate data, but crawling is NOT accessible through the MCP interface - ensuring clean separation between data collection and query functionality.

## 🚀 Quick Start

### ⚡ Instant Access with NPX (No Installation Required!)

**Configure Claude Desktop (or other MCP-compatible LLM):**
```json
{
  "mcpServers": {
    "onyx": {
      "command": "npx",
      "args": ["@onyxlang/mcp-server", "bridge", "--url", "https://mcp.onyxlang.io"]
    }
  }
}
```

🎆 **That's it!** No installation, no setup, no data crawling needed. You get instant access to the latest Onyx documentation and examples.

### Installation

#### Option 1: Install from npm (Recommended)
```bash
# Install globally
npm install -g @onyxlang/mcp-server

# Or install locally in your project
npm install @onyxlang/mcp-server
```

#### Option 2: Install from source
```bash
git clone https://github.com/onyx-lang/onyx-mcp-server.git
cd onyx-mcp-server
npm install
cp .env.example .env
# Edit .env and add your GitHub token (optional but recommended)
```

### Usage

#### If installed globally:
```bash
# Start MCP server
onyx-mcp server

# Start HTTP server
onyx-mcp http

# Start bridge to hosted server
onyx-mcp bridge --url https://mcp.onyxlang.io

# Crawl data (if running locally)
onyx-mcp crawl all
```

#### If installed locally or from source:
```bash
# Use npm scripts with arguments
npm start              # MCP server
npm run http           # HTTP server on default port (3001)
npm run http -- --port 3002  # HTTP server on custom port
npm run bridge         # Bridge to default (localhost:3001)
npm run bridge -- --url https://mcp.onyxlang.io  # Bridge to hosted server
npm run crawl:all      # Crawl all data

# Or run directly
node src/index.js server
node src/index.js http --port 3002
node src/index.js bridge --url https://mcp.onyxlang.io
```

### Basic Usage

```bash
# Start the MCP server (default)
npm start

# Start the HTTP server for REST API access
npm run http
npm run http -- --port 3002  # Custom port

# Start the MCP-to-HTTP bridge (connects to local or remote HTTP server)
npm run bridge
npm run bridge -- --url https://mcp.onyxlang.io  # Connect to hosted server

# Run with development mode
npm run dev        # MCP server
npm run http:dev   # HTTP server

# Run tests
npm test

# Crawl data to populate the MCP (CLI only, not through MCP interface)
npm run crawl:all
```

## 🎯 Server Interface

The system provides both MCP query functionality and CLI-based crawling:

```bash
# MCP Server operations (query/search only)
node src/index.js server          # Start MCP server  
node src/index.js server --dev    # Development mode
node src/index.js http            # Start HTTP server
node src/index.js http --port 3002 # HTTP server on custom port
node src/index.js bridge          # Start MCP-to-HTTP bridge
node src/index.js bridge --url https://mcp.onyxlang.io # Connect to hosted server

# Using npm scripts (with argument passing)
npm start                         # MCP server
npm run http                      # HTTP server (port 3001)
npm run http -- --port 3002       # HTTP server on custom port
npm run bridge                    # Bridge to localhost:3001
npm run bridge -- --url https://mcp.onyxlang.io  # Bridge to hosted server

# Data crawling (CLI only - NOT accessible through MCP)
node src/index.js crawl docs                    # Documentation only
node src/index.js crawl github repo1 repo2     # Specific repositories  
node src/index.js crawl url https://...        # Single URL
node src/index.js crawl all                     # Everything

# Utilities
node src/index.js test       # Run test suite
node src/index.js validate  # Validate setup
```

## 📁 Project Structure

```
onyx_mcp/
├── src/
│   ├── bridge.js          # 🌉 MCP-to-HTTP bridge for remote access
│   ├── index.js           # 🎯 Unified entry point
│   ├── mcp-server.js      # 🌐 MCP server implementation
│   ├── mcp-http.js        # 🌐 MCP over HTTP server implementation 
│   ├── test.js            # 🧪 Test suite
│   ├── validate.js        # ✅ Setup validation
│   ├── crawlers/          # 📡 Data crawlers
│   │   ├── docs.js        #   - Documentation crawler
│   │   ├── github.js      #   - GitHub repository crawler  
│   │   └── urls.js        #   - URL content crawler
│   └── core/              # 🔧 Core functionality
│       └── search-engine.js #   - Search and indexing
├── data/                  # 📊 Crawled data (auto-generated)
├── .env.example          # 🔐 Environment template
└── package.json          # 📦 Dependencies & scripts
```

## 🛠️ MCP Tools Available

The server provides these **read-only** search and query tools to Claude:

### 📚 Documentation
- `search_onyx_docs` - Search official documentation
- `browse_onyx_sections` - Browse by section
- `get_onyx_function_docs` - Function documentation

### 🐙 GitHub Integration  
- `search_github_examples` - Search code by topic
- `get_onyx_functions` - Function definitions from GitHub
- `get_onyx_structs` - Struct definitions from GitHub
- `list_github_repos` - List available repositories

### 🔍 Unified Search
- `search_all_sources` - Search across all data sources
- `get_onyx_examples` - Legacy compatibility for examples

### 🚀 Code Execution
- `run_onyx_code` - Execute Onyx code and return output/errors for testing and debugging

### ⚠️ Important Note
Crawling tools are available through the CLI but **intentionally NOT accessible** through the MCP interface. This ensures clean separation between data collection and query functionality.

## 🔧 Configuration

### Environment Variables (.env)

```bash
# GitHub token (recommended for higher rate limits)
GITHUB_TOKEN=your_github_token_here

# Optional settings
DEBUG=false
MAX_CRAWL_LIMIT=50
```

## 🌐 Claude Desktop Integration

You can connect to the Onyx MCP in multiple ways:

### ⚡ Option 1: NPX Bridge (Zero Installation)

**For hosted server (always up-to-date):**
```json
{
  "mcpServers": {
    "onyx": {
      "command": "npx",
      "args": ["@onyxlang/mcp-server", "bridge", "--url", "https://mcp.onyxlang.io"]
    }
  }
}
```

### Option 2: Local MCP Server (For Development)
```json
{
 "mcpServers": {
   "onyx": {
     "command": "node",
     "args": ["/path/to/onyx_mcp/src/index.js", "server"]
   }
 }
}
```

### Option 3: Connect to Custom Hosted Server via Bridge
```json
{
 "mcpServers": {
   "onyx": {
     "command": "node",
     "args": ["/path/to/onyx_mcp/src/index.js", "bridge", "--url", "https://mcp.onyxlang.io"],
   }
 }
}
```

### Option 4: Local HTTP Server + Bridge
For testing the bridge locally:

1. **Start the HTTP server:**
   ```bash
   npm run http --port 3002
   ```
2. **Configure Claude Desktop** to use the bridge:
   ```json
   {
     "mcpServers": {
       "onyx": {
         "command": "node",
         "args": ["/path/to/onyx_mcp/src/index.js", "bridge", "--url", "http://localhost:3002"]
       }
     }
   }
   ```

### For Development (Local Setup)
1. **Clone and setup:**
   ```bash
   git clone <repository>
   cd onyx_mcp
   npm install
   cp .env.example .env
   ```

2. **Populate data:**
   ```bash
   npm run crawl:all
   ```

3. **Start MCP server:**
   ```bash
   npm start
   ```

4. **Configure Claude Desktop** with local server (see integration section above)

### For Production (Hosted Server)
1. **Clone and setup:**
   ```bash
   git clone <repository>
   cd onyx_mcp
   npm install
   ```

2. **Start HTTP server:**
   ```bash
   npm run http 
   ```

3. **Configure Claude Desktop** with bridge (see integration section above)

### Bridge Architecture

The bridge allows you to connect the MCP protocol to HTTP servers:

```
Claude Desktop → MCP Bridge → HTTP Server (Local or Remote)
```

Benefits:
- ✅ Connect to hosted Onyx MCP at `mcp.onyxlang.io` 
- ✅ No need to run local server or populate data
- ✅ Always up-to-date with latest Onyx information
- ✅ Same MCP interface, different backend
- ✅ Easy switching between local and remote servers

## 🔄 Code Testing & Feedback Loop

The `run_onyx_code` tool enables Claude to test and refine Onyx code through an iterative feedback loop:

### How it Works:
1. **Claude writes Onyx code** based on your requirements
2. **Executes the code** using `run_onyx_code` tool
3. **Reads compilation/runtime errors** from the output
4. **Analyzes the errors** and adjusts the code
5. **Repeats the process** until the code works correctly

### Example Workflow:
```
User: "Write a function to calculate fibonacci numbers"

1. Claude writes initial code
2. Tests with run_onyx_code
3. Sees compilation error about syntax
4. Fixes syntax and tests again
5. Sees runtime error about logic
6. Fixes logic and tests again
7. Code now runs successfully!
```

### Benefits:
- ✅ **Self-correcting code** - Claude can fix its own mistakes
- ✅ **Real validation** - Actually runs the code, not just syntax checking
- ✅ **Learning from errors** - Improves suggestions based on Onyx compiler feedback
- ✅ **Iterative refinement** - Keeps improving until code works perfectly
- ✅ **Confidence in results** - You know the code actually compiles and runs

### Requirements:
- **Onyx compiler** must be installed and available in PATH
- Install from: https://onyxlang.io/
- The tool executes code in a sandboxed temporary directory
- Default timeout of 10 seconds (configurable) prevents infinite loops

## 📊 Data Sources & Crawling

The system includes comprehensive crawling capabilities to populate data:

### 📚 Documentation Sources
- Official Onyx documentation
- Tutorial and guide files
- API documentation
- Language reference materials

### 🐙 GitHub Sources
- Onyx language repositories
- Code examples and tutorials
- Package and library documentation
- Configuration files and project setups

### 📁 Supported File Types
- `.onyx` source files
- `.kdl` configuration files
- README, documentation, and guide files
- HTML documentation pages
- Package configurations (`onyx.pkg`, etc.)

### 🔄 Data Population Process
1. **Use CLI crawling commands** to populate the `data/` directory
2. **MCP server searches** the pre-crawled data
3. **No crawling triggers** are available through the MCP interface

### 📡 Enhanced GitHub Crawling

The GitHub crawler extracts comprehensive content:

**📚 Documentation:**
- README.md, LICENSE, CHANGELOG.md
- All documentation in `docs/` folders
- HTML documentation and web pages
- Tutorial and guide files

**🔧 Configuration:**
- `.kdl` files (Onyx project management)
- `onyx.pkg` and package configurations
- TOML, YAML, JSON configs

**💻 Source Code:**
- All `.onyx` source files
- Example and tutorial files
- HTML examples and web interfaces

**🌐 Web Content:**
- HTML documentation pages
- Interactive examples and demos
- Web-based tutorials and guides
- API documentation in HTML format

### Repository Management

```bash
# Crawl specific repositories
node src/index.js crawl github onyx-lang/onyx user/project

# With various URL formats
node src/index.js crawl github \
  https://github.com/onyx-lang/onyx \
  github.com/user/repo \
  owner/project
```

## 🧪 Testing & Validation

```bash
# Quick validation
npm run validate

# Full test suite  
npm test

# Expected results: 100% pass rate
```

Tests validate:
- ✅ File structure integrity
- ✅ Module import functionality  
- ✅ Data directory operations
- ✅ Crawler configurations
- ✅ Search engine error handling

## 💡 Usage Examples

Once connected to Claude Desktop:

```
"Show me examples of HTTP requests in Onyx"
"How do I define a struct with KDL configuration?"
"What are the available string manipulation functions?"
"Find PostgreSQL ORM examples in Onyx repositories"
```

## 🔧 Configurable Context System

### Global Context Message
All MCP tool responses include a configurable context message that can be easily modified at the top of `src/mcp-server.js`:

```javascript
// =============================================================================
// CONFIGURABLE CONTEXT MESSAGE
// =============================================================================
// This message will be prepended to all MCP tool responses.
// Modify this section to customize the context provided to the assistant.
const GLOBAL_CONTEXT_MESSAGE = `You are assisting with Onyx programming language queries...`;
```

This allows you to:
- **Customize the assistant's context** for Onyx queries
- **Provide consistent guidance** across all tool responses
- **Easily update instructions** without modifying individual tools
- **Maintain context coherence** throughout conversations

### 🚀 Key Design Principles

### Security & Separation of Concerns
- **MCP interface is read-only** - cannot trigger crawling or data modification
- **Crawling available through CLI** - full control over data collection
- **Clean architecture** - data collection separate from query functionality
- **No external API calls** through MCP tools

### Enhanced User Experience
- **Consistent context** across all responses
- **Tool-specific messaging** for clarity
- **Comprehensive error handling** with context
- **Legacy compatibility** for existing workflows

## 🔍 Data Flow

1. **CLI Crawling Commands** populate data sources in `data/` directory
2. **Search Engine** indexes and provides unified search capabilities
3. **MCP Server** exposes read-only search tools to Claude
4. **Claude** receives contextual responses with configurable messaging
5. **Context System** ensures consistent, helpful guidance in all responses
6. **No crawling triggers** available through MCP interface

## 📈 Performance

- **Efficient caching** prevents unnecessary re-crawling
- **Rate limiting** respects API limits
- **Parallel processing** for multiple repositories
- **Comprehensive error handling** for reliability

---

*This MCP server provides Claude with secure, read-only access to Onyx programming language knowledge through a configurable context system. Comprehensive crawling capabilities are available through CLI commands but intentionally not accessible through the MCP interface, ensuring clean separation between data collection and query functionality.*
