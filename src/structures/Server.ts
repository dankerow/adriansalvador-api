import type { FastifyInstance } from 'fastify'
import type { Route } from './Route'

import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdir, stat } from 'node:fs/promises'

import Fastify from 'fastify'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import sentry from '@immobiliarelabs/fastify-sentry'
import * as jwt from 'jsonwebtoken'

import { Database } from '@/managers'
import { Logger as logger } from '@/utils'

const __dirname = dirname(fileURLToPath(import.meta.url))

export class Server {
  public app: FastifyInstance
  private readonly routers: Array<Route>
  public logger: logger
  public database: Database

  constructor() {
    this.app = Fastify({
      ignoreTrailingSlash: true,
      trustProxy: true,
      logger: true
    })

    this.routers = []
    this.logger = logger
    this.database = new Database()
  }

  /**
   * @description Sets up the application by registering middleware, error handler, and initializing the database.
   * @returns {Promise<void>} A promise that resolves when the setup is complete.
   */
  public async setup(): Promise<void> {
    await this.app.register(helmet, {
      crossOriginResourcePolicy: false
    })

    const mainAppBaseURL = process.env.NODE_ENV === 'production' ? process.env.MAIN_APP_BASE_URL : process.env.MAIN_APP_BASE_URL_DEV
    const manageAppBaseURL = process.env.NODE_ENV === 'production' ? process.env.MANAGE_APP_BASE_URL : process.env.MANAGE_APP_BASE_URL_DEV
    const cdnBaseURL = process.env.NODE_ENV === 'production' ? process.env.CDN_BASE_URL : process.env.CDN_BASE_URL_DEV

    await this.app.register(cors, {
      origin: [mainAppBaseURL, manageAppBaseURL, cdnBaseURL]
    })

    await this.app.register(rateLimit,
      {
        global: true,
        ban: 3,
        max: 100,
        keyGenerator: (req) => {
          if (req.headers.authorization) {
            const token = req.headers.authorization.split(' ')[1]
            try {
              const decoded = jwt.verify(token, process.env.JWT_SECRET) as { id: string }

              return decoded.id
            } catch (err) {
              return req.ip
            }
          }

          return req.ip
        },
        errorResponseBuilder: () => ({ status: 429, message: 'Too many requests, please you need to slow down, try again later.' })
      })

    this.app.setErrorHandler((error, _req, reply) => {
      logger.error(`Something went wrong.\nError: ${error.stack || error}`)

      reply.code(error.statusCode).send({
        error: {
          status: error.statusCode,
          message: error.message ?? 'Oops! Something went wrong. Try again later.'
        }
      })
    })

    await this.app.register(sentry, {
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 1.0
    })

    await this.initializeDatabase()
  }

  /**
   * @description A method to create a connection to the database
   * @private
   * @returns Promise<void>
   */
  private async initializeDatabase(): Promise<void> {
    await this.database.connect()
    this.app.decorate('database', this.database)

    this.app.addHook('onClose', async (_instance, done) => {
      await this.database.close()
      done()
    })

    process.send({ type: 'log', content: 'Successfully connected to database.' })

    await this.loadRoutes(join('src', 'routes'))
  }

  /**
   * @description Loads the routes on the HTTP Server instance
   * @param directory The path to the routes directory
   * @param prefix Prefix used load the routes following the file structure
   * @returns Promise<void>
   * @private
   */
  private async loadRoutes(directory: string, prefix: string | boolean = false): Promise<void> {
    const routes = await readdir(directory)

    for (const route of routes) {
      const stats = await stat(join(directory, route))

      if (stats.isDirectory()) {
        await this.loadRoutes(join(directory, route), route.replace('/', ''))

        continue
      }

      const routeFile = relative(__dirname, join(directory, route)).replaceAll('\\', '/')
      const routeImport = await import(routeFile)
      const RouteClass = routeImport.default
      const routeInstance = new RouteClass(this)

      if (prefix) {
        routeInstance.path = `/${prefix}${routeInstance.path}`
      }

      this.routers.push(routeInstance)
    }

    if (this.routers.length > 0) {
      await this.registerRoutes()
    } else {
      this.listen()
    }
  }

  /**
   * @description Loads the specified middlewares dynamically.
   * @param {string[]} middlewares - The names of the middlewares to load.
   * @return {Promise<any[]>} - A promise that resolves with an array of imported middlewares.
   */
  private async loadMiddlewares(middlewares: string[]): Promise<any[]> {
    const importedMiddlewares = []

    for (const middleware of middlewares) {
      const importedMiddlewarePath = relative(__dirname, join('src', 'middlewares', middleware)).replaceAll('\\', '/')
      const importedMiddleware = await import(importedMiddlewarePath)
      importedMiddlewares.push(importedMiddleware.default)
    }

    return importedMiddlewares
  }

  /**
   * @description Registers the routes on the Fastify instance
   * @private
   * @returns void
   */
  private async registerRoutes(): Promise<void> {
    this.routers.sort((a, b) => a.position - b.position)

    for (const router of this.routers) {
      const middlewares = router.middlewares?.length ? await this.loadMiddlewares(router.middlewares) : []

      await this.app.register((app, options, done) => {
        app.addHook('onRoute', (routeOptions) => {
          if (routeOptions.config && routeOptions.config.auth === false) return

          routeOptions.preHandler = [...(routeOptions.preHandler || []), ...middlewares]

          return
        })

        router.routes(app, options, done)
      }, { prefix: router.path })
    }

    process.send({ type: 'log', content: `Loaded ${this.routers.length} routes.` })

    this.listen()
  }

  /**
   * @description Listens for incoming requests on the specified port.
   * @return {void}
   */
  private listen(): void {
    this.app.listen({ port: parseInt(process.env.PORT) }, (error, address) => {
      if (error) return process.send({ type: 'error', content: error.stack || error })
      return process.send({ type: 'log', content: `Running on ${address}` })
    })
  }
}
