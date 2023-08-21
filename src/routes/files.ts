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
