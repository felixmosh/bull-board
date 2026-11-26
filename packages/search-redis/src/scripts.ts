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

export const ADVANCE_CHECKPOINT_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current then
  local ms, seq = string.match(ARGV[1], '^(%d+)-(%d+)$')
  local currentMs, currentSeq = string.match(current, '^(%d+)-(%d+)$')
  ms, seq, currentMs, currentSeq = tonumber(ms), tonumber(seq), tonumber(currentMs), tonumber(currentSeq)
  if ms < currentMs or (ms == currentMs and seq <= currentSeq) then return 0 end
end
redis.call('SET', KEYS[1], ARGV[1])
return 1`;

export const SWEEP_RANGE_SCRIPT = `
local function bytesGt(a, b)
  local n = math.min(#a, #b)
  for i = 1, n do
    local x, y = string.byte(a, i), string.byte(b, i)
    if x ~= y then return x > y end
  end
  return #a > #b
end
local all, position, batch = KEYS[1], KEYS[2], tonumber(ARGV[1])
local first = 0
local stored = redis.call('GET', position)
if stored then
  local separator = string.find(stored, ':', 1, true)
  local score, member = string.sub(stored, 1, separator - 1), string.sub(stored, separator + 1)
  local current = redis.call('ZSCORE', all, member)
  if current and tonumber(current) == tonumber(score) then
    first = redis.call('ZRANK', all, member) + 1
  else
    first = nil
    local offset = 0
    while not first do
      local chunk = redis.call('ZRANGEBYSCORE', all, score, '+inf', 'WITHSCORES', 'LIMIT', offset, batch)
      if #chunk == 0 then break end
      for i = 1, #chunk, 2 do
        if tonumber(chunk[i + 1]) > tonumber(score) or bytesGt(chunk[i], member) then
          first = redis.call('ZRANK', all, chunk[i])
          break
        end
      end
      offset = offset + batch
    end
  end
end
local out = {}
if first then out = redis.call('ZRANGE', all, first, first + batch - 1, 'WITHSCORES') end
if #out == 0 then out = redis.call('ZRANGE', all, 0, batch - 1, 'WITHSCORES') end
return out`;
