import type { DominoDocument, Piece, PendingItem, SimulationEvent } from '@/shared/document'
import { nextContact } from '@/features/layout/lib/geometry'

/** 分岔支路按 order 派发时，相邻支路之间的启动错峰（秒），让先后次序可观察 */
export const ORDER_GAP = 0.12

interface EngineState {
  queue: PendingItem[]
  fallen: Set<string>
  events: SimulationEvent[]
  fired: Set<string>
  visited: Set<string>
  reachedTrigger: boolean
  interruptedPieceId: string | null
  interruptionReason: string | null
  pausedAt: string | null
  /** 继续运行时，放行这一个分岔器（暂停点本身），之后的分岔器仍会暂停 */
  releasePieceId: string | null
}

export interface PropagationOutcome {
  events: SimulationEvent[]
  interruptedPieceId: string | null
  interruptionReason: string | null
  reachedTrigger: boolean
  status: 'complete' | 'interrupted' | 'empty' | 'paused'
  duration: number
  visitedPieceIds: string[]
  firedConnectionIds: string[]
  pausedAtPieceId: string | null
  pending: PendingItem[]
}

function freshState(document: DominoDocument): EngineState {
  return {
    queue: [{ pieceId: document.startPieceId, time: 0, causeId: null, detail: '手动触发', connectionId: null }],
    fallen: new Set(),
    events: [],
    fired: new Set(),
    visited: new Set(),
    reachedTrigger: false,
    interruptedPieceId: null,
    interruptionReason: null,
    pausedAt: null,
    releasePieceId: null,
  }
}

function orderedLinks(document: DominoDocument, fromId: string) {
  return document.connections
    .filter(link => link.from === fromId && link.enabled)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

function sortQueue(queue: PendingItem[]) {
  queue.sort((a, b) => a.time - b.time
    || a.pieceId.localeCompare(b.pieceId)
    || (a.causeId ?? '').localeCompare(b.causeId ?? '')
    || (a.connectionId ?? '').localeCompare(b.connectionId ?? ''))
}

/** 把一个已处理元件的启用支路按 order 排入队列，并记录支路已触发（顺序锁定） */
function dispatchLinks(document: DominoDocument, piece: Piece, time: number, causeId: string | null, state: EngineState) {
  orderedLinks(document, piece.id).forEach((link, index) => {
    const stagger = piece.kind === 'splitter' ? index * ORDER_GAP : 0
    state.queue.push({
      pieceId: link.to,
      time: time + link.delay + stagger,
      causeId,
      detail: '机关连线',
      connectionId: link.id,
    })
    state.fired.add(link.id)
  })
}

/**
 * 推进一个调度项。
 * - 队首是尚未处理的分岔器时先暂停（不消费该项），等待支路顺序编辑后继续
 * - 否则处理该项并追加事件
 */
function step(document: DominoDocument, state: EngineState): 'paused' | 'moved' | 'idle' {
  if (!state.queue.length) return 'idle'
  sortQueue(state.queue)
  const next = state.queue[0]
  const piece = document.pieces.find(item => item.id === next.pieceId)
  if (!piece || state.fallen.has(piece.id)) {
    state.queue.shift()
    return 'moved'
  }
  if (piece.kind === 'splitter' && !state.visited.has(piece.id) && state.releasePieceId !== piece.id) {
    state.pausedAt = piece.id
    return 'paused'
  }

  state.queue.shift()
  state.visited.add(piece.id)

  if (piece.kind === 'trigger') {
    const event: SimulationEvent = {
      id: `event-${state.events.length + 1}`, pieceId: piece.id, time: next.time,
      causeId: next.causeId, kind: 'mechanism', detail: `触发器响应 · ${next.detail}`,
    }
    state.events.push(event)
    state.reachedTrigger = true
    dispatchLinks(document, piece, next.time, event.id, state)
    return 'moved'
  }

  state.fallen.add(piece.id)
  const event: SimulationEvent = {
    id: `event-${state.events.length + 1}`, pieceId: piece.id, time: next.time,
    causeId: next.causeId, kind: piece.kind === 'splitter' ? 'mechanism' : 'fall',
    detail: piece.kind === 'splitter' ? `分岔展开 · ${next.detail}`
      : piece.kind === 'ramp' ? `坡道传递 · ${next.detail}` : `受力倒下 · ${next.detail}`,
  }
  state.events.push(event)

  dispatchLinks(document, piece, next.time, event.id, state)

  const available = document.pieces.filter(item => !state.fallen.has(item.id) && item.id !== piece.id)
  const surfaceGrip = (document.scene.friction + piece.friction) / 2
  const reachScale = (0.94 + surfaceGrip * 0.35) * (1.25 - piece.fallThreshold * 0.25)
  let target: Piece | null = null
  if (piece.kind === 'ramp') {
    target = available.filter(item => item.x > piece.x && Math.abs(item.y - piece.y) < 2.1)
      .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))[0] ?? null
  } else {
    target = nextContact(piece, available, reachScale)
  }
  if (target) {
    const separation = Math.hypot(piece.x - target.x, piece.y - target.y)
    const speed = Math.max(1.8, piece.height * document.scene.gravity / 2) * (0.75 + surfaceGrip * 0.5)
    const travel = Math.max(0.24, separation / speed)
    state.queue.push({
      pieceId: target.id, time: next.time + travel, causeId: event.id,
      detail: piece.kind === 'splitter' ? '分岔臂接触' : piece.kind === 'ramp' ? '坡面末端接触' : '相邻接触',
      connectionId: null,
    })
  }

  const hasConnection = document.connections.some(link => link.from === piece.id && link.enabled)
  if (!target && !hasConnection && state.interruptedPieceId === null) {
    state.interruptedPieceId = piece.id
    state.interruptionReason = '倒下方向内没有可触达的元件，链路在此停止。'
    state.events.push({
      id: `event-${state.events.length + 1}`, pieceId: piece.id, time: next.time + 0.05,
      causeId: event.id, kind: 'interrupted', detail: state.interruptionReason,
    })
  }
  return 'moved'
}

