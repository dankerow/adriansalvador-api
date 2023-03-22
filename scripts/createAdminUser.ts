import 'dotenv/config'
import crypto from 'node:crypto'
import bcrypt from 'bcrypt'

import { Database } from '../src/managers'
import { generatePassword } from "../src/utils"

const database = new Database()
await database.connect()

const loader = async () => {
  const user = await database.getUserByEmail('admin@salvadoradrian.com')
  if (user) return console.log('Admin user already created')

  const userId = crypto.randomUUID()

  const metadata = {
    firstName: 'Admin',
    lastName: 'Admin',
    role: 'admin',
    avatar: '',
    createdAt: +new Date(),
    modifiedAt: +new Date()
  }

  const credentials = {
    email: 'admin@salvadoradrian.com',
    password: generatePassword(16),
    createdAt: +new Date(),
    modifiedAt: +new Date()
  }

  console.log('Credentials:', credentials.email, credentials.password)

  credentials.password = bcrypt.hashSync(credentials.password, 10);

  await database.insertUserMetadata({ id: userId, ...metadata })
  await database.insertUserCredentials({ id: userId, ...credentials })
}

await loader()
