const {
  default: Dockest,
  runners: { RedisRunner },
  logLevel,
} = require('dockest')

const redis = new RedisRunner({
  service: 'redis2000',
  image: 'redis:5.0.3',
})

const dockest = new Dockest({
  jest: {
    lib: require('jest'),
    verbose: true,
  },
  opts: {
    logLevel: logLevel.DEBUG,
    runInBand: true,
  },
  runners: [redis],
})

dockest.run()
