#!/usr/bin/env node
/**
 * Print HS256 JWT for avcd-worker → yoga GraphQL (sub=avcd-worker).
 * Usage: JWT_SECRET=... node scripts/generate-worker-jwt.mjs
 */
import { SignJWT } from 'jose'

const secret = process.env.JWT_SECRET?.trim()
if (!secret) {
  console.error('JWT_SECRET is required')
  process.exit(1)
}

const token = await new SignJWT({})
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuer(process.env.JWT_ISSUER?.trim() || 'avcd')
  .setAudience(process.env.JWT_AUDIENCE?.trim() || 'conta-azul-service')
  .setSubject('avcd-worker')
  .setIssuedAt()
  .setExpirationTime('10y')
  .sign(new TextEncoder().encode(secret))

process.stdout.write(token)
