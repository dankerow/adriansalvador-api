import type { ObjectId } from 'mongodb'

export interface UserMetadata {
  readonly _id: ObjectId
  firstName: string
  lastName: string
  readonly createdAt: number
  readonly modifiedAt: number
}

export interface UserCredentials {
  readonly _id: ObjectId
  email: string
  password: string
  readonly createdAt: number
  readonly modifiedAt: number
}

export type User = UserMetadata & UserCredentials
