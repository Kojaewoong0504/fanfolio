import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs'
import { createGzip } from 'node:zlib'
import { basename, join } from 'node:path'
import { pipeline } from 'node:stream/promises'

const distDir = join(process.cwd(), 'dist')
const assetsDir = join(distDir, 'assets')

if (!existsSync(assetsDir)) {
  console.error('performance budget: frontend/dist is missing; run npm run build first')
  process.exit(1)
}

const files = readdirSync(assetsDir).map(name => join(assetsDir, name))
const entry = files.find(file => /^index-[^/]+\.js$/.test(basename(file)))
const css = files.find(file => /^index-[^/]+\.css$/.test(basename(file)))
const imageFiles = files.filter(file => /\.(png|jpe?g|webp|avif)$/i.test(file))

async function gzipBytes(file) {
  let total = 0
  const sink = new (await import('node:stream')).Writable({
    write(chunk, encoding, callback) {
      total += Buffer.byteLength(chunk, encoding)
      callback()
    },
  })
  await pipeline(createReadStream(file), createGzip({ level: 9 }), sink)
  return total
}

const entryGzip = entry ? await gzipBytes(entry) : Number.POSITIVE_INFINITY
const cssGzip = css ? await gzipBytes(css) : Number.POSITIVE_INFINITY
const largestImage = imageFiles.reduce((largest, file) => {
  const size = statSync(file).size
  return size > largest.size ? { file, size } : largest
}, { file: '', size: 0 })

const budgets = {
  // Keep a small safety margin around the current entry while the larger
  // image and route-loading budgets provide the measurable improvement gate.
  entryGzip: 132 * 1024,
  cssGzip: 48 * 1024,
  largestImage: 500 * 1024,
}
const measurements = {
  entryGzip,
  cssGzip,
  largestImage: largestImage.size,
}
const failures = []
if (entryGzip > budgets.entryGzip) failures.push(`entry JS gzip ${entryGzip} > ${budgets.entryGzip}`)
if (cssGzip > budgets.cssGzip) failures.push(`entry CSS gzip ${cssGzip} > ${budgets.cssGzip}`)
if (largestImage.size > budgets.largestImage) failures.push(`largest image ${largestImage.size} > ${budgets.largestImage}`)

console.log(JSON.stringify({ budgets, measurements, largestImage: basename(largestImage.file) }, null, 2))
if (failures.length > 0) {
  console.error(`performance budget failed: ${failures.join('; ')}`)
  process.exit(1)
}
console.log('performance budget passed')
