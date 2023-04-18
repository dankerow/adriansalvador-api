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
    app.get('/', {
      config: {
        auth: false
      }
    }, async (req) => {
      const page = req.query.page ? parseInt(req.query.page) : 1
      const limit = req.query.limit ? parseInt(req.query.limit) : 25

      const params = {
        search: req.query.search ?? null,
        sort: req.query.sort ?? { name: 1 },
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
      }
    }, async (req, reply) => {
      if (!req.params.id) return reply.code(404).send({ error: { status: 404, message: 'Album not found' } })

      const album = await app.database.getAlbumById(req.params.id)
      console.log(album)

      if (!album) return reply.code(404).send({ error: { status: 404, message: 'Album not found' } })

      album.fileCount = (await app.database.getAlbumFileCount(album.id))?.count ?? 0

      return album
    })

    app.get('/:id/images', {
      config: {
        auth: false
      }
    }, async (req, reply) => {
      if (!req.params.id) return reply.code(404).send({ error: { status: 404, message: 'Album not found' } })

      const album = await app.database.getAlbumById(req.params.id)

      if (!album) return reply.code(404).send({ error: { status: 404, message: 'Album not found' } })

      const page = req.query.page ? parseInt(req.query.page) : 1
      const limit = req.query.limit ? parseInt(req.query.limit) : 25
      const pages = (imageCount) => Math.ceil(imageCount / limit)

      let images = await app.database.getAlbumFiles(album.id)
      const count = images.length

      if (limit !== -1) { // -1 means no limit
        images = images.slice((page - 1) * limit, page * limit)
      }

      for (const image of images) {
        const host = process.env.NODE_ENV === 'production' ? process.env.CDN_BASE_URL : process.env.CDN_BASE_URL_DEV

        image.size = filesize(image.size)

        image.thumb = {
          sizes: {
            square: {
              url: `${host}/images/${image.name}`,
              width: 64,
              height: 64
            }
          }
        }
      }

      return {
        data: images,
        count: count,
        pages: pages(count)
      }
    })

    app.post('/:id/images', async (req, reply) => {
      console.log(req.body)

      reply.code(204)
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
