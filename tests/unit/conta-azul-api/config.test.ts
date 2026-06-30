import { describe, expect, it } from 'vitest'
import {
  contaAzulAcquireMaxWaitMs,
  contaAzulRpm,
  contaAzulRps,
  jobStreamKey,
} from '../../../src/lib/conta-azul-api/config.js'

describe('conta-azul-api config', () => {
  it('GivenDefaults_WhenReading_ThenUsesPlanValues', () => {
    delete process.env.CONTA_AZUL_RPS
    delete process.env.CONTA_AZUL_RPM
    delete process.env.CONTA_AZUL_ACQUIRE_MAX_WAIT_MS
    delete process.env.JOB_STREAM_KEY
    expect(contaAzulRps()).toBe(9)
    expect(contaAzulRpm()).toBe(550)
    expect(contaAzulAcquireMaxWaitMs()).toBe(15_000)
    expect(jobStreamKey()).toBe('conta_azul:jobs')
  })

  it('GivenEnv_WhenReading_ThenParsesIntegers', () => {
    process.env.CONTA_AZUL_RPS = '7'
    process.env.CONTA_AZUL_RPM = '400'
    process.env.CONTA_AZUL_ACQUIRE_MAX_WAIT_MS = '5000'
    process.env.JOB_STREAM_KEY = 'custom:jobs'
    expect(contaAzulRps()).toBe(7)
    expect(contaAzulRpm()).toBe(400)
    expect(contaAzulAcquireMaxWaitMs()).toBe(5000)
    expect(jobStreamKey()).toBe('custom:jobs')
    delete process.env.CONTA_AZUL_RPS
    delete process.env.CONTA_AZUL_RPM
    delete process.env.CONTA_AZUL_ACQUIRE_MAX_WAIT_MS
    delete process.env.JOB_STREAM_KEY
  })
})
