export interface User {
  readonly id: string
  firstName: string
  lastName: string
  email: string
  role: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface AlbumFile {
  id: string
  name: string
  url?: string
  type: string
  extname: string
  size: number
  albumId: string | null
  album?: Album
  metadata: { width: number; height: number }
  createdAt: number
  modifiedAt: number
}

export interface Album {
  id: string
  name: string
  url?: string
  draft: boolean
  hidden: boolean
  nsfw: boolean
  favorite: boolean
  featured: boolean
  coverId: string | null
  cover?: Omit<AlbumFile, | 'albumId' | 'album' | 'createdAt' | 'modifiedAt'>
  coverFallbackId: string | null
  coverFallback?: Omit<AlbumFile, | 'albumId' | 'album' | 'createdAt' | 'modifiedAt'>
  fileCount: number
  images: AlbumFile[]
  postedAt: number | null
  createdAt: number
  modifiedAt: number
}
