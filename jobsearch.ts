import Redis from 'ioredis';

// Type definitions
interface JobData {
  id: string;
  name: string;
  data: any;
  timestamp: number | null;
  processedOn: number | null;
  finishedOn: number | null;
  progress: number;
  opts: Record<string, any>;
}

interface RedisOptions {
  host?: string;
  port?: number;
  db?: number;
  password?: string;
  [key: string]: any;
}

interface BullMQSearchOptions {
  prefix?: string;
  redis?: RedisOptions;
}

interface SearchOptions {
  name?: string;
  data?: string | Record<string, any>;
  limit?: number;
  cursor?: string;
}

interface PaginationResult<T> {
  items: T[];
  nextCursor: string;
  hasMore: boolean;
}

interface PaginationOptions {
  limit?: number;
  cursor?: string;
}

class BullMQSearch {
  queueName: any;
  prefix: any;
  redis: Redis;
  searchScript: string;
  searchScriptSha: any;
  constructor(queueName: string, options: BullMQSearchOptions) {
    this.queueName = queueName;
    this.prefix = options.prefix || 'bull';
    this.redis = new Redis(options.redis || {});
    
    // Define the Lua script for searching with cursor-based pagination
    this.searchScript = `
    local pattern = ARGV[1]
    local jobName = ARGV[2]
    local searchData = ARGV[3]
    local limit = tonumber(ARGV[4])
    local startCursor = ARGV[5]
    local useJobName = ARGV[2] ~= ""
    local useSearchData = ARGV[3] ~= ""
    
    local results = {}
    local count = 0
    local cursor = startCursor
    local hasMore = false
    
    repeat
      local scanResult = redis.call("SCAN", cursor, "MATCH", pattern, "COUNT", 100)
      cursor = scanResult[1]
      local keys = scanResult[2]
      
      for i, key in ipairs(keys) do
        if redis.call("TYPE", key).ok == "hash" then
          local job = redis.call("HGETALL", key)
          local jobData = {}
          
          for j = 1, #job, 2 do
            jobData[job[j]] = job[j+1]
          end
          
          if jobData["name"] and jobData["data"] then
            local match = true
            
            if useJobName and jobData["name"] ~= jobName then
              match = false
            end
            
            if match and useSearchData then
              if not string.find(jobData["data"], searchData, 1, true) then
                match = false
              end
            end
            
            if match then
              count = count + 1
              table.insert(results, key)
              table.insert(results, jobData["name"])
              table.insert(results, jobData["data"])
              table.insert(results, jobData["timestamp"] or "")
              table.insert(results, jobData["processedOn"] or "")
              table.insert(results, jobData["finishedOn"] or "")
              table.insert(results, jobData["progress"] or "0")
              table.insert(results, jobData["opts"] or "{}")
              
              if count >= limit then
                hasMore = cursor ~= "0"
                break
              end
            end
          end
        end
        
        if count >= limit then
          hasMore = cursor ~= "0"
          break
        end
      end
    until cursor == "0" or count >= limit
    
    return {results, cursor, hasMore and 1 or 0}
    `;
    
    this.loadScript();
  }
  
  async loadScript() {
    this.searchScriptSha = await this.redis.script('LOAD', this.searchScript);
  }
  
