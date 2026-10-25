import type { FileSystemPort } from "@zcode/contracts";
import {
  encodeQuantizedVector,
  vectorFamily,
  writeVectorShard,
  writeVectorStoreIndex,
  type QuantizedVector,
  type VectorStoreIndex,
  type VectorStoreLayout,
} from "./vector-store.js";

/**
 * 向量盘档 v2 的落盘调度（140 §P1-4，从 memory-recall-reminder 抽出以守住 400 行上限）。
 *
 * 盘档是派生缓存：按家族分片、只重写脏分片；写失败保留脏位等下个窗口。
 * 进程内向量缓存由 memory-recall-reminder 持有，这里只接收它做切片。
 */

const PERSIST_DEBOUNCE_MS = 5_000;

export interface VectorStoreSlot {
  loadPromise: Promise<void> | null;
  /** 盘档读出的量化向量（懒加载一次）。 */
  diskVectors: Map<string, QuantizedVector> | null;
  index: VectorStoreIndex | null;
  /** 当前 runtime 的完整向量缓存；落盘时按家族切片。 */
  cache?: Map<string, QuantizedVector>;
  dirtyFamilies: Set<string>;
  layout: VectorStoreLayout;
  model: string;
  root: string;
  timer?: ReturnType<typeof setTimeout>;
  fileSystem?: FileSystemPort;
}

const diskSlots = new Map<string, VectorStoreSlot>();

export function vectorStoreSlot(layout: VectorStoreLayout, model: string): VectorStoreSlot {
  let slot = diskSlots.get(layout.dir);
  if (!slot) {
    slot = {
      loadPromise: null,
      diskVectors: null,
      index: null,
      dirtyFamilies: new Set(),
      layout,
      model,
      root: "",
    };
    diskSlots.set(layout.dir, slot);
  }
  return slot;
}

export function scheduleVectorPersist(slot: VectorStoreSlot, fileSystem: FileSystemPort): void {
  slot.fileSystem = fileSystem;
  if (slot.timer !== undefined) return;
  slot.timer = setTimeout(() => {
    slot.timer = undefined;
    void persistSlot(slot);
  }, PERSIST_DEBOUNCE_MS);
  slot.timer.unref?.();
}

async function persistSlot(slot: VectorStoreSlot): Promise<void> {
  if (slot.dirtyFamilies.size === 0 || !slot.cache || !slot.fileSystem) return;
  const families = { ...slot.index?.families };
  const dirty = [...slot.dirtyFamilies];
  try {
    for (const family of dirty) {
      const vectors: Record<string, string> = {};
      for (const [key, vector] of slot.cache) {
        if (vectorFamily(key) !== family) continue;
        vectors[key] = encodeQuantizedVector(vector);
      }
      families[family] = await writeVectorShard(
        slot.fileSystem,
        slot.layout,
        slot.model,
        family,
        vectors,
      );
    }
    await writeVectorStoreIndex(slot.fileSystem, slot.layout, slot.model, slot.root, families);
    slot.index = { version: 2, model: slot.model, root: slot.root, families };
    for (const family of dirty) slot.dirtyFamilies.delete(family);
  } catch {
    // 写失败保留脏位，下个窗口再试；盘档是加速器，失败不阻断召回。
  }
}

/** 立即落盘所有脏槽（测试与进程收尾用）。 */
export async function flushVectorStores(): Promise<void> {
  for (const slot of diskSlots.values()) {
    if (slot.timer !== undefined) {
      clearTimeout(slot.timer);
      slot.timer = undefined;
    }
    await persistSlot(slot);
  }
}

/** 测试隔离：清空盘档内存态（不删文件）。 */
export function resetVectorStoresForTesting(): void {
  for (const slot of diskSlots.values()) {
    if (slot.timer !== undefined) clearTimeout(slot.timer);
  }
  diskSlots.clear();
}
