import { computed, ref, type Ref } from 'vue'
import type { DominoDocument, SimulationRun } from '@/shared/document'
import { addConnection, moveConnection, removeConnection } from '../lib/connections'
import { previewConnectionDeletion } from '@/features/simulation/lib/reachability'

export function useMechanisms(document: Ref<DominoDocument>, run: Ref<SimulationRun | null>, changed: () => void) {
  const fromId = ref('')
  const toId = ref('')
  const message = ref('')
  const pendingDeleteId = ref<string | null>(null)
  const availableFrom = computed(() => document.value.pieces.filter(piece => piece.kind === 'splitter' || piece.kind === 'trigger'))
  const availableTo = computed(() => document.value.pieces.filter(piece => piece.id !== fromId.value))

  /** 已经派发过的支路：顺序与删除全部锁定，保证已发生事件不被重排 */
  const lockedConnectionIds = computed(() => new Set(run.value?.firedConnectionIds ?? []))
  const deletionImpact = computed(() => {
    if (!pendingDeleteId.value) return null
    return previewConnectionDeletion(document.value, pendingDeleteId.value, run.value?.visitedPieceIds ?? [])
  })

  function add() {
    if (!fromId.value || !toId.value) return
    const updated = addConnection(document.value, fromId.value, toId.value)
    if (updated === document.value) {
      message.value = '这两个元件已经连接。'
      return
    }
    document.value = updated
    message.value = '机关连接已添加。'
    changed()
  }

  function askRemove(id: string) {
    if (lockedConnectionIds.value.has(id)) {
      message.value = '该支路已经触发，顺序已锁定，无法删除。'
      return
    }
    pendingDeleteId.value = id
    message.value = ''
  }

  function cancelRemove() {
    pendingDeleteId.value = null
  }

  function confirmRemove() {
    const id = pendingDeleteId.value
    if (!id) return
    if (lockedConnectionIds.value.has(id)) {
      message.value = '该支路已经触发，顺序已锁定，无法删除。'
      pendingDeleteId.value = null
      return
    }
    document.value = removeConnection(document.value, id)
    pendingDeleteId.value = null
    message.value = '机关连接已移除，后续目标可达性已更新。'
    changed()
  }

  function reorder(id: string, direction: -1 | 1) {
    if (lockedConnectionIds.value.has(id)) {
      message.value = '该支路已经触发，顺序已锁定。'
      return
    }
    const updated = moveConnection(document.value, id, direction, run.value?.firedConnectionIds ?? [])
    if (updated === document.value) return
    document.value = updated
    message.value = '未触发支路的启动顺序已调整。'
    changed()
  }

  function toggle(id: string, enabled: boolean) {
    if (lockedConnectionIds.value.has(id)) {
      message.value = '该支路已经触发，本次运行中无法再开关。'
      return
    }
    document.value = {
      ...document.value,
      connections: document.value.connections.map(link => link.id === id ? { ...link, enabled } : link),
    }
    changed()
  }

  return {
    fromId, toId, message, pendingDeleteId, deletionImpact, lockedConnectionIds,
    availableFrom, availableTo, add, askRemove, cancelRemove, confirmRemove, reorder, toggle,
  }
}
