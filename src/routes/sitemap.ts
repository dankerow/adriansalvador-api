import { Route } from '../structures'

export default class Sitemap extends Route {
  constructor() {
    super({
      position: 2,
      path: '/sitemap'
    })
  }

  routes(app, options, done) {
    app.get('/', async () => {
      const routes: string[] = []
      const albums = await app.database.getAlbums({ sort: { name: 1 } })

      for (const album of albums) {
        routes.push(`/albums/${album.id}`)
      }

      return routes
    })

    done()
  }
}
