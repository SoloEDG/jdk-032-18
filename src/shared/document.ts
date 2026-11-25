export type PieceKind = 'domino' | 'ramp' | 'splitter' | 'trigger'
export type Axis = 'north' | 'east' | 'south' | 'west'

export interface Vec2 { x: number; y: number }

export interface Piece {
  id: string
  kind: PieceKind
  x: number
  y: number
  angle: number
  facing: Axis
  label: string
  height: number
  width: number
  fallThreshold: number
  friction: number
}

export interface MechanismConnection {
  id: string
  from: string
  to: string
  delay: number
  enabled: boolean
  /** 同一来源下的支路启动顺序，从 0 开始 */
  order: number
}

export interface SceneSettings {
  gravity: number
  friction: number
  width: number
  height: number
  showGrid: boolean
}

export interface DominoDocument {
  id: string
  title: string
  revision: number
  updatedAt: number
  pieces: Piece[]
  connections: MechanismConnection[]
  scene: SceneSettings
  startPieceId: string
}

export interface SimulationEvent {
  id: string
  pieceId: string
  time: number
  causeId: string | null
  kind: 'trigger' | 'fall' | 'mechanism' | 'interrupted'
  detail: string
}

/** 检查点上尚未处理的调度项，用于在分岔前暂停后继续 */
export interface PendingItem {
  pieceId: string
  time: number
  causeId: string | null
  detail: string
  /** 由哪条支路连线排入；物理接触项为 null */
  connectionId: string | null
}

export interface SimulationRun {
  id: string
  documentId: string
  revision: number
  startedAt: number
  startPieceId: string
  status: 'complete' | 'interrupted' | 'empty' | 'paused'
  mode: 'full' | 'partial'
  events: SimulationEvent[]
  interruptedPieceId: string | null
  interruptionReason: string | null
  duration: number
  /** 已实际处理过的元件 id（部分运行时构成不可重排的冻结前缀） */
  visitedPieceIds: string[]
  /** 已经派发过的支路连线 id，对应的支路顺序被锁定 */
  firedConnectionIds: string[]
  /** 暂停在某个分岔器前时，该分岔器 id；继续后清空 */
  pausedAtPieceId: string | null
  /** 继续运行所需的待处理队列 */
  pending: PendingItem[]
}
