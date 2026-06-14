export type ScalarType = 'ID' | 'String' | 'Int' | 'Float' | 'Boolean'

export interface EntityField {
  name: string
  type: ScalarType
  nullable: boolean
}

export interface MongoDirective {
  collection: string
}

export interface RestDirective {
  adapter: string
  list: string
}

export interface TenantDirective {
  field: string
}

export interface CacheDirective {
  ttl: string
}

export interface KeyDirective {
  fields: string
}

export interface EntityDef {
  name: string
  fields: EntityField[]
  mongo: MongoDirective
  rest: RestDirective | null
  tenant: TenantDirective | null
  cache: CacheDirective | null
  key: KeyDirective | null
}
