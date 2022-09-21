import 'dotenv/config'

import { Database } from '../src/managers'

const database = new Database()
await database.connect()

const excluded = ['c10a66f4-4b18-427f-81b5-f6213d38cdc1', '34b7cce4-bb76-4e31-9dd7-3ccde004db6a', '4ac306ea-bcec-41b6-b942-1938296a01d6', 'ac8ae991-fce0-4b2d-8a0b-a3a6395d6f6d', '64fe4ee3-ab8b-4712-bfed-a46fe6ac538d']

const loader = async () => {
  let albums = await database.getAllAlbums()
  for (let album in albums) {
    albums[album].hidden = !excluded.includes(albums[album].id);

    await database.updateAlbum(albums[album].id, { hidden: albums[album].hidden })
    console.log(albums[album].name, `${albums[album].id} - should ${albums[album].hidden ? 'be' : 'not' } hidden.`)
  }
}

await loader()
