/** E2E worker JWT (matches compose.override.e2e.yaml CONTA_AZUL_SERVICE_JWT). */
export const E2E_WORKER_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhdmNkIiwiYXVkIjoiY29udGEtYXp1bC1zZXJ2aWNlIiwic3ViIjoiYXZjZC13b3JrZXIiLCJpYXQiOjE3ODIyNjQzMzEsImV4cCI6MjA5NzYyNDMzMX0.4k0Nk6BipZskdweXXgurKHpObsGg4ow45MkdnXMvCGo'

export function workerAuthHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${E2E_WORKER_JWT}` }
}

export function mapCaSaleToPersistDocument(item: Record<string, unknown>) {
  const situacao = item.situacao as { nome?: string; descricao?: string } | undefined
  const cliente = item.cliente as { id?: string; nome?: string } | undefined
  return {
    id: String(item.id),
    data: {
      numero: item.numero ?? null,
      data: item.data ?? null,
      dataAlteracao: item.data_alteracao ?? null,
      tipo: item.tipo ?? null,
      situacaoNome: situacao?.nome ?? null,
      situacaoDescricao: situacao?.descricao ?? null,
      clienteNome: cliente?.nome ?? null,
      clienteId: cliente?.id ?? null,
      origem: item.origem ?? null,
    },
  }
}

export function mapCaSaleItemToPersistDocument(
  item: Record<string, unknown>,
  saleId: string
) {
  return {
    id: String(item.id),
    saleId,
    data: {
      produtoId: item.id_item ?? null,
      nome: item.nome ?? null,
      descricao: item.descricao ?? null,
      tipo: item.tipo ?? null,
      quantidade: item.quantidade ?? null,
      valor: item.valor ?? null,
      custo: item.custo ?? null,
    },
  }
}

export function mapCaVendedorToPersistDocument(item: Record<string, unknown>) {
  return {
    id: String(item.id),
    data: {
      nome: item.nome ?? null,
      email: item.email ?? null,
      ativo: item.ativo ?? null,
    },
  }
}
