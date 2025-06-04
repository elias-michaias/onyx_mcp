# Enhanced Onyx MCP Server

A Model Context Protocol (MCP) server that provides comprehensive access to Onyx programming language documentation, GitHub code examples, and web crawling capabilities.

## 🚀 Quick Start

### 1. Installation
```bash
# Dependencies should already be installed, but if needed:
npm install
```

### 2. Validation
```bash
# Run validation to check setup
node validate.js

# Run comprehensive tests
npm test
```

### 3. Data Population
```bash
# Crawl official Onyx documentation
npm run crawl:docs

# Crawl GitHub repositories for Onyx code examples
npm run crawl:github

# Crawl everything
npm run crawl:all
```

### 4. Start the Server
```bash
# Start the MCP server
npm start

# Or start with auto-reload during development
npm run dev
```

## 🛠️ Features

### Documentation Tools
- `search_onyx_docs` - Search official Onyx documentation
- `crawl_onyx_docs` - Update documentation cache
- `get_onyx_function_docs` - Get function documentation
- `browse_onyx_sections` - Browse docs by section

### GitHub Code Examples
- `search_github_examples` - Search code examples by topic
- `get_onyx_functions` - Get function definitions from GitHub
- `get_onyx_structs` - Get struct definitions from GitHub
- `crawl_github_repos` - Update GitHub code cache
- `list_github_repos` - List discovered repositories

### URL Crawling
- `crawl_url` - Extract content from any URL
- `search_all_sources` - Search across all data sources

## 🔧 Configuration

### GitHub Token (Optional but Recommended)
```bash
export GITHUB_TOKEN=your_github_token_here
```

This increases API rate limits for GitHub crawling.

### Claude Desktop Configuration
Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "onyx-enhanced-mcp": {
      "command": "node",
      "args": ["/path/to/onyx_mcp/src/server.js"],
      "cwd": "/path/to/onyx_mcp"
    }
  }
}
```

## 📊 Data Structure

The server creates a `data/` directory with:
- `onyx-docs.json` - Official documentation
- `github/` - GitHub code examples and analysis
- `urls/` - Crawled URL content

## 🧪 Testing

The test suite validates:
- ✅ File structure
- ✅ Package.json validity  
- ✅ Module imports
- ✅ Data directory creation
- ✅ SearchEngine functionality
- ✅ URLCrawler configuration
- ✅ GitHub crawler initialization

## 📝 Example Usage

Once connected to Claude Desktop, you can ask:
- "How do I create a struct in Onyx?"
- "Show me examples of HTTP requests in Onyx"
- "What are the available string functions?"
- "Find examples of JSON parsing in Onyx code"

## 🔄 Development

- `src/server.js` - Main MCP server
- `src/lib/search-engine.js` - Search functionality
- `src/lib/github-crawler.js` - GitHub API integration
- `src/lib/url-crawler.js` - Web scraping
- `src/docs-crawler.js` - Documentation scraping
- `test-setup.js` - Test suite

## 🐛 Troubleshooting

### Test Failures
1. Run `node validate.js` for quick validation
2. Check file permissions
3. Ensure Node.js 18+ is installed
4. Verify all dependencies are installed

### GitHub Crawling Issues
1. Check internet connection
2. Set GITHUB_TOKEN for higher rate limits
3. Reduce repo limit: `npm run crawl:github -- --limit 10`

### Documentation Crawling Issues
1. Check if docs.onyxlang.io is accessible
2. Try force recrawl: `npm run crawl:docs -- --force`

## 📈 Stats

Run `npm test` to see:
- Total files crawled
- Code examples found
- Test pass rate
- Setup validation

---

*This MCP server enhances Claude's knowledge of the Onyx programming language with real-time access to documentation, code examples, and community resources.*
