# Onyx Documentation MCP Server

A Model Context Protocol (MCP) server that provides AI systems with access to Onyx programming language documentation through web crawling and intelligent search.

## Features

- **Web Crawler**: Automatically crawls Onyx documentation websites
- **Smart Search**: Find relevant documentation by keywords, concepts, or function names
- **Code Examples**: Extract and search through code examples
- **Function Lookup**: Get detailed documentation for specific functions
- **Section Browsing**: Browse documentation by categories or sections

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure the crawler**: 
   Edit `src/crawler.js` and update the `BASE_URLS` array to point to the actual Onyx documentation URLs:
   ```javascript
    const BASE_URLS = [
      'https://docs.onyxlang.io/book/Overview.html',  // Book documentation
      'https://docs.onyxlang.io/packages/core.html',  // Package documentation
    ]; 
   ```

3. **Crawl the documentation**:
   ```bash
   # Use configured URLs
   npm run crawl
   
   # Or specify URLs directly
   npm run crawl https://example.com/docs https://example.com/api
   ```
   This will create a `data/` directory with the crawled documentation.

4. **Start the MCP server**:
   ```bash
   npm start
   ```

## Usage with Claude Desktop

Add this to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "onyx-docs": {
      "command": "node",
      "args": ["/path/to/onyx-docs-mcp/src/server.js"]
    }
  }
}
```

## Available Tools

### `search_onyx_docs`
Search through Onyx documentation for specific topics, functions, or concepts.

**Parameters:**
- `query` (string): Search keywords
- `limit` (number, optional): Max results to return (default: 5)

### `get_onyx_examples`
Find code examples for specific Onyx features or functions.

**Parameters:**
- `topic` (string): Topic to find examples for
- `limit` (number, optional): Max examples to return (default: 3)

### `get_onyx_function_docs`
Get detailed documentation for a specific Onyx function or method.

**Parameters:**
- `functionName` (string): Name of the function to look up

### `browse_onyx_sections`
Browse Onyx documentation by section or category.

**Parameters:**
- `section` (string): Section name (e.g., "getting started", "syntax", "stdlib")

## Customization

### Crawler Configuration
- **BASE_URLS**: Array of starting URLs for documentation crawling
- **CRAWL_DELAY**: Delay between requests (default: 1000ms)
- **Link Detection**: Modify `findDocLinks()` to match the site's link structure
- **Multiple Domains**: Supports crawling from different domains/subdomains

### Content Extraction
- **CSS Selectors**: Update selectors in `extractContent()` to match the documentation site's HTML structure
- **Content Filtering**: Modify which elements to remove (nav, footer, etc.)

### Search Algorithm
- **Scoring**: Adjust relevance scoring in `searchDocs()`
- **Snippet Generation**: Customize how text snippets are generated

## Example Usage

Once connected to an AI system, you can ask questions like:

- "How do I declare variables in Onyx?"
- "Show me examples of Onyx functions"
- "What's the syntax for loops in Onyx?"
- "Find documentation about memory management"

## Data Storage

The crawler saves data in two formats:
- `data/onyx-docs.json`: Complete documentation with all metadata
- `data/onyx-docs-index.json`: Simplified index for quick overview

## Troubleshooting

**No documentation found**: 
- Check that the BASE_URL is correct
- Verify the site allows crawling (check robots.txt)
- Update CSS selectors if the site structure has changed

**Poor search results**:
- The search is currently keyword-based
- Consider adding semantic search with embeddings for better results

**Rate limiting**:
- Increase CRAWL_DELAY if getting blocked
- Add User-Agent rotation if needed

## Contributing

Feel free to submit issues and pull requests to improve the crawler or add features like:
- Semantic search with embeddings
- Better content extraction
- Support for multiple documentation formats
- Caching and incremental updates
