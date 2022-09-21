import { Route } from '../structures'

export default class Sitemap extends Route {
  constructor() {
    super({
      position: 2,
      path: '/sitemap'
    });
  }

  routes(app, options, done) {
    app.get('/', async (req, res) => {
      const routes = []
      const albums = await app.database.getAlbumsSorted()

      for (const album of albums) {
        routes.push(`/albums/${album.id}`)
      }

      return routes
    });

    done();
  }
}
