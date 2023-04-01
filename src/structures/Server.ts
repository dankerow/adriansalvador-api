import { dirname, join, relative } from 'path'
import { fileURLToPath } from 'url'
import { readdir, stat } from 'fs/promises'

import Fastify, { FastifyInstance } from 'fastify'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import sentry from '@immobiliarelabs/fastify-sentry'

import { Database } from '../managers'
import { Logger as logger } from '../utils'
import { Route } from './Route'

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

	public async setup(): Promise<void> {
		await this.app.register(helmet, {
			crossOriginResourcePolicy: false
		})

		await this.app.register(cors, {
			allowedHeaders: ['Accept', 'Origin', 'Authorization', 'Cache-Control', 'X-Requested-With', 'Content-Type', 'finishedChunks'],
			methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH']
		})

		await this.app.register(rateLimit,
			{
				global: true,
				ban: 3,
				max: 100,
				keyGenerator: (req) => req.headers.authorization || req.ip,
				errorResponseBuilder: () => ({ status: 429, message: 'Too many requests, please you need to slow down, try again later.' })
			})

		this.app.setErrorHandler((error, req, reply) => {
			logger.error(`Something went wrong.\nError: ${error.stack || error}`)

			reply.code(500).send({
				success: false,
				status: 500,
				message: 'Oops! Something went wrong. Try again later.'
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
	 * @returns void
	 */
	private async initializeDatabase(): Promise<void> {
		await this.database.connect()
		this.app.decorate('database', this.database)

		process.send({ type: 'log', content: 'Successfully connected to database.' })

		await this.loadRoutes(join('src', 'routes'))
	}

	/**
	 * @description Loads the routes on the HTTP Server instance
	 * @param directory The path to the routes directory
	 * @param prefix Prefix used load the routes following the file structure
	 * @returns void
	 * @private
	 */
	private async loadRoutes(directory: string, prefix: string | boolean = false): Promise<void> {
		const routes = await readdir(directory)

		if (routes.length > 0) {
			for (let i = 0; i < routes.length; i++) {
				const stats = await stat(join(directory, routes[i]))

				if (stats.isDirectory()) {
					await this.loadRoutes(join(directory, routes[i]), routes[i].replace('/', ''))
					return
				} else {
					const routeFile = relative(__dirname, join(directory, routes[i])).replaceAll('\\', '/')
					const routeImport = await import(routeFile)
					const RouteClass = routeImport.default
					const route = new RouteClass(this)

					if (prefix) {
						route.path = `/${prefix}${route.path}`
					}

					this.routers.push(route)
				}

				if (i + 1 === routes.length) {
					await this.registerRoutes()
				}
			}
		} else {
			this.listen()
		}
	}

	/**
	 * @description Registers the routes on the Fastify instance
	 * @private
	 * @returns void
	 */
	private async registerRoutes(): Promise<void> {
		this.routers.sort((a, b) => {
			if (a.position > b.position) return 1
			if (b.position > a.position) return -1
			return 0
		})

		for (let i = 0; i < this.routers.length; i++) {
			const route = this.routers[i]

			const middlewares = []
			if (route.middlewares?.length) {
				for (const middleware of route.middlewares) {
					const importedMiddlewarePath = relative(__dirname, join('src', 'middlewares', middleware)).replaceAll('\\', '/')
					const importedMiddleware = await import(importedMiddlewarePath)
					middlewares.push(importedMiddleware.default)
				}
			}

			await this.app.register((app, options, done) => {
				app.addHook('onRoute', (routeOptions) => {
					if (routeOptions.config && routeOptions.config.auth === false) return

					routeOptions.preHandler = [...(routeOptions.preHandler || []), ...middlewares]

					return
				})

				this.routers[i].routes(app, options, done)
			}, { prefix: route.path })

			if (i + 1 === this.routers.length) {
				process.send({ type: 'log', content: `Loaded ${this.routers.length} routes.` })

				this.listen()
			}
		}
	}

	private listen(): void {
		this.app.listen({ port: parseInt(process.env.PORT) }, (error, address) => {
			if (error) return process.send({ type: 'error', content: error.stack || error })
			return process.send({ type: 'log', content: `Running on ${address}` })
		});
	}
}
