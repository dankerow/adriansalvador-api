import { Route } from '../structures'
import { filesize } from 'filesize'

export default class Albums extends Route {
  constructor() {
    super({
      position: 2,
      path: '/albums',
      middlewares: ['auth']
    })
  }

  routes(app, options, done) {
    const getAlbum = async (req, reply) => {
      if (!req.params.id) return reply.code(404).send({ error: { status: 404, message: 'Album not found' } })

      const album = await app.database.getAlbumById(req.params.id)

      if (!album) return reply.code(404).send({ error: { status: 404, message: 'Album not found' } })

      return req.album = album
    }

    app.get('/', {
      config: {
        auth: false
      },
      schema: {
        querystring: {
          type: 'object',
          properties: {
            search: { type: 'string' },
            sort: { type: 'string' },
            order: { type: 'string' },
            page: { type: 'number' },
            limit: { type: 'number' }
          }
        }
      }
    }, async (req) => {
      const page = req.query.page ? parseInt(req.query.page) : 1
      const limit = req.query.limit ? parseInt(req.query.limit) : 25

      const params = {
        search: req.query.search ?? null,
        sort: req.query.sort ?? { lowerName: 1 },
        order: req.query.order ?? 'asc',
        limit,
        skip: (page - 1) * limit
      }

      const albums = await app.database.getAlbums(params)
      const count = await app.database.getAlbumCount()
      const pages = (albumCount) => Math.ceil(albumCount / limit)

      for (const album of albums) {
        album.fileCount = (await app.database.getAlbumFileCount(album.id))?.count ?? 0
      }

      return {
        data: albums,
        count,
        pages: pages(count)
      }
    })

    app.get('/:id', {
      config: {
        auth: false
      },
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' }
          }
        }
      },
      preHandler: [getAlbum]
    }, async (req) => {
      req.album.fileCount = (await app.database.getAlbumFileCount(req.album.id))?.count ?? 0

      return req.album
    })

    app.get('/:id/images', {
      config: {
        auth: false
      },
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
            page: { type: 'number' },
            limit: { type: 'number' }
          }
        }
      },
      preHandler: [getAlbum]
    }, async (req) => {
      const page = req.query.page ? parseInt(req.query.page) : 1
      const limit = req.query.limit ? parseInt(req.query.limit) : 25
      const pages = (imageCount) => Math.ceil(imageCount / limit)

      let images = await app.database.getAlbumFiles(req.album.id)
      const count = images.length

      if (limit !== -1) { // -1 means no limit
        images = images.slice((page - 1) * limit, page * limit)
      }

      for (const image of images) {
        image.size = filesize(image.size)
      }

      return {
        data: images,
        count: count,
        pages: pages(count)
      }
    })

    app.get('/favorites', {
      config: {
        auth: false
      }
    }, async () => {
      const favoriteAlbums = await app.database.getAlbums({ favorite: true })
      const featuredAlbum = await app.database.getAlbums({ featured: true })

      const albums = [...favoriteAlbums, ...featuredAlbum]
      const count = albums.length

      return {
        data: albums,
        count: count
      }
    })

    done()
  }
}
