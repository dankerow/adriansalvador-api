import 'dotenv/config'

import crypto from 'node:crypto'
import bcrypt from 'bcrypt'

import { Database } from '@/services'
import { generatePassword } from '@/utils'

const database = new Database()
await database.connect()

const create = async () => {
  const email = 'admin@salvadoradrian.com'
  const user = await database.getUserByEmail(email)

  if (user) return console.log('Admin user already created.')

  const userId = crypto.randomUUID()

  const currentTime = new Date().getTime()

  const metadata = {
    firstName: 'Admin',
    lastName: '',
    role: 'admin',
    avatar: '',
    createdAt: currentTime,
    modifiedAt: currentTime
  }

  const rawPassword = generatePassword(16)
  const hashedPassword = bcrypt.hashSync(rawPassword, 10)

  const credentials = {
    email: 'admin@salvadoradrian.com',
    password: hashedPassword,
    createdAt: currentTime,
    modifiedAt: currentTime
  }

  console.log('Credentials:', email, rawPassword)

  await database.insertUserMetadata({ id: userId, ...metadata })
  await database.insertUserCredentials({ id: userId, ...credentials })
}

await create()
