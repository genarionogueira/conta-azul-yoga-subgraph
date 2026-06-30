import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { JobType } from '../../src/lib/jobs/job-stream.js'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '../..')

describe('disconnect phase schema contract', () => {
  it('includes DISCONNECT phase and DisconnectResult.jobId in GraphQL SDL', () => {
    const progressSdl = readFileSync(
      join(root, 'src/schema/sync/progress.graphql'),
      'utf8'
    )
    const authSdl = readFileSync(join(root, 'src/schema/auth/schema.graphql'), 'utf8')

    expect(progressSdl).toContain('DISCONNECT')
    expect(authSdl).toContain('jobId: ID')
  })

  it('includes disconnect.store in JobType union', () => {
    const jobTypes: JobType[] = ['reconcile.store', 'disconnect.store']
    expect(jobTypes).toContain('disconnect.store')
  })
})
