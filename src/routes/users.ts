import { Route } from '../structures'
import bcrypt from 'bcrypt';
import dayjs from 'dayjs'
import utcPlugin from 'dayjs/plugin/utc'
dayjs.extend(utcPlugin)

export default class Users extends Route {
  constructor() {
    super({
      position: 1,
      path: '/users'
    });
  }

  async routes(app, options, done) {
    const getUser = async (req, res) => {
      if (req.params.id.length > 100) return res.status(404).send({ status: 404, message: 'The user you are looking for does not exist.' })
      if (req.params.id === '@me' && req.user) {
        return req.user
      }

      const user = await app.database.getUserById(req.params.id)

      if (!user) {
        return res.status(404).send({ status: 404, message: 'The user you are looking for does not exist.' })
      }

      return user
    }

    app.get('/', async (req) => {
      let users = await app.database.getUsersSorted()
      const page = req.query.page ? parseInt(req.query.page) : 1
      const limit = req.query.limit ? parseInt(req.query.limit) : 25
      const pages = (userCount) => Math.ceil(userCount / limit)

      const count = users.length
      users = users.slice((page - 1) * limit, page * limit);

      return {
        data: users,
        count,
        pages: pages(count)
      }
    });

    const authMiddleware = await import('../middlewares/auth.js')

    app.get('/:id', {
      config: { rateLimit: { max: 5, timeWindow: 1000 } },
      preHandler: [authMiddleware.default]
    }, async (req, res) => {
      return await getUser(req, res)
    });

    app.post('/:id/password/update', async (req, res) => {
      const { password, newPassword } = req.body;
      if (!password || !newPassword) return res.status(400).send({ message: 'Invalid body provided' })
      if (password === newPassword) return res.status(400).send({ message: 'Passwords have to be different' })

      const user = await app.database.getUserWithFields(req.user.id, ['password'])

      const comparePassword = await bcrypt.compare(password, user?.password ?? '')
      if (!comparePassword) return res.status(401).send({ message: 'Current password is incorrect' })

      if (newPassword.length < 6 || newPassword.length > 64) {
        return res.status(400).send({ message: 'Password must have 6-64 characters' })
      }

      let hash;
      try {
        hash = await bcrypt.hash(newPassword, 10)
      } catch (err) {
        req.log.error(err)
        return res.status(401).send({ message: 'There was a problem processing your account' })
      }

      const passwordEditedAt = dayjs().utc().toDate()
      await app.database.updateUser(req.user.id,
        {
          password: hash,
          passwordEditedAt
        }
      )

      return { message: 'The password was changed successfully' }
    })

    done()
  }
}
