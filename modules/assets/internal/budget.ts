export interface AssetBudgetInput {
  readonly firstGarmentBytes: number;
  readonly swapBytes: number;
  readonly residentTextureBytes: number;
  readonly turntableFrames: number;
  readonly lods: readonly number[];
  readonly gpuTextureTypes: readonly string[];
}
export type AssetBudgetResult = { readonly ok: true } | { readonly ok: false; readonly error: 'ASSET_OVER_BUDGET'; readonly violations: readonly string[] };

/** Decimal transfer MB/KB; GPU memory uses binary MiB. Never trust NaN or negatives. */
export function checkAssetBudget(input: AssetBudgetInput): AssetBudgetResult {
  const violations: string[] = [];
  const budgets = [
    ['firstGarmentBytes', input.firstGarmentBytes, 1_200_000],
    ['swapBytes', input.swapBytes, 500_000],
    ['residentTextureBytes', input.residentTextureBytes, 256 * 1024 * 1024],
  ] as const;
  for (const [name, value, max] of budgets) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > max) violations.push(name);
  }
  if (input.turntableFrames !== 36) violations.push('turntableFrames');
  if (input.lods.length !== 3 || ![0, 1, 2].every((lod) => input.lods.includes(lod))) violations.push('lods');
  if (input.gpuTextureTypes.length === 0 || input.gpuTextureTypes.some((type) => type !== 'image/ktx2')) violations.push('gpuTextureTypes');
  return violations.length ? { ok: false, error: 'ASSET_OVER_BUDGET', violations } : { ok: true };
}

export function assetKey(tenantId: string, pipelineVersion: string, sha256: string, extension: 'glb' | 'ktx2' | 'webp'): string {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(tenantId) || !/^\d+\.\d+\.\d+$/.test(pipelineVersion) || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid asset identity');
  return `${tenantId}/${pipelineVersion}/${sha256}.${extension}`;
}
