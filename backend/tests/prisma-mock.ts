import { createFallbackStore } from '../src/config/db';

export function createInMemoryPrismaMock() {
  return createFallbackStore();
}
