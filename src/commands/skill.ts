import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { homedir } from 'os'

/** Root of the skills bundled with this package. At runtime cli.js lives in dist/, skills/ is a sibling. */
export function bundledSkillsRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, '..', 'skills')
}

export interface BundledSkill { name: string; skillMd: string }

/** Every subdirectory of the skills root that contains a SKILL.md. `root` is injectable for tests. */
export function listBundledSkills(root: string = bundledSkillsRoot()): BundledSkill[] {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => (d.isDirectory() || d.isSymbolicLink()) && existsSync(join(root, d.name, 'SKILL.md')))
    .map((d) => ({ name: d.name, skillMd: join(root, d.name, 'SKILL.md') }))
}

/** Base dir Claude Code / Open Design auto-scan. */
export function defaultSkillsDir(): string {
  return join(homedir(), '.claude', 'skills')
}

/** Install each skill to <baseDir>/<name>/SKILL.md. `skills` is injectable for tests. */
export function installAllSkills(
  baseDir: string = defaultSkillsDir(),
  skills: BundledSkill[] = listBundledSkills(),
): Array<{ name: string; installed: string }> {
  return skills.map((s) => {
    const dir = join(baseDir, s.name)
    mkdirSync(dir, { recursive: true })
    const dest = join(dir, 'SKILL.md')
    writeFileSync(dest, readFileSync(s.skillMd))
    return { name: s.name, installed: dest }
  })
}

export function skillInstall(opts: { dir?: string }): void {
  const installed = installAllSkills(opts.dir)
  console.log(JSON.stringify({ installed }))
}

export function skillPath(): void {
  console.log(JSON.stringify({ skills: listBundledSkills() }))
}
