import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class GitHubOnyxCrawler {
  constructor(options = {}) {
    this.outputDir = options.outputDir || path.join(__dirname, '../../data/github');
    this.debugMode = options.debug || true;
    this.maxFilesPerRepo = options.maxFilesPerRepo || 100;
    this.maxFileSize = options.maxFileSize || 50000; // 50KB max per file
    
    // GitHub API setup (works without token but has lower rate limits)
    this.apiBase = 'https://api.github.com';
    this.headers = {
      'User-Agent': 'onyx-mcp-crawler/1.0.0',
      'Accept': 'application/vnd.github.v3+json'
    };
    
    // Add GitHub token if available
    if (process.env.GITHUB_TOKEN) {
      this.headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }
  }

  debug(...args) {
    if (this.debugMode) {
      console.log('[GITHUB]', ...args);
    }
  }

  // List of known Onyx repositories - you can expand this
  getKnownOnyxRepos() {
    return [
      'onyx-lang/onyx',           // Main Onyx repository
      'onyx-lang/pkg',            // Package manager
      'onyx-lang/examples',       // Official examples
      // Add more known repos here
    ];
  }

  // Simple fetch wrapper for GitHub API
  async fetchFromGitHub(url) {
    const response = await fetch(url, { headers: this.headers });
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }

  // Search GitHub for repositories containing Onyx code
  async searchOnyxRepositories(limit = 50) {
    this.debug('Searching GitHub for Onyx repositories...');
    
    try {
      const searches = [
        // Search by file extension
        'extension:onyx',
        // Search by filename
        'filename:*.onyx',
        // Search for common Onyx patterns
        '"use core" extension:onyx',
        '"main ::" extension:onyx',
        // Search in specific files
        'filename:onyx.pkg',
      ];

      const allRepos = new Set();
      
      for (const query of searches) {
        try {
          const url = `${this.apiBase}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${Math.min(limit, 100)}`;
          const result = await this.fetchFromGitHub(url);

          result.items.forEach(repo => {
            if (!repo.fork && !repo.archived) { // Skip forks and archived repos
              allRepos.add({
                owner: repo.owner.login,
                name: repo.name,
                fullName: repo.full_name,
                description: repo.description,
                stars: repo.stargazers_count,
                language: repo.language,
                url: repo.html_url
              });
            }
          });

          this.debug(`Found ${result.items.length} repos for query: ${query}`);
          
          // Rate limiting - GitHub allows 30 requests per minute for search
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          this.debug(`Search failed for query "${query}":`, error.message);
        }
      }

      // Add known repos
      const knownRepos = this.getKnownOnyxRepos();
      for (const repo of knownRepos) {
        const [owner, name] = repo.split('/');
        try {
          const url = `${this.apiBase}/repos/${owner}/${name}`;
          const repoData = await this.fetchFromGitHub(url);
          allRepos.add({
            owner: repoData.owner.login,
            name: repoData.name,
            fullName: repoData.full_name,
            description: repoData.description,
            stars: repoData.stargazers_count,
            language: repoData.language,
            url: repoData.html_url
          });
        } catch (error) {
          this.debug(`Failed to fetch known repo ${repo}:`, error.message);
        }
      }

      const repos = Array.from(allRepos)
        .sort((a, b) => b.stars - a.stars) // Sort by stars descending
        .slice(0, limit);

      this.debug(`Total unique repositories found: ${repos.length}`);
      return repos;
    } catch (error) {
      console.error('GitHub search failed:', error);
      return [];
    }
  }

  // Get all Onyx files from a repository
  async crawlRepository(repo) {
    this.debug(`Crawling repository: ${repo.fullName}`);
    
    const files = [];
    
    try {
      // Get repository tree
      const url = `${this.apiBase}/repos/${repo.owner}/${repo.name}/git/trees/HEAD?recursive=1`;
      const tree = await this.fetchFromGitHub(url);

      // Filter for Onyx files
      const onyxFiles = tree.tree.filter(item => 
        item.type === 'blob' && 
        (item.path.endsWith('.onyx') || 
         item.path.endsWith('.onyx.pkg') ||
         item.path === 'onyx.pkg')
      ).slice(0, this.maxFilesPerRepo);

      this.debug(`Found ${onyxFiles.length} Onyx files in ${repo.fullName}`);

      // Fetch file contents
      for (const file of onyxFiles) {
        try {
          // Skip large files
          if (file.size > this.maxFileSize) {
            this.debug(`Skipping large file: ${file.path} (${file.size} bytes)`);
            continue;
          }

          const url = `${this.apiBase}/repos/${repo.owner}/${repo.name}/git/blobs/${file.sha}`;
          const content = await this.fetchFromGitHub(url);

          // Decode base64 content
          const code = Buffer.from(content.content, 'base64').toString('utf8');
          
          files.push({
            repository: repo.fullName,
            path: file.path,
            size: file.size,
            code: code,
            url: `https://github.com/${repo.fullName}/blob/HEAD/${file.path}`,
            extractedAt: new Date().toISOString()
          });

          this.debug(`✓ Extracted: ${file.path} (${file.size} bytes)`);
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          this.debug(`Failed to fetch ${file.path}:`, error.message);
        }
      }
    } catch (error) {
      console.error(`Failed to crawl repository ${repo.fullName}:`, error);
    }

    return files;
  }

  // Analyze Onyx code to extract patterns and examples
  analyzeOnyxCode(files) {
    const analysis = {
      totalFiles: files.length,
      totalLines: 0,
      patterns: {
        imports: new Set(),
        functions: [],
        structs: [],
        enums: [],
        macros: [],
        commonPatterns: new Map()
      },
      examples: {
        byTopic: new Map(),
        byComplexity: { simple: [], intermediate: [], advanced: [] }
      }
    };

    for (const file of files) {
      const lines = file.code.split('\n');
      analysis.totalLines += lines.length;

      // Extract imports/use statements
      const useMatches = file.code.match(/use\s+[\w.{}*,\s]+/g) || [];
      useMatches.forEach(use => analysis.patterns.imports.add(use.trim()));

      // Extract function definitions
      const funcMatches = file.code.match(/(\w+)\s*::\s*\([^)]*\)\s*(->\s*[\w\[\]]+)?\s*{/g) || [];
      funcMatches.forEach(func => {
        analysis.patterns.functions.push({
          definition: func.trim(),
          file: file.path,
          repository: file.repository,
          url: file.url
        });
      });

      // Extract struct definitions
      const structMatches = file.code.match(/(\w+)\s*::\s*struct[^{]*{[^}]*}/gs) || [];
      structMatches.forEach(struct => {
        analysis.patterns.structs.push({
          definition: struct.trim(),
          file: file.path,
          repository: file.repository,
          url: file.url
        });
      });

      // Extract enum definitions
      const enumMatches = file.code.match(/(\w+)\s*::\s*enum[^{]*{[^}]*}/gs) || [];
      enumMatches.forEach(enumDef => {
        analysis.patterns.enums.push({
          definition: enumDef.trim(),
          file: file.path,
          repository: file.repository,
          url: file.url
        });
      });

      // Categorize examples by complexity (simple heuristic)
      const complexity = this.determineComplexity(file.code, lines.length);
      analysis.examples.byComplexity[complexity].push({
        path: file.path,
        repository: file.repository,
        code: file.code,
        url: file.url,
        lines: lines.length
      });

      // Categorize by topic based on filename and content
      const topics = this.extractTopics(file.path, file.code);
      topics.forEach(topic => {
        if (!analysis.examples.byTopic.has(topic)) {
          analysis.examples.byTopic.set(topic, []);
        }
        analysis.examples.byTopic.get(topic).push({
          path: file.path,
          repository: file.repository,
          code: file.code,
          url: file.url
        });
      });
    }

    // Convert Sets/Maps to Arrays for JSON serialization
    analysis.patterns.imports = Array.from(analysis.patterns.imports);
    analysis.examples.byTopic = Object.fromEntries(analysis.examples.byTopic);

    return analysis;
  }

  determineComplexity(code, lineCount) {
    // Simple heuristic for complexity
    const complexPatterns = [
      /struct.*{[\s\S]*?}/g,
      /enum.*{[\s\S]*?}/g,
      /macro/g,
      /generic/g,
      /interface/g
    ];

    let complexityScore = lineCount;
    complexPatterns.forEach(pattern => {
      const matches = code.match(pattern) || [];
      complexityScore += matches.length * 10;
    });

    if (complexityScore < 50) return 'simple';
    if (complexityScore < 200) return 'intermediate';
    return 'advanced';
  }

  extractTopics(filePath, code) {
    const topics = new Set();
    
    // Topic extraction based on file path
    const pathTopics = [
      { pattern: /test|spec/, topic: 'testing' },
      { pattern: /example/, topic: 'examples' },
      { pattern: /http|net|web/, topic: 'networking' },
      { pattern: /json|xml|csv/, topic: 'data-formats' },
      { pattern: /crypto|hash/, topic: 'cryptography' },
      { pattern: /math/, topic: 'mathematics' },
      { pattern: /string/, topic: 'string-manipulation' },
      { pattern: /file|io/, topic: 'file-io' },
      { pattern: /thread|async/, topic: 'concurrency' },
      { pattern: /memory|alloc/, topic: 'memory-management' }
    ];

    pathTopics.forEach(({ pattern, topic }) => {
      if (pattern.test(filePath.toLowerCase())) {
        topics.add(topic);
      }
    });

    // Topic extraction based on code content
    const codeTopics = [
      { pattern: /use\s+core\.net/, topic: 'networking' },
      { pattern: /use\s+core\.json/, topic: 'data-formats' },
      { pattern: /use\s+core\.crypto/, topic: 'cryptography' },
      { pattern: /use\s+core\.math/, topic: 'mathematics' },
      { pattern: /use\s+core\.string/, topic: 'string-manipulation' },
      { pattern: /use\s+core\.io/, topic: 'file-io' },
      { pattern: /use\s+core\.thread/, topic: 'concurrency' },
      { pattern: /println|printf/, topic: 'basic-io' },
      { pattern: /struct.*{/, topic: 'data-structures' },
      { pattern: /enum.*{/, topic: 'enumerations' }
    ];

    codeTopics.forEach(({ pattern, topic }) => {
      if (pattern.test(code)) {
        topics.add(topic);
      }
    });

    return Array.from(topics);
  }

  async crawlAllRepositories(repoLimit = 20) {
    console.log('🚀 Starting GitHub Onyx code crawl...');
    
    await fs.mkdir(this.outputDir, { recursive: true });

    // Search for repositories
    const repositories = await this.searchOnyxRepositories(repoLimit);
    if (repositories.length === 0) {
      console.log('❌ No repositories found');
      return;
    }

    console.log(`📦 Found ${repositories.length} repositories to crawl`);

    // Crawl each repository
    const allFiles = [];
    for (const repo of repositories) {
      const files = await this.crawlRepository(repo);
      allFiles.push(...files);
      
      // Rate limiting between repos
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`📄 Extracted ${allFiles.length} Onyx files total`);

    // Analyze the code
    const analysis = this.analyzeOnyxCode(allFiles);

    // Save results
    await this.saveResults(repositories, allFiles, analysis);

    console.log('✅ GitHub crawl complete!');
    console.log(`📊 Stats: ${analysis.totalFiles} files, ${analysis.totalLines} lines of code`);
    console.log(`🔍 Found: ${analysis.patterns.functions.length} functions, ${analysis.patterns.structs.length} structs`);
  }

  async saveResults(repositories, files, analysis) {
    // Save repository list
    await fs.writeFile(
      path.join(this.outputDir, 'repositories.json'),
      JSON.stringify(repositories, null, 2)
    );

    // Save all code files
    await fs.writeFile(
      path.join(this.outputDir, 'onyx-code.json'),
      JSON.stringify(files, null, 2)
    );

    // Save analysis
    await fs.writeFile(
      path.join(this.outputDir, 'code-analysis.json'),
      JSON.stringify(analysis, null, 2)
    );

    // Save examples by topic for easy lookup
    await fs.writeFile(
      path.join(this.outputDir, 'examples-by-topic.json'),
      JSON.stringify(analysis.examples.byTopic, null, 2)
    );

    // Save patterns for code completion/suggestions
    await fs.writeFile(
      path.join(this.outputDir, 'code-patterns.json'),
      JSON.stringify(analysis.patterns, null, 2)
    );

    this.debug(`💾 Saved all data to ${this.outputDir}`);
  }
}

export default GitHubOnyxCrawler;