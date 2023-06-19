import { Route } from '../structures'
import bcrypt from 'bcrypt'
import dayjs from 'dayjs'
import utcPlugin from 'dayjs/plugin/utc'
import crypto from 'node:crypto'
import { generatePassword } from '../utils'
dayjs.extend(utcPlugin)

export default class Users extends Route {
  constructor() {
    super({
      position: 1,
      path: '/users',
      middlewares: ['auth']
    })
  }

  async routes(app, options, done) {
    const getUser = async (req, reply) => {
      if (req.params.id.length > 100) return reply.status(404).send({ status: 404, message: 'The user you are looking for does not exist.' })
      if (req.params.id === '@me' && req.user) {
        return req.user
      }

      const user = await app.database.getUserById(req.params.id)

      if (!user) {
        return reply.status(404).send({ status: 404, message: 'The user you are looking for does not exist.' })
      }

      return req.user = user
    }

    app.get('/', async (req) => {
      let users = await app.database.getUsersSorted()
      const page = req.query.page ? parseInt(req.query.page) : 1
      const limit = req.query.limit ? parseInt(req.query.limit) : 25
      const pages = (userCount) => Math.ceil(userCount / limit)

      const count = users.length
      users = users.slice((page - 1) * limit, page * limit)

      return {
        data: users,
        count,
        pages: pages(count)
      }
    })

    app.post('/', {
      config: { rateLimit: { max: 5, timeWindow: 1000 } }
    }, async (req, reply) => {
      if (!('firstName' in req.body)) return reply.code(400).send({ error: { status: 400, message: 'Missing "lastName" field from request body.' } })
      if (!('lastName' in req.body)) return reply.code(400).send({ error: { status: 400, message: 'Missing "lastName" field from request body.' } })
      if (!('email' in req.body)) return reply.code(400).send({ error: { status: 400, message: 'Missing "email" field from request body.' } })
      // if (!('role' in req.body)) return reply.code(400).send({ error: { status: 400, message: 'Missing "role" field from request body.' } })

      if (typeof req.body.firstName !== 'string') return reply.code(400).send({ error: { status: 400, message: 'An invalid firstName was provided. The firstName must be a string.' } })
      if (typeof req.body.lastName !== 'string') return reply.code(400).send({ error: { status: 400, message: 'An invalid lastName was provided. The lastName must be a string.' } })
      if (typeof req.body.email !== 'string') return reply.code(400).send({ error: { status: 400, message: 'An invalid email was provided. The email must be a string.' } })

      const user = await app.database.getUserByEmail(req.body.email)
      if (user) return reply.code(409).send({ error: { status: 409, message: 'User already created.' } })

      const userId = crypto.randomUUID()

      const metadata = {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        role: req.body.role ?? 'user',
        avatar: '',
        createdAt: +new Date(),
        modifiedAt: +new Date()
      }

      const credentials = {
        email: req.body.email,
        password: generatePassword(16),
        createdAt: +new Date(),
        modifiedAt: +new Date()
      }

      console.warn('Credentials:', credentials.email, credentials.password)

      credentials.password = bcrypt.hashSync(credentials.password, 10)

      await app.database.insertUserMetadata({ id: userId, ...metadata })
      await app.database.insertUserCredentials({ id: userId, ...credentials })

      return { id: userId, ...metadata }
    })

    app.get('/@me', {
      config: {
        rateLimit: { max: 5, timeWindow: 1000 }
      },
      preHandler: [getUser]
    }, async (req) => {
      return req.user
    })

    app.post('/:id/password/update', {
      preHandler: [getUser]
    }, async (req, reply) => {
      const { password, newPassword } = req.body
      if (!password || !newPassword) return reply.status(400).send({ message: 'Invalid body provided' })
      if (password === newPassword) return reply.status(400).send({ message: 'Passwords have to be different' })

      const user = await app.database.getUserWithFields(req.user.id, ['password'])

      const comparePassword = await bcrypt.compare(password, user?.password ?? '')
      if (!comparePassword) return reply.status(401).send({ message: 'Current password is incorrect' })

      if (newPassword.length < 6 || newPassword.length > 64) {
        return reply.status(400).send({ message: 'Password must have 6-64 characters' })
      }

      let hash
      try {
        hash = await bcrypt.hash(newPassword, 10)
      } catch (err) {
        req.log.error(err)
        return reply.status(401).send({ message: 'There was a problem processing your account' })
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
