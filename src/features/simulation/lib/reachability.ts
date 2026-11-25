import type { DominoDocument, Piece, SimulationRun } from '@/shared/document'
import { nextContact } from '@/features/layout/lib/geometry'

export type GoalStatus = 'triggered' | 'pending' | 'unreachable'

export interface GoalState {
  piece: Piece
  status: GoalStatus
}

function gripScale(document: DominoDocument, piece: Piece) {
  const surfaceGrip = (document.scene.friction + piece.friction) / 2
  return (0.94 + surfaceGrip * 0.35) * (1.25 - piece.fallThreshold * 0.25)
}

/**
 * 沿「启用的机关连线 + 物理接触」图，计算从起点实际能够到达的元件集合。
 * 物理接触的判定与传播引擎保持一致（坡道沿用其专用规则）。
 */
export function reachablePieces(document: DominoDocument, startPieceId: string): Set<string> {
  const reachable = new Set<string>()
  const start = document.pieces.find(piece => piece.id === startPieceId)
  if (!start) return reachable
  const stack = [start]
  while (stack.length) {
    const piece = stack.pop()!
    if (reachable.has(piece.id)) continue
    reachable.add(piece.id)
    for (const link of document.connections.filter(item => item.from === piece.id && item.enabled)) {
      const next = document.pieces.find(item => item.id === link.to)
      if (next && !reachable.has(next.id)) stack.push(next)
    }
    if (piece.kind === 'ramp') {
      const target = document.pieces
        .filter(item => !reachable.has(item.id) && item.x > piece.x && Math.abs(item.y - piece.y) < 2.1)
        .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))[0]
      if (target) stack.push(target)
    } else {
      const candidates = document.pieces.filter(item => !reachable.has(item.id) && item.id !== piece.id)
      const target = nextContact(piece, candidates, gripScale(document, piece))
      if (target) stack.push(target)
    }
  }
  return reachable
}

export interface DeletionImpact {
  blockedPieces: Piece[]
  blockedGoals: Piece[]
}

/**
 * 预览删除一条支路后会失去可达性的后续元件。
 * 已在本次运行中处理过的元件不受影响，不计入受影响列表。
 */
export function previewConnectionDeletion(
  document: DominoDocument,
  connectionId: string,
  visitedPieceIds: readonly string[] = [],
): DeletionImpact {
  const link = document.connections.find(item => item.id === connectionId)
  if (!link) return { blockedPieces: [], blockedGoals: [] }
  const visited = new Set(visitedPieceIds)
  const before = reachablePieces(document, document.startPieceId)
  const without = document.connections.filter(item => item.id !== connectionId)
  const after = reachablePieces({ ...document, connections: without }, document.startPieceId)
  const blockedPieces = document.pieces.filter(piece =>
    before.has(piece.id) && !after.has(piece.id) && !visited.has(piece.id))
  return { blockedPieces, blockedGoals: blockedPieces.filter(piece => piece.kind === 'trigger') }
}

/**
 * 汇总所有触发器目标的当前状态：
 * - triggered：本次运行中已经触发
 * - pending：尚未触发，但在当前布局下仍可达
 * - unreachable：当前布局下已无可达路径（不会再被静默地留在「待完成」里）
 */
export function goalBoard(document: DominoDocument, run: SimulationRun | null): GoalState[] {
  const triggered = new Set(run?.events
    .filter(event => document.pieces.find(piece => piece.id === event.pieceId)?.kind === 'trigger')
    .map(event => event.pieceId) ?? [])
  const reachable = reachablePieces(document, document.startPieceId)
  return document.pieces
    .filter(piece => piece.kind === 'trigger')
    .map(piece => ({
      piece,
      status: triggered.has(piece.id) ? 'triggered' : reachable.has(piece.id) ? 'pending' : 'unreachable',
    }))
}
