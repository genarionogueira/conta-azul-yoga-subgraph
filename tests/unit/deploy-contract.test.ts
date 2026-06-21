import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const repoRoot = path.join(import.meta.dirname, '../..')
const read = (rel: string) => {
  const p = path.join(repoRoot, rel)
  expect(fs.existsSync(p)).toBe(true)
  return fs.readFileSync(p, 'utf8')
}

describe('deploy contract', () => {
  it('GivenDeployDevelopmentYml_WhenParsed_ThenZitadelOnlyAuthConfigured', () => {
    const text = read('config/deploy.development.yml')
    expect(text).toContain('KEYCLOAK_ENABLED: "false"')
    expect(text).toContain('ZITADEL_ISSUER: https://zitadel.avcd.ai')
    expect(text).toContain('ZITADEL_PROJECT_ID: __ZITADEL_PROJECT_ID__')
    expect(text).toContain('JWT_REQUIRED: "true"')
  })

  it('GivenWorkflowYaml_WhenInspected_ThenZitadelProjectIdRequired', () => {
    const text = read('.github/workflows/deploy-digitalocean-dev.yml')
    expect(text).toContain('ZITADEL_PROJECT_ID')
  })

  it('GivenPreprocessScript_WhenRunWithFixtures_ThenZitadelProjectIdReplaced', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yoga-deploy-'))
    const configDir = path.join(tmp, 'config')
    fs.mkdirSync(configDir)
    for (const name of ['deploy.yml', 'deploy.development.yml']) {
      fs.copyFileSync(
        path.join(repoRoot, 'config', name),
        path.join(configDir, name)
      )
    }
    const scriptDir = path.join(tmp, 'scripts', 'ci')
    fs.mkdirSync(scriptDir, { recursive: true })
    fs.copyFileSync(
      path.join(repoRoot, 'scripts/ci/preprocess-deploy.sh'),
      path.join(scriptDir, 'preprocess-deploy.sh')
    )
    execSync('bash scripts/ci/preprocess-deploy.sh', {
      cwd: tmp,
      env: {
        ...process.env,
        DO_DEPLOY_HOST: '1.2.3.4',
        DO_DEPLOY_USER: 'deploy',
        DO_PUBLIC_HOST: 'dev.avocado.tech',
        GHCR_REGISTRY_URL: 'ghcr.io',
        ZITADEL_PROJECT_ID: 'test-project-id',
      },
    })
    const out = fs.readFileSync(
      path.join(configDir, 'deploy.development.yml'),
      'utf8'
    )
    expect(out).not.toContain('__ZITADEL_PROJECT_ID__')
    expect(out).toContain('test-project-id')
  })

  it('GivenPreprocessScript_WhenInspected_ThenSubstitutesZitadelProjectId', () => {
    const text = read('scripts/ci/preprocess-deploy.sh')
    expect(text).toContain('__ZITADEL_PROJECT_ID__')
    expect(text).toContain('ZITADEL_PROJECT_ID')
  })
})
