// Typed wrapper for content/popup -> background messaging.

import type { BgRequest, BgResponse } from './types';

export async function sendToBackground(req: BgRequest): Promise<BgResponse> {
  try {
    return (await chrome.runtime.sendMessage(req)) as BgResponse;
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? 'runtime error' };
  }
}
