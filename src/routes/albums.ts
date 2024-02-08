import type { Album } from '@/types'
import type { FastifyInstance, FastifyReply, FastifyRequest, RegisterOptions, DoneFuncWithErrOrRes } from 'fastify'

import { Route } from '@/structures'
import { filesize } from 'filesize'

interface IParams {
  id: string
}

interface IBody extends Partial<Album> {
  name: string
  description: string
  image?: string
}

export default class Albums extends Route {
  constructor() {
    super({
      position: 2,
      path: '/albums',
      middlewares: ['auth']
    })
  }

  routes(app: FastifyInstance, _options: RegisterOptions, done: DoneFuncWithErrOrRes) {
    app.decorateRequest('album', null)

    const getAlbum = async (req: FastifyRequest<{ Params: IParams; Body: IBody }>, reply: FastifyReply) => {
      if (!req.params.id) {
        return reply.code(404).send({
          error: {
            status: 404,
            message: 'Album not found'
          }
        })
      }

      const album = await app.database.getAlbumById(req.params.id)

      if (!album) {
        return reply.code(404).send({
          error: {
            status: 404,
            message: 'Album not found'
          }
        })
      }

      return req.album = album
    }

    app.get<{
      Querystring: {
        status?: string
        favorites?: boolean
        featured?: boolean
        search?: string
        sort?: string
        order?: 'asc' | 'desc'
        page?: number
        limit?: number
      }
    }>('/', {
      config: {
        auth: false
      },
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['all', 'posted', 'draft'] },
            favorites: { type: 'boolean' },
            featured: { type: 'boolean' },
            search: { type: 'string' },
            sort: { type: 'string' },
            order: { type: 'string', enum: ['asc', 'desc'] },
            page: { type: 'number' },
            limit: { type: 'number' }
          }
        }
      }
    }, async (req) => {
      const page = req.query.page ? parseInt(req.query.page) : 1
      const limit = req.query.limit ? parseInt(req.query.limit) : 25

      const params = {
        status: req.query.status ?? 'posted',
        favorites: req.query.favorites ?? null,
        featured: req.query.featured ?? null,
        search: req.query.search ?? null,
        sort: req.query.sort ?? 'lowerName',
        order: req.query.order ?? 'asc',
        limit,
        skip: (page - 1) * limit
      }

      const albums = await app.database.getAlbums(params)
      const count = await app.database.getAlbumCount()
      const pages = (albumCount: number) => Math.ceil(albumCount / limit)

      for (const album of albums) {
        album.fileCount = (await app.database.getAlbumFileCount(album.id))?.count ?? 0
      }

      return {
        data: albums,
        count,
        pages: pages(count)
      }
    })

    app.get<{
      Params: IParams
      Body: IBody
    }>('/:id', {
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

    app.post<{
      Body: IBody
    }>('/:id/publish', {
      preHandler: [getAlbum]
    }, async (req) => {
      return await app.database.updateAlbum(req.album.id, { draft: false, postedAt: +new Date() })
    })

    app.post<{
      Body: IBody
    }>('/:id/unpublish', {
      preHandler: [getAlbum]
    }, async (req) => {
      return await app.database.updateAlbum(req.album.id, { draft: true, postedAt: null })
    })

    app.get<{
      Params: IParams
      Querystring: {
        page?: number
        limit?: number
      }
      Body: IBody
    }>('/:id/files', {
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
      const pages = (imageCount: number) => Math.ceil(imageCount / limit)

      let files = await app.database.getAlbumFiles(req.album.id)
      const count = files.length

      if (limit !== -1) { // -1 means no limit
        files = files.slice((page - 1) * limit, page * limit)
      }

      for (const file of files) {
        file.size = filesize(file.size)
      }

      return {
        data: files,
        count: count,
        pages: pages(count)
      }
    })

    done()
  }
}
