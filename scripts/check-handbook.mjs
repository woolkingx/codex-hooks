#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2] ?? 'docs/handbook'
const index = path.join(root, 'index.html')

const htmlFiles = fs.readdirSync(root)
  .filter(file => file.endsWith('.html'))
  .map(file => path.join(root, file))

const dangling = []
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8')
  for (const href of hrefs(html)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue
    if (href.startsWith('#')) continue
    const [target] = href.split('#')
    const resolved = path.resolve(path.dirname(file), target)
    if (!fs.existsSync(resolved)) dangling.push(`${file} -> ${href}`)
  }
}

if (dangling.length) {
  for (const item of dangling) console.error(`DANGLING ${item}`)
  process.exit(1)
}

const parsed = parseIndex(fs.readFileSync(index, 'utf8'))
console.log(JSON.stringify({ ok: true, files: htmlFiles.length, sections: parsed.sections.length, gates: parsed.gates.length }, null, 2))

function hrefs(html) {
  const out = []
  const re = /href="([^"]+)"/g
  let match
  while ((match = re.exec(html))) out.push(match[1])
  return out
}

function parseIndex(html) {
  const sections = []
  const sectionRe = /<section\s+id="([^"]+)"[\s\S]*?<h2>([\s\S]*?)<\/h2>/g
  let section
  while ((section = sectionRe.exec(html))) {
    sections.push({ id: section[1], title: strip(section[2]) })
  }
  const gates = Array.from(html.matchAll(/GATE-[A-Z0-9-]+/g), match => match[0])
  return { sections, gates }
}

function strip(value) {
  return value.replace(/<[^>]+>/g, '').trim()
}
