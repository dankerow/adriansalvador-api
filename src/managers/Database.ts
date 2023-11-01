import type { Album, AlbumFile, User, UserMetadata, UserCredentials } from '../../types'
import type { Db, WithId } from 'mongodb'

import { EventEmitter } from 'node:events'
import { MongoClient } from 'mongodb'

export class Database extends EventEmitter {
  private client: MongoClient
  private mongoCDN: Db
  private mongoUsers: Db

  constructor() {
    super()

    this.client = new MongoClient(process.env.MONGO_URI, { minPoolSize: 12 })
    this.mongoCDN = null
    this.mongoUsers = null
  }

  async connect() {
    await this.client.connect()
      .then(() => {
        this.mongoCDN = this.client.db(process.env.MONGO_CDN_DATABASE)
        this.mongoUsers = this.client.db(process.env.MONGO_USERS_DATABASE)

        this.emit('ready')
      })
      .catch((err) => {
        this.emit('error', err)
      })
  }

  async close(force = false) {
    await this.client.close(force)
  }

  getUserById(id: string): Promise<WithId<Omit<User, 'password'>>> {
    return this.mongoUsers
      .collection('metadata')
      .aggregate([
        { $match: { id } },
        { $lookup: { from: 'credentials', localField: 'id', foreignField: 'id', as: 'credentials' } },
        {
          $replaceRoot: { newRoot: { $mergeObjects: [ { $arrayElemAt: [ '$credentials', 0 ] }, '$$ROOT' ] } }
        },
        { $project: { credentials: 0 } },
        { $unset: [ '_id', 'password' ] }
      ])
      .limit(1)
      .next() as Promise<WithId<Omit<User, 'password'>>>
  }

  getUserByEmail(email: string): Promise<WithId<Omit<User, 'password'>>> {
    return this.mongoUsers
      .collection('credentials')
      .aggregate([
        { $match: { email } },
        { $lookup: { from: 'metadata', localField: 'id', foreignField: 'id', as: 'metadata' } },
        {
          $replaceRoot: { newRoot: { $mergeObjects: [ { $arrayElemAt: [ '$metadata', 0 ] }, '$$ROOT' ] } }
        },
        { $project: { metadata: 0 } },
        { $unset: [ '_id', 'password' ] }
      ])
      .limit(1)
      .next() as Promise<WithId<Omit<User, 'password'>>>
  }

  getUserCredentials(id: string): Promise<WithId<UserCredentials>> {
    return this.mongoUsers
      .collection('credentials')
      .aggregate([
        { $match: { id } },
        { $unset: [ '_id' ] }
      ])
      .limit(1)
      .next() as Promise<WithId<UserCredentials>>
  }

  getUsersSorted(): Promise<WithId<UserMetadata>[]> {
    return this.mongoUsers
      .collection('metadata')
      .aggregate([
        { $addFields: { lowerName: { $toLower: '$firstName' } } }
      ])
      .sort({ firstName: 1 })
      .toArray() as Promise<WithId<UserMetadata>[]>
  }

  getAlbumById(id: string): Promise<Album> {
    return this.mongoCDN
      .collection('albums')
      .aggregate([
        { $match: { id } },
        { $lookup: { from: 'files', localField: 'coverId', foreignField: 'id', as: 'cover' } },
        { $lookup: { from: 'files', localField: 'coverFallbackId', foreignField: 'id', as: 'coverFallback' } },
        { $addFields: { cover: { $arrayElemAt: ['$cover', 0] } } },
        { $addFields: { coverFallback: { $arrayElemAt: ['$coverFallback', 0] } } },
        { $unset: [ 'cover._id', 'cover.albumId', 'coverFallback._id', 'coverFallback.albumId' ] },
        { $project: { _id: 0 } }
      ])
      .limit(1)
      .next() as Promise<Album>
  }