  /**
   * Search for jobs in BullMQ queue using Lua script with cursor-based pagination
   * @param {Object} options - Search options
   * @param {string} options.name - Optional job name to search for
   * @param {string} options.data - Optional job data to search for (as string)
   * @param {number} options.limit - Maximum number of results
   * @param {string} options.cursor - Cursor for pagination
   * @returns {Promise<PaginationResult<JobData>>} - Paginated results with cursor
   */
  async search(options: SearchOptions = {}): Promise<PaginationResult<JobData>> {
    const { name = "", data = "", limit = 100, cursor = "0" } = options;
    const pattern = `${this.prefix}:${this.queueName}:*`;
    
    // Make sure the script is loaded
    if (!this.searchScriptSha) {
      await this.loadScript();
    }
    
    // Convert data object to string if needed
    const searchData = typeof data === 'object' ? JSON.stringify(data) : data;
    
    // Execute the Lua script
    const [resultsArray, nextCursor, hasMoreInt] = await this.redis.evalsha(
      this.searchScriptSha,
      0, // No keys used
      pattern,
      name,
      searchData,
      limit.toString(),
      cursor
    ) as [string[], string, number];
    
    // Process and format results
    const formattedResults: JobData[] = [];
    for (let i = 0; i < resultsArray.length; i += 8) {
      const key = resultsArray[i];
      const jobId = key.split(':').pop() || '';
      
      let jobData;
      try {
        jobData = JSON.parse(resultsArray[i + 2]);
      } catch (err) {
        jobData = resultsArray[i + 2];
      }
      
      let opts = {};
      try {
        opts = JSON.parse(resultsArray[i + 7]);
      } catch (err) {
        // Skip if opts can't be parsed
      }
      
      formattedResults.push({
        id: jobId,
        name: resultsArray[i + 1],
        data: jobData,
        timestamp: resultsArray[i + 3] ? parseInt(resultsArray[i + 3]) : null,
        processedOn: resultsArray[i + 4] ? parseInt(resultsArray[i + 4]) : null,
        finishedOn: resultsArray[i + 5] ? parseInt(resultsArray[i + 5]) : null,
        progress: parseInt(resultsArray[i + 6] || '0'),
        opts
      });
    }
    
    return {
      items: formattedResults,
      nextCursor: nextCursor,
      hasMore: Boolean(hasMoreInt)
    };
  }
  
  /**
   * Search by job name with pagination
   */
  async searchByName(name: string, options: PaginationOptions = {}): Promise<PaginationResult<JobData>> {
    const { limit = 100, cursor = "0" } = options;
    return this.search({ name, limit, cursor });
  }
  
  /**
   * Search by job data with pagination
   */
  async searchByData(data: string | Record<string, any>, options: PaginationOptions = {}): Promise<PaginationResult<JobData>> {
    const { limit = 100, cursor = "0" } = options;
    return this.search({ data, limit, cursor });
  }
  
  /**
   * Clean up resources
   */
  async close() {
    await this.redis.quit();
  }
}

// Example usage:
async function example() {
  const search = new BullMQSearch('staging', {
    redis: {
      host: 'localhost',
      port: 6380,
      db: 0,
      password: "",
      tls: {}
    }
  });
  
  // Search by name with pagination
  const firstPage = await search.searchByName('autoScoreQuestion', { limit: 10 });
  console.log('First page jobs:', firstPage.items);
  
  // Get next page if there are more results
  if (firstPage.hasMore && firstPage.nextCursor) {
    const secondPage = await search.searchByName('autoScoreQuestion', { 
      limit: 10, 
      cursor: firstPage.nextCursor 
    });
    console.log('Second page jobs:', secondPage);
  }
  
  // Search by data with pagination
  const dataResults = await search.searchByData('https://candidate.testlify.com/invite/g3U4jDFKy', { limit: 20 });
  console.log('Data search results:', JSON.stringify(dataResults.items, null, 2));
  console.log('Has more results:', dataResults.hasMore);
  
  // Search by both name and data with pagination
//   let currentCursor = "0";
//   let hasMore = true;
//   let total = 0
//   while (hasMore) {
//     const page = await search.search({
//       data: '67ac505f9cff7880e906e7c6',
//       limit: 10,
//       cursor: currentCursor
//     });
    
//     total += page.items.length;
//     console.log(`Page with cursor ${currentCursor}:`, page.items);
    
//     hasMore = page.hasMore;
//     currentCursor = page.nextCursor;
    
//     if (!currentCursor) break;
//   }
//   console.log('Total results:', total);
  // Clean up
  await search.close();
}

example();