function drain(document: DominoDocument, state: EngineState, allowPause: boolean): EngineState {
  while (state.events.length < document.pieces.length * 3) {
    const outcome = step(document, state)
    if (outcome === 'idle') break
    if (outcome === 'paused') {
      if (allowPause) break
      state.pausedAt = null
    }
  }
  return state
}

function toOutcome(document: DominoDocument, state: EngineState): PropagationOutcome {
  const paused = state.pausedAt !== null
  return {
    events: state.events,
    interruptedPieceId: state.interruptedPieceId,
    interruptionReason: state.interruptionReason,
    reachedTrigger: state.reachedTrigger,
    status: paused ? 'paused'
      : state.events.length === 0 ? 'empty'
        : state.interruptedPieceId || !state.reachedTrigger ? 'interrupted'
          : 'complete',
    duration: state.events.at(-1)?.time ?? 0,
    visitedPieceIds: [...state.visited],
    firedConnectionIds: [...state.fired],
    pausedAtPieceId: state.pausedAt,
    pending: state.queue,
  }
}

/** 完整运行（不暂停），保持原有一次性模拟语义 */
export function propagate(document: DominoDocument): PropagationOutcome {
  return toOutcome(document, drain(document, freshState(document), false))
}

/** 运行到第一个分岔器处理之前暂停；没有分岔器时直接跑完 */
export function runToSplitter(document: DominoDocument): PropagationOutcome {
  return toOutcome(document, drain(document, freshState(document), true))
}

/** 从分岔检查点继续；已提交事件保持原 id 与时间，仅追加后续事件 */
export function resumeRun(document: DominoDocument, checkpoint: {
  events: SimulationEvent[]
  visitedPieceIds: string[]
  firedConnectionIds: string[]
  pending: PendingItem[]
  pausedAtPieceId: string | null
  interruptedPieceId: string | null
  interruptionReason: string | null
}): PropagationOutcome {
  const state: EngineState = {
    queue: structuredClone(checkpoint.pending),
    fallen: new Set<string>(),
    events: structuredClone(checkpoint.events),
    fired: new Set(checkpoint.firedConnectionIds),
    visited: new Set(checkpoint.visitedPieceIds),
    reachedTrigger: checkpoint.events.some(event =>
      document.pieces.find(piece => piece.id === event.pieceId)?.kind === 'trigger'),
    interruptedPieceId: checkpoint.interruptedPieceId,
    interruptionReason: checkpoint.interruptionReason,
    pausedAt: null,
    releasePieceId: checkpoint.pausedAtPieceId,
  }
  for (const event of checkpoint.events) {
    const piece = document.pieces.find(item => item.id === event.pieceId)
    if (piece && piece.kind !== 'trigger') state.fallen.add(piece.id)
  }
  return toOutcome(document, drain(document, state, true))
}
