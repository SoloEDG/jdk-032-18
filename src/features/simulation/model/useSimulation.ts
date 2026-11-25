import { computed, ref, shallowRef, type Ref } from 'vue'
import type { DominoDocument, SimulationRun } from '@/shared/document'
import { propagate, resumeRun, runToSplitter, type PropagationOutcome } from '../lib/propagate'

function buildRun(snapshot: DominoDocument, outcome: PropagationOutcome, mode: SimulationRun['mode']): SimulationRun {
  return {
    id: crypto.randomUUID(),
    documentId: snapshot.id,
    revision: snapshot.revision,
    startedAt: Date.now(),
    startPieceId: snapshot.startPieceId,
    status: outcome.status,
    mode,
    events: outcome.events,
    interruptedPieceId: outcome.interruptedPieceId,
    interruptionReason: outcome.interruptionReason,
    duration: outcome.duration,
    visitedPieceIds: outcome.visitedPieceIds,
    firedConnectionIds: outcome.firedConnectionIds,
    pausedAtPieceId: outcome.pausedAtPieceId,
    pending: outcome.pending,
  }
}

export function useSimulation(document: Ref<DominoDocument>) {
  const run = shallowRef<SimulationRun | null>(null)
  const busy = ref(false)
  const issue = ref('')
  const current = computed(() => run.value)
  /** 完整运行的结果在布局变更后过期；部分运行允许在暂停点继续编辑未触发支路 */
  const stale = computed(() => Boolean(
    run.value && run.value.mode === 'full' && run.value.revision !== document.value.revision,
  ))
  const paused = computed(() => run.value?.status === 'paused')

  async function simulate() {
    busy.value = true
    issue.value = ''
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    try {
      const snapshot = structuredClone(document.value)
      run.value = buildRun(snapshot, propagate(snapshot), 'full')
      if (run.value.status === 'empty') issue.value = '场景里没有可运行的触发点。'
    } catch {
      issue.value = '场景计算未能完成，请检查元件连接。'
    } finally {
      busy.value = false
    }
  }

  async function simulateToSplitter() {
    busy.value = true
    issue.value = ''
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    try {
      const snapshot = structuredClone(document.value)
      const outcome = runToSplitter(snapshot)
      run.value = buildRun(snapshot, outcome, outcome.status === 'paused' ? 'partial' : 'full')
      if (run.value.status === 'empty') issue.value = '场景里没有可运行的触发点。'
    } catch {
      issue.value = '场景计算未能完成，请检查元件连接。'
    } finally {
      busy.value = false
    }
  }

  async function continueRun() {
    const previous = run.value
    if (!previous || previous.status !== 'paused') return
    busy.value = true
    issue.value = ''
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    try {
      const snapshot = structuredClone(document.value)
      const outcome = resumeRun(snapshot, {
        events: previous.events,
        visitedPieceIds: previous.visitedPieceIds,
        firedConnectionIds: previous.firedConnectionIds,
        pending: previous.pending,
        pausedAtPieceId: previous.pausedAtPieceId,
        interruptedPieceId: previous.interruptedPieceId,
        interruptionReason: previous.interruptionReason,
      })
      run.value = buildRun(snapshot, outcome, outcome.status === 'paused' ? 'partial' : 'full')
      if (run.value.status === 'empty') issue.value = '场景里没有可运行的触发点。'
    } catch {
      issue.value = '场景计算未能完成，请检查元件连接。'
    } finally {
      busy.value = false
    }
  }

  function clear() { run.value = null; issue.value = '' }
  return { run, current, stale, paused, busy, issue, simulate, simulateToSplitter, continueRun, clear }
}
