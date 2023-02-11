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
      .findOne({ id })
  }

  getUserByEmail(email) {
    return this.mongoUsers
      .collection('credentials')
      .findOne({ email })
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
      .findOne({ id })
  }

  getAllAlbums() {
    return this.mongoCDN
      .collection('albums')
      .find()
      .toArray()
  }

  getAlbumsSorted() {
    return this.mongoCDN
      .collection('albums')
      .aggregate([
        { $addFields: { name: { $toLower: '$name' } } }
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

  getFile(name, size) {
    return this.mongoCDN
      .collection('files')
      .aggregate([
        { $match: { name, size } },
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
        { $match: { name } }
      ])
      .limit(1)
      .next()
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
}
