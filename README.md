# Enhanced Onyx MCP Server

A unified Model Context Protocol (MCP) server providing comprehensive access to Onyx programming language documentation, GitHub code examples, and web crawling capabilities.

## 🚀 Quick Start

### Installation & Setup

```bash
# Install dependencies  
npm install

# Create environment configuration
cp .env.example .env
# Edit .env and add your GitHub token (optional but recommended)

# Validate installation
npm run validate
```

### Basic Usage

```bash
# Start the MCP server (default)
npm start

# Run with development mode
npm run dev

# Run tests
npm test

# Crawl all data sources
npm run crawl:all
```

## 🎯 Unified Interface

All functionality is accessible through the main entry point:

```bash
# Server operations
node src/index.js server          # Start MCP server  
node src/index.js server --dev    # Development mode

# Data crawling
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
│   ├── index.js           # 🎯 Unified entry point
│   ├── mcp-server.js      # 🌐 MCP server implementation
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

The server provides these tools to Claude:

### 📚 Documentation
- `search_onyx_docs` - Search official documentation
- `crawl_onyx_docs` - Update documentation cache
- `browse_onyx_sections` - Browse by section
- `get_onyx_function_docs` - Function documentation

### 🐙 GitHub Integration  
- `search_github_examples` - Search code by topic
- `get_onyx_functions` - Function definitions from GitHub
- `get_onyx_structs` - Struct definitions from GitHub
- `crawl_github_repos` - Update code cache
- `list_github_repos` - List repositories

### 🌐 Web Crawling
- `crawl_url` - Extract content from URLs
- `search_all_sources` - Unified search across all data

## 🔧 Configuration

### Environment Variables (.env)

```bash
# GitHub token (recommended for higher rate limits)
GITHUB_TOKEN=your_github_token_here

# Optional settings
DEBUG=false
MAX_CRAWL_LIMIT=50
```

### Claude Desktop Integration

```json
{
  "mcpServers": {
    "onyx_mcp": {
      "command": "node",
      "args": ["/path/to/onyx_mcp/src/index.js", "server"],
    }
  }
}
```

## 📊 Enhanced GitHub Crawling

### Comprehensive File Extraction
The GitHub crawler now extracts:

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

## 🚀 Key Improvements

### Unified Architecture
- **Single entry point** replacing multiple CLI scripts
- **Consistent naming** across all modules
- **Standardized interfaces** for all crawlers

### Enhanced GitHub Crawling
- **Comprehensive file extraction** (README, docs, configs)
- **KDL support** for Onyx project management
- **Better context** for Claude's understanding

### Streamlined Development
- **Consolidated commands** through unified interface
- **Simplified testing** and validation
- **Clean project structure** with logical organization

## 🔍 Data Flow

1. **Crawlers** extract content from various sources
2. **Search Engine** indexes and provides unified search
3. **MCP Server** exposes tools to Claude
4. **Claude** uses tools to answer Onyx-related questions

## 📈 Performance

- **Efficient caching** prevents unnecessary re-crawling
- **Rate limiting** respects API limits
- **Parallel processing** for multiple repositories
- **Comprehensive error handling** for reliability

---

*This enhanced MCP server provides Claude with deep, contextual knowledge of the Onyx programming language through official documentation, real-world code examples, and comprehensive project understanding.*
