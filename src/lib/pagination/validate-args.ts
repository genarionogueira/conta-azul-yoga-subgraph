import { badUserInput } from '../errors/bad-user-input.js'
import type { ConnectionArgs } from './types.js'

export function validateConnectionArgs(args: ConnectionArgs): void {
  const { first, last } = args

  if (first != null && last != null) {
    throw badUserInput('Cannot use both `first` and `last` pagination arguments.', {
      fields: ['first', 'last'],
    })
  }

  if (first != null && first <= 0) {
    throw badUserInput('`first` must be a positive integer.', { field: 'first', value: first })
  }

  if (last != null && last <= 0) {
    throw badUserInput('`last` must be a positive integer.', { field: 'last', value: last })
  }
}
