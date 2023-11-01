export interface UserMetadata {
  readonly id: string
  firstName: string
  lastName: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface UserCredentials {
  readonly id: string
  email: string
  password: string
  readonly createdAt: string
  readonly updatedAt: string
}

export type User = UserMetadata & UserCredentials
