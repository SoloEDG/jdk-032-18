import type { DominoDocument, MechanismConnection } from '@/shared/document'
import { stableId } from '@/shared/time'

export function availableTargets(document: DominoDocument, from: string) {
  const used = new Set(document.connections.filter(link => link.from === from).map(link => link.to))
  return document.pieces.filter(piece => piece.id !== from && !used.has(piece.id))
}

/** 为缺少 order 的旧存档补齐同一来源下的连续顺序 */
export function normalizeConnectionOrders(document: DominoDocument): MechanismConnection[] {
  const counters = new Map<string, number>()
  return document.connections.map(link => {
    const index = counters.get(link.from) ?? 0
    counters.set(link.from, index + 1)
    return { ...link, order: typeof link.order === 'number' ? link.order : index }
  })
}

export function addConnection(document: DominoDocument, from: string, to: string): DominoDocument {
  if (!document.pieces.some(piece => piece.id === from) || !document.pieces.some(piece => piece.id === to)) return document
  if (document.connections.some(link => link.from === from && link.to === to)) return document
  // 取同来源下最大 order + 1，即便历史数据存在序号空洞也不会碰撞
  const order = document.connections
    .filter(link => link.from === from)
    .reduce((max, link) => Math.max(max, link.order), -1) + 1
  const connection: MechanismConnection = { id: stableId('wire'), from, to, delay: 0.15, enabled: true, order }
  return { ...document, connections: [...document.connections, connection] }
}

export function removeConnection(document: DominoDocument, id: string): DominoDocument {
  const target = document.connections.find(link => link.id === id)
  const connections = document.connections.filter(link => link.id !== id)
  if (!target) return document
  // 删除后把同一来源剩余支路的 order 压实为连续序号
  const remaining = connections.filter(link => link.from === target.from)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  const orderMap = new Map(remaining.map((link, index) => [link.id, index]))
  return {
    ...document,
    connections: connections.map(link => orderMap.has(link.id) ? { ...link, order: orderMap.get(link.id)! } : link),
  }
}

/**
 * 调整同一来源下两条支路的先后次序。
 * 已在运行中触发过的支路（lockedIds）不允许参与换序，已发生事件因此不会被重排。
 */
export function moveConnection(
  document: DominoDocument,
  connectionId: string,
  direction: -1 | 1,
  lockedIds: readonly string[] = [],
): DominoDocument {
  const target = document.connections.find(link => link.id === connectionId)
  if (!target || lockedIds.includes(connectionId)) return document
  const group = document.connections
    .filter(link => link.from === target.from)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  const index = group.findIndex(link => link.id === connectionId)
  const swapWith = group[index + direction]
  if (index < 0 || !swapWith) return document
  if (lockedIds.includes(swapWith.id)) return document
  const orderMap = new Map<string, number>()
  group.forEach((link, i) => {
    if (i === index) orderMap.set(link.id, index + direction)
    else if (i === index + direction) orderMap.set(link.id, index)
    else orderMap.set(link.id, i)
  })
  return {
    ...document,
    connections: document.connections.map(link => orderMap.has(link.id) ? { ...link, order: orderMap.get(link.id)! } : link),
  }
}
