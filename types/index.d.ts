import type { Database } from '@/services'
import type { Logger } from '@/utils'
import type { Album } from './album'
import type { User } from './user'

declare module 'fastify' {
  interface FastifyInstance {
    database: Database
    logger: Logger
  }

  interface FastifyContextConfig {
    auth?: boolean
  }

  interface FastifyRequest {
    user?: Omit<User, 'password'>
    album?: Album
  }
}

export * from './album'
export * from './user'
