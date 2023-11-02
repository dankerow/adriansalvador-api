export interface UserMetadata {
  readonly id: string
  firstName: string
  lastName: string
  readonly createdAt: number
  readonly modifiedAt: number
}

export interface UserCredentials {
  readonly id: string
  email: string
  password: string
  readonly createdAt: number
  readonly modifiedAt: number
}

export type User = UserMetadata & UserCredentials
