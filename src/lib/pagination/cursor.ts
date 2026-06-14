export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset)).toString('base64')
}

export function decodeCursor(cursor: string): number {
  return parseInt(Buffer.from(cursor, 'base64').toString('utf8'), 10)
}
