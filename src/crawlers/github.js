import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default Onyx repositories to crawl
const DEFAULT_ONYX_REPOSITORIES = [
  'onyx-lang/onyx',
  'onyx-lang/onyx-website', 
  'onyx-lang/onyx-examples',
  'onyx-lang/pkg-glfw3',
  'onyx-lang/pkg-http-client',
  'onyx-lang/pkg-http-server',
  'onyx-lang/pkg-json-rpc',
  'onyx-lang/pkg-ncurses',
  'onyx-lang/pkg-openal',
  'onyx-lang/pkg-opencl',
  'onyx-lang/pkg-opengles',
  'onyx-lang/pkg-openssl',
  'onyx-lang/pkg-otmp',
  'onyx-lang/pkg-perlin',
  'onyx-lang/pkg-postgres-orm',
  'onyx-lang/pkg-postgres',
  'onyx-lang/pkg-protobuf',
  'onyx-lang/pkg-qoi',
  'onyx-lang/pkg-raylib',
  'onyx-lang/pkg-stb_image',
  'onyx-lang/pkg-stb_truetype',
  'onyx-lang/pkg-webgl2'
];

export async function crawlGitHub(repositoryUrls = null, options = {}) {
  const { limit = 20 } = options;
  
  // Use provided repositories or defaults
  const reposToUse = repositoryUrls && repositoryUrls.length > 0 ? 
    repositoryUrls : DEFAULT_ONYX_REPOSITORIES;
  
  const crawler = new GitHubCrawler({
    outputDir: path.join(__dirname, '../../data/github'),
    debug: true,
    maxFilesPerRepo: 50,
    maxFileSize: 100000
  });

  return await crawler.crawlAllRepositories(limit, reposToUse);
}

class GitHubCrawler {
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

