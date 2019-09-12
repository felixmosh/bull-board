import React from 'react'
import { isEmpty } from 'ramda'
import formatBytes from 'pretty-bytes'

function RedisLogo({ width = 32 }) {
  return (
    <svg
      width={width}
      role="img"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#dde"
        d="M23.99414 14.34005c-.01.229-.313.485-.935.81-1.281.667-7.916 3.396-9.328 4.132-1.413.736-2.197.729-3.313.195-1.116-.533-8.176-3.386-9.448-3.993-.635-.304-.959-.56-.97-.802v2.426c0 .242.334.499.97.803 1.272.608 8.333 3.46 9.448 3.993 1.116.534 1.9.541 3.313-.196 1.412-.736 8.047-3.464 9.328-4.132.651-.339.939-.603.939-.842 0-.226.001-2.392.001-2.392-.001-.001-.004-.001-.005-.002z"
      />
      <path
        fill="#bbc"
        d="M23.99314 10.38505c-.011.229-.313.484-.934.809-1.281.667-7.916 3.396-9.328 4.132-1.413.736-2.197.729-3.313.196-1.116-.533-8.176-3.386-9.448-3.994-.635-.303-.959-.56-.97-.801v2.426c0 .242.334.498.97.802 1.272.608 8.332 3.46 9.448 3.993 1.116.534 1.9.541 3.313-.195 1.412-.736 8.047-3.465 9.328-4.132.651-.34.939-.604.939-.843 0-.226.001-2.392.001-2.392-.001-.001-.004 0-.006-.001z"
      />
      <path
        fill="#99a"
        d="M23.99314 6.28305c.012-.244-.307-.458-.949-.694-1.248-.457-7.843-3.082-9.106-3.545-1.263-.462-1.777-.443-3.261.089-1.484.533-8.506 3.287-9.755 3.776-.625.246-.931.473-.92.715v2.426c0 .242.334.498.97.802 1.272.608 8.332 3.461 9.448 3.994 1.116.533 1.9.54 3.313-.196 1.412-.736 8.047-3.465 9.328-4.132.651-.34.939-.604.939-.843 0-.225.001-2.392.001-2.392h-.008zm-15.399 2.296l5.561-.854-1.68 2.463-3.881-1.609zm12.299-2.218l-3.288 1.299-.357.14-3.287-1.299 3.642-1.44 3.29 1.3zm-9.655-2.383l-.538-.992 1.678.656 1.582-.518-.428 1.025 1.612.604-2.079.216-.466 1.12-.752-1.249-2.401-.216 1.792-.646zm-4.143 1.399c1.642 0 2.972.516 2.972 1.152 0 .636-1.331 1.152-2.972 1.152s-2.973-.517-2.973-1.152c0-.636 1.331-1.152 2.973-1.152z"
      />
    </svg>
  )
}

function getMemoryUsage(used_memory, total_system_memory) {
  if (!total_system_memory) {
    return formatBytes(parseInt(used_memory))
  }

  return `${((used_memory / total_system_memory) * 100).toFixed(2)}%`
}

export default function RedisStats({ stats }) {
  if (isEmpty(stats)) {
    return 'No stats to display'
  }

  const {
    redis_version,
    used_memory,
    total_system_memory,
    mem_fragmentation_ratio,
    connected_clients,
    blocked_clients,
  } = stats

  return (
    <section className="row" style={{ padding: 20 }}>
      <div className="box">
        <RedisLogo width={42} />
      </div>

      <div className="box">
        Version
        <h2>{redis_version}</h2>
      </div>

      <div className="box">
        Memory usage
        <h2>{getMemoryUsage(used_memory, total_system_memory)}</h2>
        {Boolean(total_system_memory) ? (
          <small>
            {formatBytes(parseInt(used_memory))} of{' '}
            {formatBytes(parseInt(total_system_memory))}
          </small>
        ) : (
          <small className="error">
            Could not retrieve total_system_memory
          </small>
        )}
      </div>

      <div className="box">
        Fragmentation ratio
        <h2>{mem_fragmentation_ratio}</h2>
      </div>

      <div className="box">
        Connected clients
        <h2>{connected_clients}</h2>
      </div>

      <div className="box">
        Blocked clients
        <h2>{blocked_clients}</h2>
      </div>
    </section>
  )
}
