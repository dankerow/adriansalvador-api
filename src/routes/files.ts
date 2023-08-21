import { Route } from '../structures'
import { filesize } from 'filesize'

export default class Files extends Route {
  constructor() {
    super({
      position: 2,
      path: '/files',
      middlewares: ['auth']
    })
  }

  routes(app, _options, done) {
    app.get('/', async (req) => {
      const page = req.query.page ? parseInt(req.query.page) : 1
      const limit = req.query.limit ? parseInt(req.query.limit) : 25

      const params = {
        search: req.query.search ?? null,
        sort: req.query.sort ?? 'lowerName',
        order: req.query.order ?? 'asc',
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

    app.get('/:id', {
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