  // Convert GitHub URLs to repository info
  parseGitHubUrls(urls) {
    const repositories = [];
    
    for (const url of urls) {
      try {
        // Handle various GitHub URL formats:
        // https://github.com/owner/repo
        // https://github.com/owner/repo.git
        // https://github.com/owner/repo/tree/branch
        // github.com/owner/repo
        // owner/repo
        
        let cleanUrl = url.trim();
        
        // Remove protocol if present
        cleanUrl = cleanUrl.replace(/^https?\/\//, '');
        
        // Remove github.com if present
        cleanUrl = cleanUrl.replace(/^github\.com\//, '');
        
        // Remove .git suffix
        cleanUrl = cleanUrl.replace(/\.git$/, '');
        
        // Remove any path after repo name (like /tree/branch)
        cleanUrl = cleanUrl.replace(/\/tree\/.*$/, '');
        cleanUrl = cleanUrl.replace(/\/blob\/.*$/, '');
        cleanUrl = cleanUrl.replace(/\/releases.*$/, '');
        cleanUrl = cleanUrl.replace(/\/issues.*$/, '');
        cleanUrl = cleanUrl.replace(/\/pull.*$/, '');
        
        // Split into owner/repo
        const parts = cleanUrl.split('/');
        if (parts.length >= 2) {
          const owner = parts[0];
          const name = parts[1];
          const fullName = `${owner}/${name}`;
          
          repositories.push({
            owner,
            name,
            fullName,
            url: `https://github.com/${fullName}`,
            providedUrl: url // Keep original for reference
          });
          
          this.debug(`✓ Parsed: ${url} -> ${fullName}`);
        } else {
          this.debug(`⚠️  Could not parse repository URL: ${url}`);
        }
      } catch (error) {
        this.debug(`❌ Error parsing URL ${url}:`, error.message);
      }
    }
    
    return repositories;
  }

  // Simple fetch wrapper for GitHub API
  async fetchFromGitHub(url) {
    const response = await fetch(url, { headers: this.headers });
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }

  // Get repositories from provided URLs
  async getRepositoriesFromUrls(urls, limit = 50) {
    this.debug(`Getting repository details from ${urls.length} provided URLs...`);
    
    // Parse the URLs to extract owner/repo info
    const parsedRepos = this.parseGitHubUrls(urls);
    const repositories = [];

    this.debug(`Processing ${parsedRepos.length} parsed repositories...`);

    for (const repoInfo of parsedRepos) {
      try {
        this.debug(`Fetching details for ${repoInfo.fullName}...`);
        
        // Get detailed repository information from GitHub API
        const apiUrl = `${this.apiBase}/repos/${repoInfo.owner}/${repoInfo.name}`;
        const repoData = await this.fetchFromGitHub(apiUrl);
        
        // Check if repo exists and is accessible
        if (repoData && !repoData.message) {
          repositories.push({
            owner: repoData.owner.login,
            name: repoData.name,
            fullName: repoData.full_name,
            description: repoData.description || `${repoData.name} repository`,
            stars: repoData.stargazers_count || 0,
            language: repoData.language,
            url: repoData.html_url,
            isPrivate: repoData.private,
            lastUpdated: repoData.updated_at,
            providedUrl: repoInfo.providedUrl
          });
          
          this.debug(`✓ Added ${repoInfo.fullName} (${repoData.stargazers_count} stars)`);
        } else {
          this.debug(`⚠️  Repository ${repoInfo.fullName} not accessible or not found`);
          
          // Add repo with minimal info even if API call fails
          repositories.push({
            owner: repoInfo.owner,
            name: repoInfo.name,
            fullName: repoInfo.fullName,
            description: `${repoInfo.name} repository`,
            stars: 0,
            language: 'Onyx',
            url: repoInfo.url,
            isPrivate: false,
            lastUpdated: null,
            providedUrl: repoInfo.providedUrl,
            fetchError: repoData?.message || 'Not accessible'
          });
        }
        
        // Rate limiting - be nice to GitHub API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        this.debug(`❌ Failed to fetch ${repoInfo.fullName}:`, error.message);
        
        // Add repo with minimal info even if API call fails
        repositories.push({
          owner: repoInfo.owner,
          name: repoInfo.name,
          fullName: repoInfo.fullName,
          description: `${repoInfo.name} repository`,
          stars: 0,
          language: 'Onyx',
          url: repoInfo.url,
          isPrivate: false,
          lastUpdated: null,
          providedUrl: repoInfo.providedUrl,
          fetchError: error.message
        });
      }
    }

    // Sort by stars descending
    repositories.sort((a, b) => (b.stars || 0) - (a.stars || 0));

    const finalRepos = repositories.slice(0, limit);
    this.debug(`Returning ${finalRepos.length} repositories (limited to ${limit})`);
    
    return finalRepos;
  }

  // Get all relevant files from a repository
  async crawlRepository(repo) {
    this.debug(`Crawling repository: ${repo.fullName}`);
    
    const files = [];
    
    try {
      // Get repository tree
      const url = `${this.apiBase}/repos/${repo.owner}/${repo.name}/git/trees/HEAD?recursive=1`;
      const tree = await this.fetchFromGitHub(url);

      // Filter for relevant files (expanded beyond just .onyx files)
      const relevantFiles = tree.tree.filter(item => {
        if (item.type !== 'blob') return false;
        
        const path = item.path.toLowerCase();
        
        // Always include these important files
        if (path === 'readme.md' || 
            path === 'readme.txt' || 
            path === 'readme' ||
            path === 'license' ||
            path === 'license.md' ||
            path === 'license.txt' ||
            path === 'changelog.md' ||
            path === 'changelog.txt') {
          return true;
        }
        
        // Include Onyx package and project files
        if (path === 'onyx.pkg' || 
            path.endsWith('.onyx.pkg') ||
            path.endsWith('.kdl') ||  // KDL files for Onyx project management
            path === 'package.json' ||
            path === 'manifest.json') {
          return true;
        }
        
        // Include documentation files
        if (path.includes('doc') && (path.endsWith('.md') || path.endsWith('.txt') || path.endsWith('.html'))) {
          return true;
        }
        
        // Include example files
        if (path.includes('example') && (path.endsWith('.md') || path.endsWith('.onyx') || path.endsWith('.html'))) {
          return true;
        }
        
        // Include all .onyx source files
        if (path.endsWith('.onyx')) {
          return true;
        }
        
        // Include HTML files (documentation, examples, web interfaces)
        if (path.endsWith('.html')) {
          return true;
        }
        
        // Include configuration files that might have documentation
        if (path.endsWith('.toml') || path.endsWith('.yaml') || path.endsWith('.yml')) {
          return true;
        }
        
        return false;
      }).slice(0, this.maxFilesPerRepo);

      this.debug(`Found ${relevantFiles.length} relevant files in ${repo.fullName}`);
      
      // Log what types of files we found for debugging
      const fileTypes = {};
      relevantFiles.forEach(file => {
        const ext = file.path.split('.').pop() || 'no-extension';
        fileTypes[ext] = (fileTypes[ext] || 0) + 1;
      });
      this.debug(`File types found:`, fileTypes);
      
      // Log if we found HTML files specifically
      const htmlCount = relevantFiles.filter(f => f.path.toLowerCase().endsWith('.html')).length;
      if (htmlCount > 0) {
        this.debug(`📄 Found ${htmlCount} HTML files for web documentation/examples`);
      }

      // Fetch file contents
      for (const file of relevantFiles) {
        try {
          // Skip large files
          if (file.size > this.maxFileSize) {
            this.debug(`Skipping large file: ${file.path} (${file.size} bytes)`);
            continue;
          }

          const apiUrl = `${this.apiBase}/repos/${repo.owner}/${repo.name}/git/blobs/${file.sha}`;
          const content = await this.fetchFromGitHub(apiUrl);

          // Decode base64 content
          const fileContent = Buffer.from(content.content, 'base64').toString('utf8');
          
          // Determine file type for better categorization
          const fileType = this.determineFileType(file.path);
          
          files.push({
            repository: repo.fullName,
            path: file.path,
            size: file.size,
            code: fileContent,
            content: fileContent, // Alias for non-code files
            fileType: fileType,
            url: `https://github.com/${repo.fullName}/blob/HEAD/${file.path}`,
            extractedAt: new Date().toISOString()
          });

          this.debug(`✓ Extracted: ${file.path} (${fileType}, ${file.size} bytes)`);
          
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
  
  // Determine file type for better categorization
  determineFileType(filePath) {
    const path = filePath.toLowerCase();
    
    if (path.endsWith('.onyx')) return 'source';
    if (path.endsWith('.kdl')) return 'project-config';
    if (path === 'onyx.pkg' || path.endsWith('.onyx.pkg')) return 'package-config';
    if (path === 'readme.md' || path === 'readme.txt' || path === 'readme') return 'readme';
    if (path.includes('license')) return 'license';
    if (path.includes('changelog')) return 'changelog';
    if (path.includes('doc') && (path.endsWith('.md') || path.endsWith('.html'))) return 'documentation';
    if (path.includes('example')) return 'example';
    if (path.endsWith('.html')) {
      // Categorize HTML files more specifically
      if (path.includes('doc') || path.includes('manual') || path.includes('guide')) return 'documentation';
      if (path.includes('example') || path.includes('demo') || path.includes('tutorial')) return 'example';
      if (path.includes('index') || path === 'index.html') return 'web-index';
      return 'web-content';
    }
    if (path.endsWith('.toml') || path.endsWith('.yaml') || path.endsWith('.yml')) return 'config';
    if (path.endsWith('.json')) return 'config';
    if (path.endsWith('.md')) return 'markdown';
    if (path.endsWith('.txt')) return 'text';
    
    return 'other';
  }

  // Analyze files to extract patterns, documentation, and examples
  analyzeOnyxCode(files) {
    const analysis = {
      totalFiles: files.length,
      totalLines: 0,
      filesByType: {},
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
      },
      documentation: {
        readmes: [],
        packageConfigs: [],
        projectConfigs: [],
        changelogs: [],
        examples: []
      }
    };

    // Group files by type
    files.forEach(file => {
      const type = file.fileType || 'unknown';
      if (!analysis.filesByType[type]) {
        analysis.filesByType[type] = [];
      }
      analysis.filesByType[type].push(file);
    });

    for (const file of files) {
      const lines = file.content.split('\n');
      analysis.totalLines += lines.length;

      // Handle different file types
      switch (file.fileType) {
        case 'readme':
          analysis.documentation.readmes.push({
            repository: file.repository,
            path: file.path,
            content: file.content,
            url: file.url,
            summary: this.extractReadmeSummary(file.content)
          });
          break;
          
        case 'package-config':
          analysis.documentation.packageConfigs.push({
            repository: file.repository,
            path: file.path,
            content: file.content,
            url: file.url,
            metadata: this.extractPackageMetadata(file.content, file.path)
          });
          break;
          
        case 'project-config':
          analysis.documentation.projectConfigs.push({
            repository: file.repository,
            path: file.path,
            content: file.content,
            url: file.url,
            metadata: this.extractKdlMetadata(file.content)
          });
          break;
          
        case 'changelog':
          analysis.documentation.changelogs.push({
            repository: file.repository,
            path: file.path,
            content: file.content,
            url: file.url
          });
          break;
          
        case 'documentation':
        case 'web-content':
        case 'web-index':
          analysis.documentation.examples.push({
            repository: file.repository,
            path: file.path,
            content: file.content,
            url: file.url,
            fileType: file.fileType,
            isHtml: file.path.toLowerCase().endsWith('.html')
          });
          break;
          
        case 'example':
          analysis.documentation.examples.push({
            repository: file.repository,
            path: file.path,
            content: file.content,
            url: file.url,
            fileType: file.fileType,
            isHtml: file.path.toLowerCase().endsWith('.html')
          });
          break;
      }

      // Extract code patterns from .onyx files
      if (file.fileType === 'source' || file.path.endsWith('.onyx')) {
        // Extract imports/use statements
        const useMatches = file.content.match(/use\s+[\w.{}*,\s]+/g) || [];
        useMatches.forEach(use => analysis.patterns.imports.add(use.trim()));

        // Extract function definitions
        const funcMatches = file.content.match(/(\w+)\s*::\s*\([^)]*\)\s*(->\s*[\w\[\]]+)?\s*{/g) || [];
        funcMatches.forEach(func => {
          analysis.patterns.functions.push({
            definition: func.trim(),
            file: file.path,
            repository: file.repository,
            url: file.url
          });
        });

        // Extract struct definitions
        const structMatches = file.content.match(/(\w+)\s*::\s*struct[^{]*{[^}]*}/gs) || [];
        structMatches.forEach(struct => {
          analysis.patterns.structs.push({
            definition: struct.trim(),
            file: file.path,
            repository: file.repository,
            url: file.url
          });
        });

        // Extract enum definitions
        const enumMatches = file.content.match(/(\w+)\s*::\s*enum[^{]*{[^}]*}/gs) || [];
        enumMatches.forEach(enumDef => {
          analysis.patterns.enums.push({
            definition: enumDef.trim(),
            file: file.path,
            repository: file.repository,
            url: file.url
          });
        });

        // Categorize examples by complexity (simple heuristic)
        const complexity = this.determineComplexity(file.content, lines.length);
        analysis.examples.byComplexity[complexity].push({
          path: file.path,
          repository: file.repository,
          code: file.content,
          url: file.url,
          lines: lines.length
        });

        // Categorize by topic based on filename and content
        const topics = this.extractTopics(file.path, file.content);
        topics.forEach(topic => {
          if (!analysis.examples.byTopic.has(topic)) {
            analysis.examples.byTopic.set(topic, []);
          }
          analysis.examples.byTopic.get(topic).push({
            path: file.path,
            repository: file.repository,
            code: file.content,
            url: file.url,
            fileType: file.fileType
          });
        });
      }
    }

    // Convert Sets/Maps to Arrays for JSON serialization
    analysis.patterns.imports = Array.from(analysis.patterns.imports);
    analysis.examples.byTopic = Object.fromEntries(analysis.examples.byTopic);

    return analysis;
  }
  
  // Extract summary from README content
  extractReadmeSummary(content) {
    const lines = content.split('\n');
    const summary = [];
    
    for (const line of lines.slice(0, 20)) { // First 20 lines
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('![')) {
        summary.push(trimmed);
        if (summary.length >= 3) break; // First 3 substantial lines
      }
    }
    
    return summary.join(' ');
  }
  
  // Extract metadata from package config files
  extractPackageMetadata(content, filePath) {
    const metadata = { type: 'unknown' };
    
    if (filePath.endsWith('.json')) {
      try {
        const parsed = JSON.parse(content);
        metadata.type = 'json';
        metadata.data = parsed;
        metadata.name = parsed.name;
        metadata.version = parsed.version;
        metadata.description = parsed.description;
      } catch (e) {
        metadata.parseError = e.message;
      }
    } else {
      // Handle .onyx.pkg or onyx.pkg files
      metadata.type = 'onyx-pkg';
      metadata.rawContent = content;
      
      // Basic extraction of key-value pairs
      const lines = content.split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*(\w+)\s*[=:]\s*(.+)$/);
        if (match) {
          const [, key, value] = match;
          metadata[key] = value.replace(/["']/g, '').trim();
        }
      }
    }
    
    return metadata;
  }
  
  // Extract metadata from KDL files
  extractKdlMetadata(content) {
    const metadata = {
      type: 'kdl',
      rawContent: content,
      dependencies: [],
      configuration: {}
    };
    
    // Basic KDL parsing - look for common patterns
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Look for dependency declarations
      if (trimmed.includes('dependency') || trimmed.includes('dep')) {
        metadata.dependencies.push(trimmed);
      }
      
      // Look for configuration settings
      const configMatch = trimmed.match(/^(\w+)\s+(.+)$/);
      if (configMatch) {
        const [, key, value] = configMatch;
        metadata.configuration[key] = value;
      }
    }
    
    return metadata;
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
      { pattern: /memory|alloc/, topic: 'memory-management' },
      { pattern: /html|web|ui/, topic: 'web-development' },
      { pattern: /doc|guide|manual/, topic: 'documentation' },
      { pattern: /tutorial|learn/, topic: 'tutorials' }
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

    // HTML-specific topic extraction
    if (filePath.toLowerCase().endsWith('.html')) {
      const htmlTopics = [
        { pattern: /<script[^>]*>.*onyx/is, topic: 'web-onyx-integration' },
        { pattern: /<pre[^>]*>.*\.onyx/is, topic: 'onyx-examples' },
        { pattern: /api\s+documentation|reference/i, topic: 'api-documentation' },
        { pattern: /getting\s+started|tutorial/i, topic: 'tutorials' },
        { pattern: /example|demo/i, topic: 'examples' },
        { pattern: /guide|manual/i, topic: 'documentation' }
      ];
      
      htmlTopics.forEach(({ pattern, topic }) => {
        if (pattern.test(code)) {
          topics.add(topic);
        }
      });
      
      // Always add web-development for HTML files
      topics.add('web-development');
    } else {
      // Regular code topics for non-HTML files
      codeTopics.forEach(({ pattern, topic }) => {
        if (pattern.test(code)) {
          topics.add(topic);
        }
      });
    }

    return Array.from(topics);
  }

  async crawlAllRepositories(repoLimit = 20, repositoryUrls = null) {
    console.log('🚀 Starting GitHub Onyx code crawl...');
    
    await fs.mkdir(this.outputDir, { recursive: true });

    let repositories;
    
    if (repositoryUrls && repositoryUrls.length > 0) {
      console.log(`🔗 Using ${repositoryUrls.length} provided repository URLs`);
      repositoryUrls.forEach((url, index) => {
        console.log(`   ${index + 1}. ${url}`);
      });
      console.log('');
      
      repositories = await this.getRepositoriesFromUrls(repositoryUrls, repoLimit);
    } else {
      console.log('⚠️  No repository URLs provided');
      console.log('💡 Please provide repository URLs to crawl');
      return;
    }
    
    if (repositories.length === 0) {
      console.log('❌ No accessible repositories found');
      return;
    }

    console.log(`📦 Successfully loaded ${repositories.length} repositories:`);
    repositories.forEach((repo, index) => {
      const status = repo.fetchError ? `(${repo.fetchError})` : `(${repo.stars || 0} stars)`;
      console.log(`   ${index + 1}. ${repo.fullName} ${status}`);
    });
    console.log('');

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
    
    // Save documentation separately for better searchability
    await fs.writeFile(
      path.join(this.outputDir, 'documentation.json'),
      JSON.stringify(analysis.documentation, null, 2)
    );
    
    // Save file type breakdown for debugging
    await fs.writeFile(
      path.join(this.outputDir, 'file-types.json'),
      JSON.stringify(analysis.filesByType, null, 2)
    );

    this.debug(`💾 Saved all data to ${this.outputDir}`);
  }
}

export default GitHubCrawler;