import { Route } from '../structures'
import { filesize } from 'filesize'

export default class Images extends Route {
  constructor() {
    super({
      position: 2,
      path: '/images',
      middlewares: ['auth']
    })
  }

  routes(app, options, done) {
    app.get('/:id', async (req, res) => {
      const includeAlbum = req.query.includeAlbum ?? false
      const file = await app.database.getFileById(req.params.id, includeAlbum)

      if (!file) return res.code(404).send({ error: { status: 404, message: 'File not found.' } })

      return {
        ...file,
        size: filesize(file.size)
      }
    })

    done()
  }
}
