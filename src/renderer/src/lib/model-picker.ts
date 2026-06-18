import { buildModelGroups, parseModelRef, formatModelRef } from '@shared/model-ref'
import type { ProviderModels } from '@shared/model-ref'
import type { ModelPickerGroup } from '../components/ModelPicker'

/**
 * Adapt the shared cross-provider catalog (#103) to the `ModelPicker`'s group
 * shape: one labelled group per connected provider, each option carrying its
 * `<provider>:<model>` ref as the stored value while showing the bare model id.
 */
export function toPickerGroups(providers: ProviderModels[]): ModelPickerGroup[] {
  return buildModelGroups(providers).map((g) => ({
    label: g.label,
    options: g.options.map((o) => ({ value: o.ref, label: o.modelId }))
  }))
}

/**
 * Canonical `<provider>:<model>` ref for a stored selection (bare legacy id or an
 * already-qualified ref), so the picker highlights the current value against the
 * cross-provider catalog even before it's re-picked.
 */
export function canonicalRef(value: string, providerIds: string[], fallback: string): string {
  const { provider, modelId } = parseModelRef(value, { providers: providerIds, fallback })
  return formatModelRef(provider, modelId)
}
