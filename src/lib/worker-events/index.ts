import { createRedisClient } from '../redis/create-redis-client.js'
import type { Redis } from 'ioredis'
import { WorkerSyncEventBuffer } from './buffer.js'
import {
  createWorkerSyncEventSubscriber,
  type NoopWorkerSyncEventSubscriber,
  type WorkerSyncEventSubscriber,
} from './subscriber.js'
import { workerEventsBufferSize } from './types.js'

export type { WorkerSyncEventRecord } from './types.js'
export {
  parseWorkerSyncEvent,
  toGraphqlWorkerSyncEventType,
  workerEventStreamKey,
  workerEventsEnabled,
} from './types.js'

let sharedBuffer: WorkerSyncEventBuffer | null = null
let sharedSubscriber:
  | WorkerSyncEventSubscriber
  | NoopWorkerSyncEventSubscriber
  | null = null
let sharedRedis: Redis | null = null

export function getWorkerSyncEventBuffer(): WorkerSyncEventBuffer {
  if (!sharedBuffer) {
    sharedBuffer = new WorkerSyncEventBuffer(workerEventsBufferSize())
  }
  return sharedBuffer
}

function getSharedRedis(): Redis {
  if (!sharedRedis) {
    sharedRedis = createRedisClient(process.env.REDIS_URL, 'blocking')
  }
  return sharedRedis
}

export async function startWorkerSyncEventSubscriber(): Promise<void> {
  if (!sharedSubscriber) {
    sharedSubscriber = createWorkerSyncEventSubscriber(
      getSharedRedis(),
      getWorkerSyncEventBuffer()
    )
  }
  await sharedSubscriber.start()
}

export async function stopWorkerSyncEventSubscriber(): Promise<void> {
  if (sharedSubscriber) {
    await sharedSubscriber.stop()
  }
  if (sharedRedis) {
    await sharedRedis.quit()
    sharedRedis = null
  }
  sharedSubscriber = null
}

export function resetWorkerSyncEventsForTests(): void {
  sharedBuffer?.clear()
  sharedBuffer = null
  sharedSubscriber = null
  if (sharedRedis) {
    void sharedRedis.quit()
    sharedRedis = null
  }
}
