// Parses Mitmachim Top (NodeBB) URLs into ids + an inferred draft type.
// NodeBB routes of interest:
//   /category/{cid}/{slug}
//   /topic/{tid}/{slug}/{index}
//   /compose?cid={cid} | ?tid={tid} | ?pid={pid}&action=edit

import type { DraftType } from '../types';

export interface UrlInfo {
  categoryId: string | null;
  topicId: string | null;
  postId: string | null;
  action: string | null;
  inferredType: DraftType | null;
  normalizedUrl: string;
}

function firstMatch(pathname: string, re: RegExp): string | null {
  const m = pathname.match(re);
  return m ? m[1] : null;
}

export function parseUrl(href: string): UrlInfo {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return {
      categoryId: null,
      topicId: null,
      postId: null,
      action: null,
      inferredType: null,
      normalizedUrl: href,
    };
  }

  const path = url.pathname;
  const q = url.searchParams;

  const categoryId = firstMatch(path, /\/category\/(\d+)/) ?? q.get('cid');
  const topicId = firstMatch(path, /\/topic\/(\d+)/) ?? q.get('tid');
  const postId = q.get('pid');
  const action = q.get('action');

  let inferredType: DraftType | null = null;
  if (action === 'edit' || postId) inferredType = 'edit';
  else if (topicId) inferredType = 'reply';
  else if (categoryId) inferredType = 'topic';

  // Stable normalized URL: origin + pathname, no query/hash, no trailing slash.
  const normalizedUrl = (url.origin + path).replace(/\/+$/, '') || url.origin;

  return { categoryId, topicId, postId, action, inferredType, normalizedUrl };
}

/** Builds the stable localDraftKey for a context. */
export function buildLocalDraftKey(params: {
  type: DraftType;
  categoryId?: string | null;
  topicId?: string | null;
  postId?: string | null;
  normalizedUrl: string;
}): string {
  switch (params.type) {
    case 'edit':
      if (params.postId) return `edit:post:${params.postId}`;
      break;
    case 'reply':
      if (params.topicId) return `reply:topic:${params.topicId}`;
      break;
    case 'topic':
      return `topic:new:category:${params.categoryId ?? 'unknown'}`;
  }
  return `fallback:url:${params.normalizedUrl}`;
}
