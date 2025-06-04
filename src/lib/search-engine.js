import fs from 'fs/promises';
import path from 'path';

export class SearchEngine {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.cache = {
      docs: null,
      githubFiles: null,
      githubPatterns: null,
      examplesByTopic: null
    };
  }

  async loadData(type) {
    if (this.cache[type]) {
      return this.cache[type];
    }

    const filePaths = {
      docs: 'onyx-docs.json',
      githubFiles: 'github/onyx-code.json',
      githubPatterns: 'github/code-patterns.json',
      examplesByTopic: 'github/examples-by-topic.json'
    };

    try {
      const filePath = path.join(this.dataDir, filePaths[type]);
      const data = await fs.readFile(filePath, 'utf8');
      this.cache[type] = JSON.parse(data);
      return this.cache[type];
    } catch (error) {
      console.error(`Failed to load ${type}:`, error.message);
      return null;
    }
  }

  // Search official Onyx documentation
  async searchDocs(query, limit = 5) {
    const docs = await this.loadData('docs');
    if (!docs) {
      return { error: 'Documentation not available. Run crawler first.' };
    }

    const queryLower = query.toLowerCase();
    const results = [];

    for (const doc of docs) {
      let score = 0;
      const titleMatch = doc.title.toLowerCase().includes(queryLower);
      const contentMatch = doc.content.toLowerCase().includes(queryLower);
      
      if (titleMatch) score += 10;
      if (contentMatch) score += 1;
      
      // Check headings
      for (const heading of doc.headings || []) {
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
      query,
      source: 'documentation',
      totalFound: results.length,
      results: results.slice(0, limit).map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        headings: (r.headings || []).map(h => h.text).slice(0, 3),
        score: r.score
      }))
    };
  }

  // Search GitHub code examples by topic
  async searchGitHubExamples(topic, limit = 5) {
    const examplesByTopic = await this.loadData('examplesByTopic');
    if (!examplesByTopic) {
      return { error: 'GitHub examples not available. Run GitHub crawler first.' };
    }

    const availableTopics = Object.keys(examplesByTopic);
    
    // Find matching topics (exact match or contains)
    const matchingTopics = availableTopics.filter(t => 
      t.toLowerCase().includes(topic.toLowerCase()) ||
      topic.toLowerCase().includes(t.toLowerCase())
    );

    if (matchingTopics.length === 0) {
      return {
        query: topic,
        availableTopics: availableTopics.sort(),
        examples: [],
        message: `No examples found for topic "${topic}". Try one of the available topics.`
      };
    }

    const examples = [];
    for (const matchingTopic of matchingTopics) {
      const topicExamples = examplesByTopic[matchingTopic] || [];
      examples.push(...topicExamples.slice(0, Math.ceil(limit / matchingTopics.length)));
    }

    return {
      query: topic,
      matchingTopics,
      examples: examples.slice(0, limit).map(example => ({
        file: example.path,
        repository: example.repository,
        url: example.url,
        code: example.code.length > 1000 ? 
          example.code.substring(0, 1000) + '\n... (truncated)' : 
          example.code,
        fullCodeLength: example.code.length
      })),
      totalAvailable: examples.length,
      availableTopics: availableTopics.sort()
    };
  }

  // Get Onyx function examples from GitHub
  async getOnyxFunctionExamples(functionName = null, limit = 10) {
    const patterns = await this.loadData('githubPatterns');
    if (!patterns) {
      return { error: 'GitHub patterns not available. Run GitHub crawler first.' };
    }

    let functions = patterns.functions || [];

    if (functionName) {
      // Filter by function name (partial match)
      functions = functions.filter(func => 
        func.definition.toLowerCase().includes(functionName.toLowerCase())
      );
    }

    return {
      query: functionName,
      totalFound: functions.length,
      examples: functions.slice(0, limit).map(func => ({
        definition: func.definition,
        file: func.file,
        repository: func.repository,
        url: func.url
      }))
    };
  }

  // Get Onyx struct examples from GitHub
  async getOnyxStructExamples(structName = null, limit = 10) {
    const patterns = await this.loadData('githubPatterns');
    if (!patterns) {
      return { error: 'GitHub patterns not available. Run GitHub crawler first.' };
    }

    let structs = patterns.structs || [];

    if (structName) {
      // Filter by struct name (partial match)
      structs = structs.filter(struct => 
        struct.definition.toLowerCase().includes(structName.toLowerCase())
      );
    }

    return {
      query: structName,
      totalFound: structs.length,
      examples: structs.slice(0, limit).map(struct => ({
        definition: struct.definition,
        file: struct.file,
        repository: struct.repository,
        url: struct.url
      }))
    };
  }

  // Search across all sources
  async searchAll(query, sources = ['docs', 'github'], limit = 10) {
    const results = {
      query,
      sources: sources,
      totalResults: 0,
      resultsBySources: {}
    };

    const perSourceLimit = Math.ceil(limit / sources.length);

    if (sources.includes('docs')) {
      results.resultsBySources.docs = await this.searchDocs(query, perSourceLimit);
      if (!results.resultsBySources.docs.error) {
        results.totalResults += results.resultsBySources.docs.totalFound || 0;
      }
    }

    if (sources.includes('github')) {
      // Search GitHub files directly
      const githubFiles = await this.loadData('githubFiles');
      if (githubFiles) {
        const githubResults = this.searchGitHubFiles(githubFiles, query, perSourceLimit);
        results.resultsBySources.github = githubResults;
        results.totalResults += githubResults.totalFound || 0;
      }
    }

    // Combine and rank all results
    const allResults = [];
    
    Object.values(results.resultsBySources).forEach(sourceResults => {
      if (sourceResults.results && !sourceResults.error) {
        sourceResults.results.forEach(result => {
          allResults.push({
            ...result,
            source: sourceResults.source
          });
        });
      }
    });

    // Sort by score (higher is better)
    allResults.sort((a, b) => (b.score || 0) - (a.score || 0));

    results.combinedResults = allResults.slice(0, limit);
    
    return results;
  }

  // Search GitHub files directly
  searchGitHubFiles(files, query, limit) {
    const queryLower = query.toLowerCase();
    const results = [];

    for (const file of files) {
      let score = 0;
      const pathMatch = file.path.toLowerCase().includes(queryLower);
      const repoMatch = file.repository.toLowerCase().includes(queryLower);
      const codeMatch = file.code.toLowerCase().includes(queryLower);
      
      if (pathMatch) score += 5;
      if (repoMatch) score += 3;
      if (codeMatch) score += 1;
      
      if (score > 0) {
        results.push({
          file: file.path,
          repository: file.repository,
          url: file.url,
          score: score,
          codeSnippet: this.getSnippet(file.code, queryLower, 200)
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    
    return {
      source: 'github',
      totalFound: results.length,
      results: results.slice(0, limit)
    };
  }

  // Get a snippet of text around the query
  getSnippet(content, query, contextLength = 150) {
    const index = content.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) return content.substring(0, contextLength) + '...';
    
    const start = Math.max(0, index - contextLength / 2);
    const end = Math.min(content.length, index + query.length + contextLength / 2);
    
    return (start > 0 ? '...' : '') + 
           content.substring(start, end) + 
           (end < content.length ? '...' : '');
  }
}