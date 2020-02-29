import { Dockest, logLevel } from 'dockest'

const { run } = new Dockest({
  dumpErrors: true,
  jestLib: require('jest'),
  logLevel: logLevel.DEBUG,
})

run([
  {
    serviceName: 'redis',
    healthcheck: async ({ defaultHealthchecks: { redis } }) => {
      await redis()
    },
  },
])
