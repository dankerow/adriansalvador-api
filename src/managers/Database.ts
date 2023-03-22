import { MongoClient, Db } from 'mongodb';
import { EventEmitter } from 'events';

export class Database extends EventEmitter {
  private client: MongoClient;
  private mongoCDN: Db;
  private mongoUsers: Db;

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

  getUserById(id) {
    return this.mongoUsers
      .collection('metadata')
      .aggregate([
        { $match: { id } },
        { $lookup: { from: 'credentials', localField: 'id', foreignField: 'id', as: 'credentials' } },
        {
          $replaceRoot: { newRoot: { $mergeObjects: [ { $arrayElemAt: [ "$credentials", 0 ] }, "$$ROOT" ] } }
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
          $replaceRoot: { newRoot: { $mergeObjects: [ { $arrayElemAt: [ "$metadata", 0 ] }, "$$ROOT" ] } }
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
        { $addFields: { cover: { $arrayElemAt: ['$cover', 0] } } },
        { $unset: [ '_id', 'cover.id', 'cover.type', 'cover.size' ] }
      ])
      .limit(1)
      .next()
  }

  getAllAlbums() {
    return this.mongoCDN
      .collection('albums')
      .aggregate([
        { $lookup: { from: 'files', localField: 'coverId', foreignField: 'id', as: 'cover' } },
        { $addFields: { cover: { $arrayElemAt: ['$cover', 0] } } },
        { $unset: [ '_id', 'cover.id', 'cover.type', 'cover.size' ] }
      ])
      .limit(-1)
      .next()
  }

  getAlbumsSorted() {
    return this.mongoCDN
      .collection('albums')
      .aggregate([
        { $addFields: { name: { $toLower: '$name' } } },
        { $lookup: { from: 'files', localField: 'coverId', foreignField: 'id', as: 'cover' } },
        { $addFields: { cover: { $arrayElemAt: ['$cover', 0] } } },
        { $unset: [ '_id', 'cover.id', 'cover.type', 'cover.size' ] }
      ],
        {
          collation: {
            locale: 'en_US',
            numericOrdering: true
          }
        })
      .sort({ name: 1 })
      .toArray()
  }

  getAlbumsPaginated(id, skip, limit) {
    return this.mongoCDN
      .collection('albums')
      .aggregate([
        { $match: { $in: [id] } },
      ])
      .skip(skip)
      .limit(limit)
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
        { $sample: { size: limit } }
      ])
      .toArray()
  }

  getAlbumFiles(albumId) {
    return this.mongoCDN
      .collection('files')
      .aggregate([
        { $match: { albumId } },
        { $unset: [ "_id" ] }
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

  getAlbumFilesPaginated(id, skip, limit) {
    return this.mongoCDN
      .collection('files')
      .aggregate([
        { $match: { albumId: { $in: [id] } } },
      ])
      .skip(skip)
      .limit(limit)
      .toArray()
  }

  getFileById(id, includeAlbum = false) {
    const collection = this.mongoCDN.collection('files')

    if (!includeAlbum) return collection.findOne({ id })

    return collection
      .aggregate([
        { $match: { id } },
        { $lookup: { from: 'albums', localField: 'albumId', foreignField: 'id', as: 'album' } },
        { $unset: [ "_id" ] }
      ])
      .limit(1)
      .next()
  }

  findAlbumByName(name) {
    return this.mongoCDN
      .collection('albums')
      .aggregate([
        { $addFields: { name: { $toLower: '$name' } } },
        { $match: { name } }
      ])
      .limit(1)
      .next()
  }

  findFileByName(name) {
    return this.mongoCDN
      .collection('files')
      .aggregate([
        { $addFields: { name: { $toLower: '$name' } } },
        { $match: { name } }
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
}