  getAlbums(params: { status?: string; favorites?: boolean; featured?: boolean; search?: string; sort?: string; order?: string; skip?: number; limit?: number } = {}) {
    const aggregation = []

    if (params.status && params.status !== 'all') {
      aggregation.push({ $match: { draft: params.status === 'draft' ?? params.status !== 'posted' } })
    }

    if (params.favorites) aggregation.push({ $match: { favorite: true } })
    if (params.featured) aggregation.push({ $match: { featured: true } })

    if (params.search) aggregation.push({ $match: { name: { $regex: params.search, $options: 'i' } } })
    if (params.sort) aggregation.push({ $addFields: { lowerName: { $toLower: '$name' } } }, { $sort: { [params.sort]: params.order === 'asc' ? 1 : -1 } })
    if (params.skip) aggregation.push({ $skip: params.skip })
    if (params.limit) aggregation.push({ $limit: params.limit })

    return this.mongoCDN
      .collection('albums')
      .aggregate([
        ...aggregation,
        { $lookup: { from: 'files', localField: 'coverId', foreignField: 'id', as: 'cover' } },
        { $lookup: { from: 'files', localField: 'coverFallbackId', foreignField: 'id', as: 'coverFallback' } },
        { $addFields: { cover: { $arrayElemAt: ['$cover', 0] } } },
        { $addFields: { coverFallback: { $arrayElemAt: ['$coverFallback', 0] } } },
        { $unset: [ 'cover._id', 'cover.albumId', 'coverFallback._id', 'coverFallback.albumId' ] },
        { $project: { _id: 0, lowerName: 0 } }
      ], {
        collation: {
          locale: 'en_US',
          numericOrdering: true
        }
      })
      .toArray() as Promise<WithId<Album>[]>
  }

  getAlbumCount(): Promise<number> {
    return this.mongoCDN
      .collection('albums')
      .countDocuments()
  }

  getRandomAlbumsImages(limit: number): Promise<WithId<AlbumFile>[]> {
    return this.mongoCDN
      .collection('files')
      .aggregate([
        { $match: { albumId: { $ne: null } } },
        { $sample: { size: limit } },
        { $lookup: { from: 'albums', localField: 'albumId', foreignField: 'id', as: 'album' } },
        { $addFields: { album: { $arrayElemAt: ['$album', 0] } } },
        { $project: { _id: 0 } }
      ])
      .toArray() as Promise<WithId<AlbumFile>[]>
  }

  getAlbumFiles(albumId: string): Promise<WithId<AlbumFile>[]> {
    return this.mongoCDN
      .collection('files')
      .aggregate([
        { $match: { albumId } },
        { $project: { _id: 0 } }
      ])
      .toArray() as Promise<WithId<AlbumFile>[]>
  }

  getAlbumFileCount(albumId: string) {
    return this.mongoCDN
      .collection('files')
      .aggregate([
        { $match: { albumId } },
        { $count: 'count' }
      ])
      .limit(1)
      .next()
  }

  getAlbumFilesWithFields(id: string, fields: string[]) {
    const project = {}

    for (let i = 0; i < fields.length; i++) {
      project[fields[i]] = '$' + fields[i]
    }

    return this.mongoCDN
      .collection('files')
      .aggregate([
        { $match: { albumId: { $in: [id] } } },
        { $project: { _id: 0, ...project } }
      ])
      .toArray()
  }

  getFiles(params: { search?: string; sort?: string; order?: string; skip?: number; limit?: number } = {}): Promise<WithId<AlbumFile>[]> {
    const aggregation = []

    if (params.search) aggregation.push({ $match: { name: { $regex: params.search, $options: 'i' } } })
    if (params.sort) aggregation.push({ $addFields: { lowerName: { $toLower: '$name' } } }, { $sort: { [params.sort]: params.order === 'asc' ? 1 : -1 } })
    if (params.skip) aggregation.push({ $skip: params.skip })
    if (params.limit) aggregation.push({ $limit: params.limit })

    return this.mongoCDN
      .collection('files')
      .aggregate([
        ...aggregation,
        { $project: { _id: 0, lowerName: 0 } }
      ], {
        collation: {
          locale: 'en_US',
          numericOrdering: true
        }
      })
      .toArray() as Promise<WithId<AlbumFile>[]>
  }

