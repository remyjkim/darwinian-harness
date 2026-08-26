// ABOUTME: Deterministic keychain test doubles for explicit credential-custody injection.
// ABOUTME: Keeps tests hermetic without production environment switches or global mutable state.

import type { KeychainBackend } from "../../cli/core/secret-store";

export class InMemoryKeychainBackend implements KeychainBackend {
  private key: Buffer | null = null;
  available = true;
  failDelete: Error | null = null;
  failLoad: Error | null = null;
  loadCalls = 0;
  storeCalls = 0;
  deleteCalls = 0;

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async loadKey(): Promise<Buffer | null> {
    this.loadCalls += 1;
    if (this.failLoad) throw this.failLoad;
    return this.key ? Buffer.from(this.key) : null;
  }

  async storeKey(key: Buffer): Promise<void> {
    this.storeCalls += 1;
    this.key = Buffer.from(key);
  }

  async deleteKey(): Promise<void> {
    this.deleteCalls += 1;
    if (this.failDelete) throw this.failDelete;
    this.key = null;
  }

  hasKey(): boolean {
    return this.key !== null;
  }

  discardKey(): void {
    this.key = null;
  }
}
