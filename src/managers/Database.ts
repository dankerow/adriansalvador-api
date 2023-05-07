import type { Db } from 'mongodb'
import { MongoClient } from 'mongodb'
import { EventEmitter } from 'node:events'

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

  getUserById(id) {
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
      .next()
  }

  getUserByEmail(email) {
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
      .next()
  }

  getUserCredentials(id) {
    return this.mongoUsers
      .collection('credentials')
      .aggregate([
        { $match: { id } },
        { $unset: [ '_id' ] }
      ])
      .limit(1)
      .next()
  }

  getUsersSorted() {
    return this.mongoUsers
      .collection('metadata')
      .aggregate([
        { $addFields: { lowerName: { $toLower: '$firstName' } } }
      ])
      .sort({ firstName: 1 })
      .toArray()
  }

  getAlbumById(id) {
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
      .next()
  }

  getAlbums(params) {
    const aggregation = []
    if (params.favorite) aggregation.push({ $match: { favorite: true } })
    if (params.featured) aggregation.push({ $match: { featured: true } })
    if (params.search) aggregation.push({ $match: { name: { $regex: params.search, $options: 'i' } } })
    if (params.sort) aggregation.push({ $addFields: { lowerName: { $toLower: '$name' } } }, { $sort: params.sort })
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
      .toArray()
  }

  getAlbumCount() {
    return this.mongoCDN
      .collection('albums')
      .countDocuments()
  }

  getRandomImages(limit) {
    return this.mongoCDN
      .collection('files')
      .aggregate([
        { $sample: { size: limit } },
        { $lookup: { from: 'albums', localField: 'albumId', foreignField: 'id', as: 'album' } },
        { $addFields: { album: { $arrayElemAt: ['$album', 0] } } },
        { $project: { _id: 0 } }
      ])
      .toArray()
  }

  getAlbumFiles(albumId) {
    return this.mongoCDN
      .collection('files')
      .aggregate([
        { $match: { albumId } },
        { $project: { _id: 0 } }
      ])
      .toArray()
  }

  getAlbumFileCount(albumId) {
    return this.mongoCDN
      .collection('files')
      .aggregate([
        { $match: { albumId } },
        { $count: 'count' }
      ])
      .limit(1)
      .next()
  }

  getAlbumFilesWithFields(id, fields) {
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

  getFileById(id, includeAlbum = false) {
    const collection = this.mongoCDN.collection('files')

    if (!includeAlbum) return collection.findOne({ id })

    return collection
      .aggregate([
        { $match: { id } },
        { $lookup: { from: 'albums', localField: 'albumId', foreignField: 'id', as: 'album' } },
        { $addFields: { album: { $arrayElemAt: ['$album', 0] } } },
        { $project: { _id: 0 } }
      ])
      .limit(1)
      .next()
  }

  getFileCount() {
    return this.mongoCDN
      .collection('files')
      .countDocuments()
  }

  findAlbumByName(name) {
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
      .next()
  }

  findFileByName(name) {
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

  insertUserMetadata(document) {
    return this.mongoUsers
      .collection('metadata')
      .insertOne(document)
  }

  insertUserCredentials(document) {
    return this.mongoUsers
      .collection('credentials')
      .insertOne(document)
  }

  insertAlbum(document) {
    return this.mongoCDN
      .collection('albums')
      .insertOne(document)
  }

  insertFile(document) {
    return this.mongoCDN
      .collection('files')
      .insertOne(document)
  }

  updateUserSession(id, fields) {
    return this.mongoUsers
      .collection('sessions')
      .updateOne({ id }, { $set: fields })
  }

  updateAlbum(id, fields) {
    return this.mongoCDN
      .collection('albums')
      .updateOne({ id }, { $set: fields })
  }

  updateFile(id, fields) {
    return this.mongoCDN
      .collection('files')
      .updateOne({ id }, { $set: fields })
  }

  deleteAlbum(id) {
    return this.mongoCDN
      .collection('albums')
      .deleteOne({ id })
  }

  deleteAlbums(ids) {
    return this.mongoCDN
      .collection('albums')
      .deleteMany({ id: { $in: ids } })
  }

  deleteAlbumFiles(albumId) {
    return this.mongoCDN
      .collection('files')
      .deleteMany({ albumId })
  }

  deleteFile(id) {
    return this.mongoCDN
      .collection('files')
      .deleteOne({ id })
  }

  deleteFiles(ids) {
    return this.mongoCDN
      .collection('files')
      .deleteMany({ id: { $in: ids } })
  }
}
