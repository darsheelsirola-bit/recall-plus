import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './server/app.js'

const root = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(root, '.env') })

const port = Number(process.env.PORT) || 8787
const app = createApp()

app.listen(port, () => {
  console.log(`Recall Plus API listening on http://localhost:${port}`)
})
