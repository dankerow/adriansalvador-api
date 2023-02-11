import { Route } from '../structures'
import crypto from 'node:crypto'
import { rename, rm } from 'fs/promises'
import { join } from 'path'
import dayjs from 'dayjs'
import { filesize } from 'filesize'
import stringSimilarity from 'string-similarity'

export default class Albums extends Route {
  constructor() {
    super({
      position: 2,
      path: '/albums'
    })
  }

  routes(app, options, done) {
    const getAlbum = async (req, res) => {
      if (!req.params.id) return res.code(404).send({ error: { status: 404, message: 'Album not found' } })

      const album = await app.database.getAlbumById(req.params.id)

      if (!album) return res.code(404).send({ error: { status: 404, message: 'Album not found' } })

      return album
    }

    app.get('/', async (req) => {
      let albums = await app.database.getAlbumsSorted()

      const search = req.query.search ? req.query.search.toLowerCase() : null

      if (search && search.length > 0) {
        albums = albums
          .filter((album) => {
            return album.name.toLowerCase().includes(search)
              || stringSimilarity.compareTwoStrings(album.name, search) > 0.5
          })
        /* .sort((a, b) => {
          if (a.name.toLowerCase() === search && b.name.toLowerCase() !== search) return -Infinity;
          if (a.name.toLowerCase() !== search && b.name.toLowerCase() === search) return Infinity;

          if (a.name.toLowerCase().startsWith(search) && !b.name.toLowerCase().startsWith(search)) return -500;
          if (!a.name.toLowerCase().startsWith(search) && b.name.toLowerCase().startsWith(search)) return 500;

          if (a.name.toLowerCase().includes(search) && !b.name.toLowerCase().includes(search)) return -100;
          if (!a.name.toLowerCase().includes(search) && b.name.toLowerCase().includes(search)) return 100;

          const aSimilarityName = stringSimilarity.compareTwoStrings(a.name, search);
          const bSimilarityUsername = stringSimilarity.compareTwoStrings(a.name, search);

          if (aSimilarityName > 0.5 || bSimilarityUsername > 0.5) {
            if (aSimilarityName > bSimilarityUsername) return Math.abs(aSimilarityName - bSimilarityUsername) * 100;
            if (bSimilarityUsername > aSimilarityName) return Math.abs(bSimilarityUsername - aSimilarityName) * 100;
          }

          return 0;
        }) */
      }

      const page = req.query.page ? parseInt(req.query.page) : 1
      const limit = req.query.limit ? parseInt(req.query.limit) : 25
      const pages = (albumCount) => Math.ceil(albumCount / limit)

      const count = albums.length
      albums = albums.slice((page - 1) * limit, page * limit)

      for (const album of albums) {
        album.url = `/albums/${album.id}`
        album.fileCount = (await app.database.getAlbumFileCount(album.id)).count
        album.createdAt = dayjs(album.createdAt).format('MMM D, YYYY');
        album.modifiedAt = dayjs(album.modifiedAt).format('MMM D, YYYY')
      }

      return {
        data: albums,
        count,
        pages: pages(count)
      }
    });

    app.post('/add', async (req, res) => {
      if (!('name' in req.body)) return res.code(400).send({ error: { status: 400, message: 'Missing "name" field from request body.' } })

      req.body.nsfw = req.body.nsfw ? parseInt(req.body.nsfw) : 0
      req.body.hidden = req.body.hidden ? parseInt(req.body.hidden) : 0

      if (typeof req.body.name !== 'string') return res.code(400).send({ error: { status: 400, message: 'An invalid name was provided. The name must be a string.' } })

      const album = await app.database.findAlbumByName(req.body.name.toLowerCase())
      if (album) return res.code(409).send({ error: { status: 409, message: 'An album with that name already exists.' } })

      await app.database.insertAlbum({
        id: crypto.randomUUID(),
        name: req.body.name,
        nsfw: Boolean(req.body.nsfw),
        hidden: Boolean(req.body.hidden),
        createdAt: +new Date(),
        modifiedAt: +new Date()
      })

      res.code(204)
    });

    app.get('/:id', async (req, res) => {
      const album = await getAlbum(req, res)

      album.fileCount = (await app.database.getAlbumFileCount(album.id)).count
      album.createdAt = dayjs(album.createdAt).format('MMM D, YYYY')
      album.modifiedAt = dayjs(album.modifiedAt).format('MMM D, YYYY')

      const page = req.query.page ? parseInt(req.query.page) : 1
      const limit = req.query.limit ? parseInt(req.query.limit) : 25
      const includeImages = req.query.includeImages ? Boolean(req.query.includeImages) : false
      const pages = (imageCount) => Math.ceil(imageCount / limit)

      if (includeImages) {
        let images = await app.database.getAlbumFiles(album.id)
        const count = images.length
        images = images.slice((page - 1) * limit, page * limit)

        for (const image of images) {
          image.size = filesize(image.size)
          image.createdAt = dayjs(image.createdAt).format('MMM D, YYYY')
          image.modifiedAt = dayjs(image.modifiedAt).format('MMM D, YYYY')

          const host = process.env.NODE_ENV === 'production' ? process.env.CDN_BASE_URL : process.env.CDN_BASE_URL_DEV

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

        album.images = {
          data: images,
          count: count,
          pages: pages(count)
        }
      }

      return album
    });

    app.post('/:id/edit', async (req, res) => {
      const album = await getAlbum(req, res)

      if (!('name' in req.body)) return res.code(400).send({ error: { status: 400, message: 'Missing "name" field from request body.' } })

      req.body.nsfw = req.body.nsfw ? parseInt(req.body.nsfw) : album.nsfw
      req.body.hidden = req.body.hidden ? parseInt(req.body.hidden) : album.hidden

      if (typeof req.body.name !== 'string') return res.code(400).send({ error: { status: 400, message: 'An invalid name was provided. The name must be a string.' } })

      const nameTaken = await app.database.findAlbumByName(req.body.name)
      if (nameTaken) return res.code(400).send({ error: { status: 400, message: 'Album name already taken.' } })

      const entry = {
        name: req.body.name,
        nsfw: Boolean(req.body.nsfw),
        hidden: Boolean(req.body.hidden),
        modifiedAt: +new Date()
      }

      try {
        await app.database.updateAlbum(album.id, entry)

        const oldAlbumPath = join('src', 'static', 'gallery', album.name)
        const newAlbumPath = join('src', 'static', 'gallery', entry.name)

        await rename(oldAlbumPath, newAlbumPath)

        const oldAlbumArchivePath = join('src', 'static', 'archives', `${album.name}.zip`)
        const newAlbumArchivePath = join('src', 'static', 'archives', `${entry.name}.zip`)

        await rename(oldAlbumArchivePath, newAlbumArchivePath)
      } catch (error) {
        app.logger.error(error.stack || error);
        res.code(500).send({ error: { status: 500, message: 'Something went wrong while updating the album in the database.' } })
      }
    });

    app.post('/:id/delete', async (req, res) => {
      const album = await getAlbum(req, res)
      const albumPath = join('src', 'static', 'gallery', album.name)
      const albumArchivePath = join('src', 'static', 'archives', `${album.name}.zip`)

      await app.database.deleteAlbum(req.params.id)
      await app.database.deleteAlbumFiles(req.params.id)

      await rm(albumPath, { force: true, recursive: true })
      await rm(albumArchivePath, { force: true, recursive: true })

      res.code(204)
    });

    done()
  }
}
