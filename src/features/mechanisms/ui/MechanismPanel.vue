<script setup lang="ts">
import { computed } from 'vue'
import {
  ArrowDown, ArrowUp, Cable, CirclePlus, GitBranch, Lock, TriangleAlert, X,
} from '@lucide/vue'
import type { DeletionImpact } from '@/features/simulation'
import type { DominoDocument, MechanismConnection, SimulationRun } from '@/shared/document'
import { availableTargets } from '../lib/connections'

const props = defineProps<{
  document: DominoDocument
  run: SimulationRun | null
  lockedConnectionIds: Set<string>
  pendingDeleteId: string | null
  deletionImpact: DeletionImpact | null
  fromId: string
  toId: string
  message: string
}>()
const emit = defineEmits<{
  'update:fromId': [string]; 'update:toId': [string]; add: []
  askRemove: [string]; cancelRemove: []; confirmRemove: []
  reorder: [string, -1 | 1]; toggle: [string, boolean]
}>()
const sourceTargets = (from: string) => availableTargets(props.document, from)
const pieceLabel = (id: string) => props.document.pieces.find(piece => piece.id === id)?.label ?? id

/** 按来源分组并在组内按 order 排列，呈现可编辑的支路启动次序 */
const groups = computed(() => {
  const map = new Map<string, MechanismConnection[]>()
  for (const link of [...props.document.connections]
    .sort((a, b) => a.from.localeCompare(b.from) || a.order - b.order || a.id.localeCompare(b.id))) {
    const list = map.get(link.from) ?? []
    list.push(link)
    map.set(link.from, list)
  }
  return [...map.entries()].map(([from, links]) => ({
    from,
    source: props.document.pieces.find(piece => piece.id === from),
    links: links.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
  }))
})
const pausedLabel = computed(() => {
  const id = props.run?.pausedAtPieceId
  return id ? pieceLabel(id) : ''
})
const pendingLink = computed(() => props.document.connections.find(link => link.id === props.pendingDeleteId) ?? null)
</script>

<template>
  <section class="mechanism-panel">
    <div class="section-kicker"><span>03 / LINK</span><h2>机关连接</h2></div>
    <div class="link-summary"><GitBranch :size="15" /><span>{{ document.connections.length }} 条触发连线</span></div>
    <p v-if="run?.status === 'paused'" class="pause-hint" role="status">
      暂停在分岔「{{ pausedLabel }}」之前：已触发支路已锁定，未触发支路可调整顺序或删除。
    </p>
    <div v-if="document.connections.length" class="connection-list">
      <div v-for="group in groups" :key="group.from" class="connection-group">
        <div class="group-heading">
          <span class="group-source">{{ pieceLabel(group.from) }}</span>
          <span class="group-count">{{ group.links.length }} 条支路 · 按序启动</span>
        </div>
        <div v-for="(link, index) in group.links" :key="link.id" class="connection-row"
          :class="{ locked: lockedConnectionIds.has(link.id), disabled: !link.enabled }">
          <button class="connection-toggle" :class="{ active: link.enabled }" :aria-label="link.enabled ? '停用连线' : '启用连线'"
            :aria-pressed="link.enabled" :disabled="lockedConnectionIds.has(link.id)"
            @click="emit('toggle', link.id, !link.enabled)"><span></span></button>
          <span class="order-badge mono">{{ index + 1 }}</span>
          <span class="connection-names">{{ pieceLabel(link.to) }}</span>
          <span v-if="lockedConnectionIds.has(link.id)" class="lock-tag" title="该支路已触发，顺序已锁定"><Lock :size="11" />已锁定</span>
          <span v-else class="order-controls">
            <button class="order-button" aria-label="上移支路" :disabled="index === 0 || lockedConnectionIds.has(group.links[index - 1]?.id)"
              @click="emit('reorder', link.id, -1)"><ArrowUp :size="12" /></button>
            <button class="order-button" aria-label="下移支路" :disabled="index === group.links.length - 1 || lockedConnectionIds.has(group.links[index + 1]?.id)"
              @click="emit('reorder', link.id, 1)"><ArrowDown :size="12" /></button>
          </span>
          <button class="remove-link" :aria-label="'删除连线 ' + link.id" :disabled="lockedConnectionIds.has(link.id)"
            @click="emit('askRemove', link.id)"><X :size="14" /></button>
        </div>
      </div>
    </div>

    <div v-if="pendingLink && deletionImpact" class="delete-confirm" role="alertdialog" aria-label="删除支路影响确认">
      <div class="delete-confirm-title"><TriangleAlert :size="14" /> 删除支路：{{ pieceLabel(pendingLink.from) }} → {{ pieceLabel(pendingLink.to) }}</div>
      <template v-if="deletionImpact.blockedPieces.length">
        <p class="delete-confirm-copy">删除后以下后续元件将无法从起点到达：</p>
        <ul class="impact-list">
          <li v-for="piece in deletionImpact.blockedPieces" :key="piece.id" :class="{ goal: piece.kind === 'trigger' }">
            <span>{{ piece.label }}</span>
            <em v-if="piece.kind === 'trigger'">必经目标</em>
          </li>
        </ul>
        <p v-if="deletionImpact.blockedGoals.length" class="impact-warning">
          {{ deletionImpact.blockedGoals.length }} 个必经目标会变为不可达，目标面板将明确标注，不会继续显示为待完成。
        </p>
      </template>
      <p v-else class="delete-confirm-copy">该支路没有承载其他后续目标，删除不会影响剩余元件的可达性。</p>
      <div class="delete-confirm-actions">
        <button class="impact-cancel" @click="emit('cancelRemove')">保留支路</button>
        <button class="impact-confirm" @click="emit('confirmRemove')">确认删除</button>
      </div>
    </div>

    <div class="connection-builder">
      <div class="builder-title"><Cable :size="14" /> 新建连接</div>
      <label class="field-label">输出机关
        <select :value="fromId" @change="emit('update:fromId', ($event.target as HTMLSelectElement).value)">
          <option value="">选择起点</option>
          <option v-for="piece in document.pieces.filter(piece => piece.kind === 'splitter' || piece.kind === 'trigger')" :key="piece.id" :value="piece.id">{{ piece.label }}</option>
        </select>
      </label>
      <label class="field-label">接收元件
        <select :value="toId" @change="emit('update:toId', ($event.target as HTMLSelectElement).value)">
          <option value="">选择终点</option>
          <option v-for="piece in sourceTargets(fromId)" :key="piece.id" :value="piece.id">{{ piece.label }}</option>
        </select>
      </label>
      <button class="add-connection" :disabled="!fromId || !toId" @click="emit('add')"><CirclePlus :size="15" /> 添加触发线</button>
    </div>
    <p v-if="message" class="module-message" role="status">{{ message }}</p>
  </section>
</template>
