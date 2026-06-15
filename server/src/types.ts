// Shared server-side types. Mirrors the contract in docs/API.md.

export type DraftType = 'topic' | 'reply' | 'edit';

/** A row in the `drafts` table (snake_case as stored in SQLite). */
export interface DraftRow {
  id: string;
  user_id: string;
  type: DraftType;
  local_draft_key: string;
  encrypted_title: string | null;
  encrypted_content: string;
  encryption_iv: string | null;
  encryption_salt: string | null;
  category_id: string | null;
  category_name: string | null;
  topic_type: string | null;
  topic_id: string | null;
  post_id: string | null;
  url: string | null;
  device_id: string | null;
  client_updated_at: string | null;
  server_updated_at: string;
  created_at: string;
  deleted_at: string | null;
}

/** A row in the `devices` table. */
export interface DeviceRow {
  id: string;
  user_id: string;
  device_name: string | null;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
}

/** A row in the `users` table. */
export interface UserRow {
  id: string;
  sync_key_hash: string;
  created_at: string;
  last_login_at: string | null;
}

/** A row in the `tokens` table. */
export interface TokenRow {
  id: string;
  user_id: string;
  device_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

/** The camelCase draft object returned over the wire (DraftDTO in API.md). */
export interface DraftDTO {
  id: string;
  type: DraftType;
  localDraftKey: string;
  encryptedTitle: string | null;
  encryptedContent: string;
  encryptionIv: string | null;
  encryptionSalt: string | null;
  categoryId: string | null;
  categoryName: string | null;
  topicType: string | null;
  topicId: string | null;
  postId: string | null;
  url: string | null;
  deviceId: string | null;
  deviceName: string | null;
  clientUpdatedAt: string | null;
  serverUpdatedAt: string;
  createdAt: string;
  deletedAt: string | null;
}

/** Authenticated principal attached to a request after auth middleware. */
export interface AuthContext {
  userId: string;
  deviceId: string;
  tokenId: string;
}

/** Decorate the Fastify request with the auth context. */
declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}
