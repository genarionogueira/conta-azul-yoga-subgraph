---
name: conta-azul-api-reference
description: Conta Azul API v2 reference - endpoints, date formats, and common issues
---

# Conta Azul API Reference

> **Related**: [Conta Azul Integration](./conta-azul-integration/SKILL.md)

## Overview

Conta Azul API v2 base URL: `https://api-v2.contaazul.com`

Authentication: OAuth 2.0 with JWT Bearer tokens

## Date Format Issue

**CRITICAL**: The Conta Azul API v2 `searchreceivablefinancialevents` and `searchpayablefinancialevents` endpoints return **400 Bad Request** with date parameters in both DD/MM/YYYY and YYYY-MM-DD formats.

### Error Message
```json
{"code":400,"message":"O formato do parâmetro fornecido é inválido."}
```

### Tested Date Formats (All Failed)

| Format | Example | Result |
|--------|---------|--------|
| DD/MM/YYYY | 01/05/2026 | 400 Bad Request |
| YYYY-MM-DD (ISO) | 2026-05-01 | 400 Bad Request |
| DD-MM-YYYY | 01-05-2026 | 400 Bad Request |
| MM/DD/YYYY | 05/01/2026 | 400 Bad Request |

### Affected Endpoints

- `GET /v1/financeiro/eventos-financeiros/contas-a-receber/buscar`
- `GET /v1/financeiro/eventos-financeiros/contas-a-pagar/buscar`
- `GET /v1/financeiro/transferencias`

### Working Endpoints (No Date Params)

- `GET /v1/conta-financeira` - List financial accounts (works with `ativo=true`)
- `GET /v1/conta-financeira/{id}/saldo-atual` - Get account balance

## API Endpoints Reference

### Financial Accounts

```
GET /v1/conta-financeira?ativo=true&pagina=1&tamanho_pagina=100
```

Response: List of financial accounts with `id`, `nome`, `saldo`, etc.

### Search Receivables (Contas a Receber)

```
GET /v1/financeiro/eventos-financeiros/contas-a-receber/buscar
```

**Query Parameters:**
- `data_pagamento_de` - Payment date from
- `data_pagamento_ate` - Payment date to
- `data_vencimento_de` - Due date from
- `data_vencimento_ate` - Due date to
- `ids_contas_financeiras` - Financial account IDs (comma-separated)
- `status` - PAGO, PENDENTE, etc.
- `pagina` - Page number
- `tamanho_pagina` - Page size

### Search Payables (Contas a Pagar)

```
GET /v1/financeiro/eventos-financeiros/contas-a-pagar/buscar
```

Same parameters as receivables.

### Search Transfers

```
GET /v1/financeiro/transferencias
```

**Query Parameters:**
- `data_de` - Date from
- `data_ate` - Date to

### Get Account Balance

```
GET /v1/conta-financeira/{id}/saldo-atual
```

Response: `{"saldo": 1234.56}`

## OAuth 2.0 Flow

1. **Authorization URL:**
   ```
   https://auth.contaazul.com/login?response_type=code&client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&state={STATE}&scope=openid+profile+aws.cognito.signin.user.admin
   ```

2. **Token Exchange:**
   ```
   POST https://api.contaazul.com/oauth2/token
   Content-Type: application/x-www-form-urlencoded
   
   grant_type=authorization_code&code={CODE}&redirect_uri={REDIRECT_URI}
   ```

3. **Token Refresh:**
   ```
   POST https://api.contaazul.com/oauth2/token
   
   grant_type=refresh_token&refresh_token={REFRESH_TOKEN}
   ```

## Response Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request - Invalid parameters (including date format issues) |
| 401 | Unauthorized - Invalid or expired token |
| 404 | Not Found |

## Common Issues

### 401 - Invalid Token
Token may expire quickly or be invalidated. Always check `validate_connection` before making data requests.

### 400 - Invalid Parameter Format
Date parameters are particularly problematic. The API documentation suggests ISO 8601 (YYYY-MM-DD), but this returns 400 errors.

**Workaround:** Currently investigating the correct format. Possible solutions:
1. Use a different date format (DD-MM-YYYY, MM-DD-YYYY)
2. Omit date parameters and filter client-side
3. Use epoch timestamps
4. Check if the endpoint requires different parameter names

### 403 - Forbidden
The authenticated user doesn't have permission to access the requested resource.

## Testing

Use the debug script to test API calls:

```python
import httpx

async with httpx.AsyncClient() as client:
    resp = await client.get(
        "https://api-v2.contaazul.com/v1/conta-financeira",
        params={"ativo": "true"},
        headers={"Authorization": f"Bearer {token}"}
    )
    print(resp.status_code, resp.json())
```

## References

- [Official Documentation](https://developers.contaazul.com/docs/financial-apis-openapi)
- [OAuth 2.0 Documentation](https://developers.contaazul.com/docs/oauth2)
