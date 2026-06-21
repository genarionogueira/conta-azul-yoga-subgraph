import type { Redis } from 'ioredis'

const EVENT_CHANNEL_PREFIX = 'conta_azul:credentials:events:'

export type CredentialsEvent =
  | { type: 'store.connected'; tenantId: string; storeId: string; at: string }
  | { type: 'store.disconnected'; tenantId: string; storeId: string; at: string }

export interface CredentialsEventBus {
  publish(event: CredentialsEvent): Promise<void>
}

function eventChannel(tenantId: string): string {
  return `${EVENT_CHANNEL_PREFIX}${tenantId}`
}

function credentialsEventsEnabled(): boolean {
  const raw = process.env.CREDENTIALS_EVENTS_ENABLED?.trim().toLowerCase()
  return raw !== 'false'
}

export class NoopCredentialsEventBus implements CredentialsEventBus {
  async publish(_event: CredentialsEvent): Promise<void> {}
}

export class RedisCredentialsEventBus implements CredentialsEventBus {
  constructor(private readonly redis: Redis) {}

  async publish(event: CredentialsEvent): Promise<void> {
    await this.redis.publish(eventChannel(event.tenantId), JSON.stringify(event))
  }
}

export function createCredentialsEventBus(redis: Redis): CredentialsEventBus {
  if (!credentialsEventsEnabled()) {
    return new NoopCredentialsEventBus()
  }
  return new RedisCredentialsEventBus(redis)
}
