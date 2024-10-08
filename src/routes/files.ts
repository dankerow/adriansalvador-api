import type { FastifyInstance, RegisterOptions, DoneFuncWithErrOrRes } from 'fastify'

import { Route } from '@/structures'
import { filesize } from 'filesize'

interface IParams {
  id: string
}

export default class Files extends Route {
  constructor() {
    super({
      position: 2,
      path: '/files',
      middlewares: ['auth']
    })
  }

  routes(app: FastifyInstance, _options: RegisterOptions, done: DoneFuncWithErrOrRes) {
    app.get<{
      Querystring: {
        search?: string
        sort?: 'lowerName' | 'createdAt' | 'modifiedAt'
        order?: 'asc' | 'desc'
        includeAlbum?: boolean
        page?: number
        limit?: number
      }
    }>('/', {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            search: { type: 'string', maxLength: 100 },
            sort: { type: 'string', enum: ['lowerName', 'name', 'size', 'createdAt', 'modifiedAt'] },
            order: { type: 'string', enum: ['asc', 'desc'] },
            includeAlbum: { type: 'boolean' },
            page: { type: 'integer', minimum: 1 },
            limit: { type: 'integer', minimum: -1 }
          }
        }
      }
    }, async (req) => {
      const {
        search = null,
        sort = 'lowerName',
        order = 'asc',
        includeAlbum = false,
        page = 1,
        limit = 25
      } = req.query

      const params = {
        search,
        sort,
        order,
        includeAlbum,
        limit,
        skip: (page - 1) * limit
      }

      const files = await app.database.getFiles(params)
      const count = await app.database.getFileCount()
      const pages = (fileCount: number) => Math.ceil(fileCount / limit)

      return {
        data: files,
        count,
        pages: pages(count)
      }
    })

    app.get<{
      Params: IParams
      Querystring: {
        includeAlbum?: boolean
      }
    }>('/:id', {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' }
          }
        },
        querystring: {
          type: 'object',
          properties: {
            includeAlbum: { type: 'boolean' }
          }
        }
      }
    }, async (req, reply) => {
      const includeAlbum = req.query.includeAlbum ?? false
      const file = await app.database.getFileById(req.params.id, includeAlbum)

      if (!file) return reply.code(404).send({ error: { status: 404, message: 'File not found.' } })

      return {
        ...file,
        size: filesize(file.size)
      }
    })

    app.get('/random', {
      config: {
        auth: false,
        rateLimit: { max: 15, timeWindow: 15 * 1000 }
      }
    }, async () => {
      return await app.database.getRandomAlbumsImages(35)
    })

    done()
  }
}
