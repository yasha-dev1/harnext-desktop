// Build the option list for the New Loop form's Provider <select> (#141).
//
// A controlled `<select value={provider}>` whose value has no matching
// `<option>` silently renders the *first* option instead — so when the
// resolved provider (the global default) isn't among the authenticated
// providers, the select shows the wrong provider while state still holds the
// real one. On submit the loop is pinned to a provider the user never saw.
//
// Mirroring how the Model select already prepends its current value, we always
// include the resolved provider as an option (flagged "not connected" when it
// has no key), so the select can never desync from state.

export interface ProviderLike {
  id: string
  name?: string
  authenticated?: boolean
}

export interface ProviderSelectOption {
  id: string
  label: string
  /** Whether this provider has a key / is usable. */
  connected: boolean
}

/**
 * Options to render for the provider select, given every known provider and the
 * provider currently held in state. Authenticated providers come first; if the
 * resolved `provider` isn't among them it's prepended as a "(not connected)"
 * option so the controlled select always has a matching value.
 */
export function buildProviderOptions(
  providers: ProviderLike[],
  provider: string
): ProviderSelectOption[] {
  const auth = providers.filter((p) => p.authenticated)
  const options: ProviderSelectOption[] = auth.map((p) => ({
    id: p.id,
    label: p.name ?? p.id,
    connected: true
  }))

  if (provider && !auth.some((p) => p.id === provider)) {
    const known = providers.find((p) => p.id === provider)
    options.unshift({
      id: provider,
      label: `${known?.name ?? provider} (not connected)`,
      connected: false
    })
  }

  return options
}
