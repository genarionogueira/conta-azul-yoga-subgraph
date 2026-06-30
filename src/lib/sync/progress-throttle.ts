export interface ProgressThrottleInput {
  completed: number
  lastReportAtMs: number | null
  status: string
  everyN?: number
  minIntervalMs?: number
  nowMs?: number
}

export function shouldReportProgress(input: ProgressThrottleInput): boolean {
  const everyN = input.everyN ?? 5
  const minIntervalMs = input.minIntervalMs ?? 2000
  const nowMs = input.nowMs ?? Date.now()

  if (input.status === 'COMPLETE' || input.status === 'FAILED') {
    return true
  }

  if (input.completed <= 0) {
    return true
  }

  if (input.completed % everyN === 0) {
    return true
  }

  if (input.lastReportAtMs == null) {
    return true
  }

  return nowMs - input.lastReportAtMs >= minIntervalMs
}
