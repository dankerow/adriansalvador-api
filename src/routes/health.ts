import { Route } from '../structures'

export default class Health extends Route {
  constructor() {
    super({
      position: 1,
      path: '/health'
    })
  }

  routes(app, options, done) {
    app.get('/', async (req, res) => {
      res.headers('Cache-Control', [
        'private',
        'max-age=0',
        'no-cache',
        'no-store',
        'must-revalidate'
      ].join(', '))

      res.headers('Expires', new Date(Date.now() - 1000).toUTCString())

      return {
        status: 'OK',
        latestCheck: Date.now()
      }
    })

    done()
  }
}
