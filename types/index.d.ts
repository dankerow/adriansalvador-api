import type { Database } from '../src/managers'
import type { Logger } from '../src/utils'

declare module 'fastify' {
  interface FastifyInstance {
    database: Database
    logger: Logger
  }

  interface FastifyContextConfig {
    auth?: boolean
  }
}

export * from './album'
export * from './user'
