import { logCache } from './logger.js'

export class SingleflightLock {
  private running = new Map<string, Promise<void>>()

  run(key: string, fn: () => Promise<void>): Promise<void> {
    const existing = this.running.get(key)
    if (existing) {
      logCache('singleflight_wait', { key })
      return existing
    }

    const promise = fn().finally(() => {
      this.running.delete(key)
    })
    this.running.set(key, promise)
    return promise
  }
  clearForTests(): void {
    this.running.clear()
  }
}

export const globalSingleflight = new SingleflightLock()
