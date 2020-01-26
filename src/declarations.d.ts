declare module 'redis-info' {
  export const parse: (
    rawRedisInfo: string,
  ) => {
    // This is not technically true, as metrics can also come as objects
    [metric: string]: string
  }
}
