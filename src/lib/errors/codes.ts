export const ErrorCode = {
  BAD_USER_INPUT: 'BAD_USER_INPUT',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]
