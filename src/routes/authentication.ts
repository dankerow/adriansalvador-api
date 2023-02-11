import { Route } from '../structures';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export default class Authentication extends Route {
  constructor() {
    super({
      position: 2,
      path: '/authentication'
    })
  }

  async routes(app, opts, done) {
    const createToken = (user) => {
      return jwt.sign({
        iss: 'adriansalvador',
        sub: user.id
      }, process.env.WEBSITE_SECRET, { expiresIn: '2h' })
    }

    app.post('/login', async (req, res) => {
      const email = req.body.email
      const password = req.body.password

      let user = await app.database.getUserByEmail(email)
      if (!user) {
        return res.code(403).send({ error: { statusCode: 403, message: 'Invalid credentials.' } })
      }

      const passwordVerification = await bcrypt.compare(password, user.password)
      if (passwordVerification) {
        const token = createToken({ id: user.id })

        await app.database.updateUserSession(user.id, {
          token
        })

        user = await app.database.getUserById(user.id)

        return { token, user }
      } else {
        return res.code(403).send({ error: { statusCode: 403, message: 'Invalid credentials.' } })
      }
    })

    const authMiddleware = await import('../middlewares/auth.js')

    app.get('/verify', {
      preHandler: [authMiddleware.default]
    }, (req, res) => {
      return req.user
    })

    done()
  }
}
