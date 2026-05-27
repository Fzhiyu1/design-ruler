import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { listBundledSkills, installAllSkills, defaultSkillsDir } from '../skill.js'

let tmp: string
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'dr-skill-')) })
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

function fakeSkillsRoot(names: string[]): string {
  const root = join(tmp, 'skills')
  for (const n of names) {
    mkdirSync(join(root, n), { recursive: true })
    writeFileSync(join(root, n, 'SKILL.md'), `# ${n}`)
  }
  return root
}

describe('skill install (all bundled skills)', () => {
  it('listBundledSkills finds every subdir that has a SKILL.md', () => {
    const root = fakeSkillsRoot(['design-restore', 'extract-assets'])
    mkdirSync(join(root, 'not-a-skill')) // no SKILL.md → ignored
    const found = listBundledSkills(root).map(s => s.name).sort()
    expect(found).toEqual(['design-restore', 'extract-assets'])
  })

  it('installAllSkills copies each skill into <base>/<name>/SKILL.md', () => {
    const root = fakeSkillsRoot(['design-restore', 'extract-assets'])
    const base = join(tmp, 'target')
    const installed = installAllSkills(base, listBundledSkills(root))
    expect(installed.map(i => i.name).sort()).toEqual(['design-restore', 'extract-assets'])
    expect(existsSync(join(base, 'design-restore', 'SKILL.md'))).toBe(true)
    expect(readFileSync(join(base, 'extract-assets', 'SKILL.md'), 'utf-8')).toBe('# extract-assets')
  })

  it('finds a symlinked skill directory', () => {
    const real = join(tmp, 'real-skill'); mkdirSync(real, { recursive: true })
    writeFileSync(join(real, 'SKILL.md'), '# real')
    const root = join(tmp, 'skills'); mkdirSync(root, { recursive: true })
    symlinkSync(real, join(root, 'linked'))
    expect(listBundledSkills(root).map(s => s.name)).toContain('linked')
  })

  it('defaultSkillsDir is ~/.claude/skills', () => {
    expect(defaultSkillsDir()).toMatch(/\.claude\/skills$/)
  })
})
