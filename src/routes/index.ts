import { Route } from '../structures'

export default class Index extends Route {
  constructor() {
    super({
      position: 1,
      path: '/'
    })
  }

  routes(app, options, done) {
    app.get('/', async (req, reply) => {
      reply.code(200)
    })

    done()
  }
}
