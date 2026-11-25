<script setup lang="ts">
import { FastForward, Play, RotateCcw, Sparkles, StepForward } from '@lucide/vue'
import type { SimulationRun } from '@/shared/document'

defineProps<{ run: SimulationRun | null; stale: boolean; busy: boolean; issue: string; paused: boolean }>()
const emit = defineEmits<{ run: []; reset: []; runToSplitter: []; continueRun: [] }>()
</script>

<template>
  <section class="simulation-bar">
    <div class="simulation-status">
      <span class="status-orb" :class="run?.status ?? 'idle'"></span>
      <div>
        <strong>{{
          paused ? '暂停在分岔前'
          : stale ? '场景已更改'
          : run?.status === 'complete' ? '链路完成'
          : run?.status === 'interrupted' ? '链路中断' : '待运行'
        }}</strong>
        <small>{{
          paused ? '已发生事件保持不变，可调整未触发支路'
          : stale ? '当前回放属于上一个布局版本'
          : run ? `${run.events.length} 个事件已记录` : '运行一次，观察倒下顺序'
        }}</small>
      </div>
    </div>
    <p v-if="issue" class="simulation-error" role="alert">{{ issue }}</p>
    <div class="simulation-actions">
      <button v-if="run" class="secondary-button" @click="emit('reset')"><RotateCcw :size="15" /> 清除</button>
      <button v-if="paused" class="secondary-button" :disabled="busy" @click="emit('continueRun')">
        <StepForward v-if="!busy" :size="15" /><span v-else class="button-spinner"></span>继续运行
      </button>
      <button class="run-button" :disabled="busy" @click="paused ? emit('continueRun') : emit('runToSplitter')">
        <Play v-if="!busy" :size="16" fill="currentColor" /><span v-else class="button-spinner"></span>
        {{ busy ? '计算中…' : paused ? '继续运行' : stale ? '重新模拟' : '运行到分岔' }}<kbd>Space</kbd>
      </button>
      <button v-if="!paused" class="secondary-button" :disabled="busy" @click="emit('run')">
        <FastForward v-if="!busy" :size="15" /><span v-else class="button-spinner"></span>完整模拟
      </button>
    </div>
    <span class="simulation-decoration"><Sparkles :size="15" /> 可重复结果</span>
  </section>
</template>
