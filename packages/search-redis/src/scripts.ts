export const INDEX_JOB_SCRIPT = `
local jobId, timestamp = ARGV[1], ARGV[2]
local current = {}
for i = 3, #KEYS do current[KEYS[i]] = true end
for _, key in ipairs(redis.call('SMEMBERS', KEYS[1])) do
  if not current[key] then redis.call('ZREM', key, jobId) end
end
redis.call('DEL', KEYS[1])
redis.call('ZADD', KEYS[2], timestamp, jobId)
for i = 3, #KEYS do
  redis.call('ZADD', KEYS[i], timestamp, jobId)
  redis.call('SADD', KEYS[1], KEYS[i])
end
return 1`;

export const REMOVE_JOB_SCRIPT = `
local jobId = ARGV[1]
for _, key in ipairs(redis.call('SMEMBERS', KEYS[1])) do
  redis.call('ZREM', key, jobId)
end
redis.call('ZREM', KEYS[2], jobId)
redis.call('DEL', KEYS[1])
return 1`;

export const PAGE_SCRIPT = `
local function bytesGte(a, b)
  local n = math.min(#a, #b)
  for i = 1, n do
    local x, y = string.byte(a, i), string.byte(b, i)
    if x ~= y then return x > y end
  end
  return #a >= #b
end
local key, want = KEYS[1], tonumber(ARGV[1]) + 1
if ARGV[2] == nil or ARGV[2] == '' then
  return redis.call('ZREVRANGE', key, 0, want - 1, 'WITHSCORES')
end
local cscore, cmember = ARGV[2], ARGV[3]
local rank = redis.call('ZREVRANK', key, cmember)
if rank then
  return redis.call('ZREVRANGE', key, rank + 1, rank + want, 'WITHSCORES')
end
local out, offset, batch = {}, 0, want * 2
while #out < want * 2 do
  local chunk = redis.call('ZREVRANGEBYSCORE', key, cscore, '-inf', 'WITHSCORES', 'LIMIT', offset, batch)
  if #chunk == 0 then break end
  for i = 1, #chunk, 2 do
    local member, score = chunk[i], chunk[i + 1]
    if not (tonumber(score) == tonumber(cscore) and bytesGte(member, cmember)) then
      out[#out + 1] = member
      out[#out + 1] = score
      if #out >= want * 2 then break end
    end
  end
  offset = offset + batch
end
return out`;
