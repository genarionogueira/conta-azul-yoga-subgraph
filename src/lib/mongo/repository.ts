import type { Collection, Document, Filter, Sort } from 'mongodb'
import type { BoolExp } from '../filter/types.js'
import { buildMongoFilter } from '../filter/translator.js'

export interface FindManyOptions {
  where?: BoolExp | null
  limit?: number | null
  offset?: number | null
  sort?: Sort
  distinctOn?: string[] | null
}

type MongoPipelineStage = Record<string, unknown>

export class MongoRepository<T extends Document> {
  constructor(private readonly collection: Collection<T>) {}

  async findMany({
    where,
    limit,
    offset,
    sort,
    distinctOn,
  }: FindManyOptions = {}): Promise<T[]> {
    const filter = buildMongoFilter(where) as Filter<T>

    if (distinctOn && distinctOn.length > 0) {
      const pipeline = this.buildDistinctPipeline(filter, distinctOn, sort, offset ?? 0, limit ?? 100)
      const results = await this.collection.aggregate(pipeline).toArray()
      return results as T[]
    }

    let cursor = this.collection.find(filter)
    if (sort) cursor = cursor.sort(sort)
    cursor = cursor.skip(offset ?? 0).limit(limit ?? 100)
    return cursor.toArray() as Promise<T[]>
  }

  async count(where?: BoolExp | null, distinctOn?: string[] | null): Promise<number> {
    const filter = buildMongoFilter(where) as Filter<T>

    if (distinctOn && distinctOn.length > 0) {
      const pipeline = this.buildDistinctCountPipeline(filter, distinctOn)
      const results = await this.collection.aggregate(pipeline).toArray()
      return results[0]?.total ?? 0
    }

    return this.collection.countDocuments(filter)
  }

  private buildDistinctGroupId(distinctOn: string[]): Record<string, string> {
    return Object.fromEntries(distinctOn.map((field) => [field, `$${field}`]))
  }

  private buildDistinctPipeline(
    filter: Filter<T>,
    distinctOn: string[],
    sort: Sort | undefined,
    offset: number,
    limit: number
  ): MongoPipelineStage[] {
    const pipeline: MongoPipelineStage[] = [{ $match: filter }]

    if (sort) {
      pipeline.push({ $sort: sort })
    }

    pipeline.push(
      {
        $group: {
          _id: this.buildDistinctGroupId(distinctOn),
          doc: { $first: '$$ROOT' },
        },
      },
      { $replaceRoot: { newRoot: '$doc' } }
    )

    if (sort) {
      pipeline.push({ $sort: sort })
    }

    pipeline.push({ $skip: offset }, { $limit: limit })
    return pipeline
  }

  private buildDistinctCountPipeline(filter: Filter<T>, distinctOn: string[]): MongoPipelineStage[] {
    return [
      { $match: filter },
      { $group: { _id: this.buildDistinctGroupId(distinctOn) } },
      { $count: 'total' },
    ]
  }
}