  getFileById(id: string, includeAlbum = false): Promise<WithId<AlbumFile>> {
    const collection = this.mongoCDN.collection('files')

    if (!includeAlbum) return collection.findOne({ id }) as Promise<WithId<AlbumFile>>

    return collection
      .aggregate([
        { $match: { id } },
        { $lookup: { from: 'albums', localField: 'albumId', foreignField: 'id', as: 'album' } },
        { $addFields: { album: { $arrayElemAt: ['$album', 0] } } },
        { $project: { _id: 0 } }
      ])
      .limit(1)
      .next() as Promise<WithId<AlbumFile>>
  }

  getFileCount(): Promise<number> {
    return this.mongoCDN
      .collection('files')
      .countDocuments()
  }

  findAlbumByName(name: string): Promise<WithId<Album>> {
    return this.mongoCDN
      .collection('albums')
      .aggregate([
        { $addFields: { lowerName: { $toLower: '$name' } } },
        { $match: { lowerName: name } },
        { $lookup: { from: 'files', localField: 'coverId', foreignField: 'id', as: 'cover' } },
        { $lookup: { from: 'files', localField: 'coverFallbackId', foreignField: 'id', as: 'coverFallback' } },
        { $addFields: { cover: { $arrayElemAt: ['$cover', 0] } } },
        { $addFields: { coverFallback: { $arrayElemAt: ['$coverFallback', 0] } } },
        { $unset: [ 'cover._id', 'cover.albumId', 'coverFallback._id', 'coverFallback.albumId' ] },
        { $project: { _id: 0, lowerName: 0 } }
      ])
      .limit(1)
      .next() as Promise<WithId<Album>>
  }

  findFileByName(name: string) {
    return this.mongoCDN
      .collection('files')
      .aggregate([
        { $addFields: { lowerName: { $toLower: '$name' } } },
        { $match: { lowerName: name } },
        { $lookup: { from: 'albums', localField: 'albumId', foreignField: 'id', as: 'album' } },
        { $addFields: { album: { $arrayElemAt: ['$album', 0] } } },
        { $project: { _id: 0, lowerName: 0 } }
      ])
      .limit(1)
      .next()
  }

  insertUserMetadata(document: UserMetadata) {
    return this.mongoUsers
      .collection('metadata')
      .insertOne(document)
  }

  insertUserCredentials(document: UserCredentials) {
    return this.mongoUsers
      .collection('credentials')
      .insertOne(document)
  }

  insertAlbum(document: Album) {
    return this.mongoCDN
      .collection('albums')
      .insertOne(document)
  }

  insertFile(document: AlbumFile) {
    return this.mongoCDN
      .collection('files')
      .insertOne(document)
  }

  updateUserSession(id: string, fields: object) {
    return this.mongoUsers
      .collection('sessions')
      .updateOne({ id }, { $set: fields })
  }

  updateAlbum(id: string, fields: Omit<Partial<Album>, 'id' | 'createdAt'>) {
    return this.mongoCDN
      .collection('albums')
      .updateOne({ id }, { $set: fields })
  }

  updateFile(id: string, fields: Omit<Partial<AlbumFile>, 'id' | 'createdAt'>) {
    return this.mongoCDN
      .collection('files')
      .updateOne({ id }, { $set: fields })
  }

  deleteAlbum(id: string) {
    return this.mongoCDN
      .collection('albums')
      .deleteOne({ id })
  }

  deleteAlbums(ids: string[]) {
    return this.mongoCDN
      .collection('albums')
      .deleteMany({ id: { $in: ids } })
  }

  deleteAlbumFiles(albumId: string) {
    return this.mongoCDN
      .collection('files')
      .deleteMany({ albumId })
  }

  deleteFile(id: string) {
    return this.mongoCDN
      .collection('files')
      .deleteOne({ id })
  }

  deleteFiles(ids: string[]) {
    return this.mongoCDN
      .collection('files')
      .deleteMany({ id: { $in: ids } })
  }
}
