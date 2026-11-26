import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { MachineInfo } from '@/api/types'
import type { MessageKey } from '@/i18n'

/** The export settings of the config (null = the defaults); the Studios' lib/buildResources. */
export interface ExportResourcesValue {
  export_cores?: number | null
  export_memory_percent?: number | null
}

/** Cores and memory of this machine (GET /api/machine). */
export function useMachine() {
  return useQuery({ queryKey: ['machine'], queryFn: api.machine }).data
}

/** Threads the export will use: the same rule as fpx.workers.plan (unknown cores or memory -> 1). */
export function plannedThreads(machine: MachineInfo, value: ExportResourcesValue) {
  if (!machine.cores || !machine.memory_mb) return 1
  const cores = value.export_cores ? Math.max(1, Math.min(value.export_cores, machine.cores)) : machine.default_cores
  const [low, high] = machine.memory_percent_range
  const percent = Math.max(low, Math.min(value.export_memory_percent ?? machine.default_memory_percent, high))
  const fits = Math.floor((machine.memory_mb * percent) / 100 / machine.worker_memory_mb)
  return Math.max(1, Math.min(cores, fits))
}

/** What is wrong with the settings (message keys), empty when they can be saved. The backend brings out-of-range
 * values into range anyway; this tells the user before saving. */
export function exportResourcesErrors(machine: MachineInfo | undefined, value: ExportResourcesValue) {
  const errors: { cores?: MessageKey; memory?: MessageKey } = {}
  const cores = value.export_cores
  if (cores != null && (!Number.isInteger(cores) || cores < 1 || (machine?.cores != null && cores > machine.cores)))
    errors.cores = 'exportResources.coresOutOfRange'
  const percent = value.export_memory_percent
  const [low, high] = machine?.memory_percent_range ?? [10, 90]
  if (percent != null && (!Number.isInteger(percent) || percent < low || percent > high))
    errors.memory = 'exportResources.memoryOutOfRange'
  return errors
}
