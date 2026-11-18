/** Keep only nonempty configured URLs; normalization is a separate component. */
export function hasConfiguredNodeUrl(value: string | undefined): value is string { return Boolean(value?.trim()); }
