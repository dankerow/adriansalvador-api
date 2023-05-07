import { Route } from '../structures'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

export default class Authentication extends Route {
  constructor() {
    super({
      position: 2,
      path: '/authentication',
      middlewares: ['auth']
    })
  }

  async routes(app, opts, done) {
    const createToken = (user) => {
      return jwt.sign({
        iss: 'adriansalvador',
        sub: user.id
      }, process.env.AUTH_SECRET, { expiresIn: '3h' })
    }

    app.post('/login', {
      config: {
        auth: false
      },
      schema: {
        body: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            password: { type: 'string' }
          },
          required: ['email', 'password']
        }
      }
    }, async (req, res) => {
      const email = req.body.email
      const password = req.body.password

      const user = await app.database.getUserByEmail(email)
      if (!user) {
        return res.code(403).send({ error: { statusCode: 403, message: 'Invalid credentials.' } })
      }

      const userCredentials = await app.database.getUserCredentials(user.id)

      const passwordVerification = await bcrypt.compare(password, userCredentials.password)
      if (!passwordVerification) {
        return res.code(403).send({ error: { statusCode: 403, message: 'Invalid credentials.' } })
      }

      const token = createToken({ id: user.id })

      /* await app.database.updateUser(user.id, {
        sessionToken: token
      }) */

      return { token, user }
    })

    app.get('/verify', (req) => {
      return req.user
    })

    done()
  }
}
