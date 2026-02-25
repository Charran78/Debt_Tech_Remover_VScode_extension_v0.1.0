import { promises as fs } from 'fs'
import path from 'path'
import url from 'url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const extRoot = path.join(__dirname, '..')
const projectRoot = path.join(extRoot, '..')
const sourceDir = path.join(projectRoot, 'dist')
const targetDir = path.join(extRoot, 'media')

async function ensureDir(p) {
  try {
    await fs.mkdir(p, { recursive: true })
  } catch { }
}

async function copyDir(src, dest) {
  await ensureDir(dest)
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const e of entries) {
    const s = path.join(src, e.name)
    const d = path.join(dest, e.name)
    if (e.isDirectory()) {
      await copyDir(s, d)
    } else if (e.isFile()) {
      await fs.copyFile(s, d)
    }
  }
}

async function main() {
  await fs.rm(targetDir, { recursive: true, force: true })
  await ensureDir(targetDir)
  await copyDir(sourceDir, targetDir)
  console.log('Media sincronizada desde', sourceDir, 'a', targetDir)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
