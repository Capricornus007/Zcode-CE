import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import type { FileSystemPort } from "@zcode/contracts";

/**
 * 向量盘档 v2（140 §P1-4）：int8 量化 + 按知识家族分片。
 *
 * v1 是单文件 `<.zcode>/.vector-cache.<model>.<rootHash8>.json`：
 * 2048 维 float32×base64，一条约 11 KiB；2.4 万卡实测 242 MB，全量 JSON.parse
 * 峰值 RSS 818 MB，且每批新向量都要重写整份文件。
 *
 * v2 的三条改动：
 * - **int8 量化**：每条向量首 4 字节存 float32 scale，其余为 int8；一条约 2.7 KiB，
 *   体积降到约 1/4。余弦排序按 float32 基线做一致性门禁（≥95% top-10 相同）。
 * - **按家族分片**：`kb-<family>-*` 一族一个 `<family>.json`，落盘只重写脏分片。
 * - **索引文件**：`index.json` 记录 model/root/现存分片；读取不依赖目录枚举。
 *
 * 盘档是派生缓存：版本、模型或 root 不符即整体作废重算，绝不当作知识副本。
 */

export const VECTOR_STORE_VERSION = 2;
const STORE_DIR_NAME = ".vector-cache";
const INDEX_FILE_NAME = "index.json";
/** int8 量化上限；余弦误差由 scale 承担。 */
const QUANT_MAX = 127;

export interface QuantizedVector {
  /** 有符号 int8 分量（-127..127）。 */
  data: Int8Array;
  scale: number;
  /** 反量化后的 L2 范数（用于余弦分母，避免逐次重算）。 */
  norm: number;
}

export interface VectorStoreIndex {
  version: number;
  model: string;
  root: string;
  /** family -> 分片文件名。 */
  families: Record<string, string>;
}

export interface VectorStoreLayout {
  dir: string;
  indexPath: string;
}

/** 模型名里的路径不安全字符折叠成下划线。 */
function safeModelId(model: string): string {
  return model.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 48) || "default";
}

function rootHash(corpusRoot: string): string {
  return createHash("sha256").update(corpusRoot).digest("hex").slice(0, 8);
}

/** 盘档目录：<corpus 根上级目录>/.vector-cache/<model>/<rootHash8>/。 */
export function vectorStoreLayout(corpusRoot: string, model: string): VectorStoreLayout {
  const dir = join(dirname(corpusRoot), STORE_DIR_NAME, safeModelId(model), rootHash(corpusRoot));
  return { dir, indexPath: join(dir, INDEX_FILE_NAME) };
}

/** 键前缀（`<root>\u0000filename\u0000mtime\u0000description`）→ 知识家族。 */
export function vectorFamily(cacheKey: string): string {
  const filename = cacheKey.split("\u0000")[1] ?? "";
  const match = /^kb-([a-z0-9]+)-/.exec(filename);
  return match?.[1] ?? "other";
}

/** 量化：scale 取最大绝对值 / 127，0 向量按全零存。 */
export function quantizeVector(vector: readonly number[]): QuantizedVector {
  if (vector.length === 0) return { data: new Int8Array(0), scale: 1, norm: 0 };
  let maxAbs = 0;
  for (const value of vector) {
    const abs = Math.abs(value);
    if (abs > maxAbs) maxAbs = abs;
  }
  if (maxAbs === 0) return { data: new Int8Array(vector.length), scale: 1, norm: 0 };
  const scale = maxAbs / QUANT_MAX;
  const data = new Int8Array(vector.length);
  let sumSquares = 0;
  for (let index = 0; index < vector.length; index += 1) {
    const quantized = Math.max(-QUANT_MAX, Math.min(QUANT_MAX, Math.round(vector[index]! / scale)));
    data[index] = quantized;
    sumSquares += quantized * quantized;
  }
  return { data, scale, norm: scale * Math.sqrt(sumSquares) };
}

/** 量化向量 → base64（4 字节 float32 scale + int8 分量）。空向量返回空串。 */
export function encodeQuantizedVector(vector: QuantizedVector): string {
  if (vector.data.length === 0) return "";
  const buffer = Buffer.alloc(4 + vector.data.length);
  buffer.writeFloatLE(vector.scale, 0);
  for (let index = 0; index < vector.data.length; index += 1) {
    buffer[4 + index] = vector.data[index]! & 0xff;
  }
  return buffer.toString("base64");
}

/** base64 → 量化向量；坏输入返回 null（调用方按未缓存处理）。 */
export function decodeQuantizedVector(encoded: string): QuantizedVector | null {
  if (!encoded) return null;
  try {
    const normalized = encoded.replace(/\s+/gu, "");
    if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(normalized) || normalized.length % 4 !== 0) return null;
    const buffer = Buffer.from(normalized, "base64");
    if (buffer.toString("base64") !== normalized) return null;
    if (buffer.byteLength <= 4) return null;
    const scale = buffer.readFloatLE(0);
    if (!Number.isFinite(scale) || scale < 0 || scale > 1e9) return null;
    const data = new Int8Array(buffer.byteLength - 4);
    let sumSquares = 0;
    for (let index = 0; index < data.length; index += 1) {
      const signed = (buffer[4 + index]! << 24) >> 24;
      data[index] = signed;
      sumSquares += signed * signed;
    }
    return { data, scale, norm: scale * Math.sqrt(sumSquares) };
  } catch {
    return null;
  }
}

interface PersistedVectorShard {
  version: number;
  model: string;
  family: string;
  vectors: Record<string, string>;
}

/** 读索引；缺失/版本/model/root 不符返回 null。 */
export async function readVectorStoreIndex(
  fileSystem: FileSystemPort,
  layout: VectorStoreLayout,
  model: string,
  root: string,
): Promise<VectorStoreIndex | null> {
  try {
    const read = await fileSystem.readTextFile({ path: layout.indexPath });
    const parsed = JSON.parse(read.content) as Partial<VectorStoreIndex>;
    if (parsed.version !== VECTOR_STORE_VERSION) return null;
    if (parsed.model !== model || parsed.root !== root) return null;
    if (typeof parsed.families !== "object" || parsed.families === null) return null;
    return {
      version: VECTOR_STORE_VERSION,
      model,
      root,
      families: Object.fromEntries(
        Object.entries(parsed.families).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
    };
  } catch {
    return null;
  }
}

/** 读全部分片并合并为 key→量化向量；任何单片损坏只跳过该片。 */
export async function loadQuantizedVectors(
  fileSystem: FileSystemPort,
  layout: VectorStoreLayout,
  index: VectorStoreIndex,
): Promise<Map<string, QuantizedVector>> {
  const vectors = new Map<string, QuantizedVector>();
  for (const [family, filename] of Object.entries(index.families)) {
    try {
      const read = await fileSystem.readTextFile({ path: join(layout.dir, filename) });
      const parsed = JSON.parse(read.content) as Partial<PersistedVectorShard>;
      if (
        parsed.version !== VECTOR_STORE_VERSION ||
        parsed.family !== family ||
        typeof parsed.vectors !== "object" ||
        parsed.vectors === null
      ) {
        continue;
      }
      for (const [key, encoded] of Object.entries(parsed.vectors)) {
        if (typeof encoded !== "string") continue;
        const decoded = decodeQuantizedVector(encoded);
        if (decoded) vectors.set(key, decoded);
      }
    } catch {
      // 单片缺失/损坏：该家族本轮按未缓存处理，下一轮续补。
    }
  }
  return vectors;
}

/** 写一个家族分片。 */
export async function writeVectorShard(
  fileSystem: FileSystemPort,
  layout: VectorStoreLayout,
  model: string,
  family: string,
  vectors: Record<string, string>,
): Promise<string> {
  const filename = `${family.replace(/[^A-Za-z0-9_-]+/g, "_") || "other"}.json`;
  const shard: PersistedVectorShard = { version: VECTOR_STORE_VERSION, model, family, vectors };
  await fileSystem.writeTextFile({
    path: join(layout.dir, filename),
    content: JSON.stringify(shard),
    atomic: true,
    createParents: true,
  });
  return filename;
}

/** 写索引（families 由调用方给出最终集合）。 */
export async function writeVectorStoreIndex(
  fileSystem: FileSystemPort,
  layout: VectorStoreLayout,
  model: string,
  root: string,
  families: Record<string, string>,
): Promise<void> {
  const index: VectorStoreIndex = { version: VECTOR_STORE_VERSION, model, root, families };
  await fileSystem.writeTextFile({
    path: layout.indexPath,
    content: JSON.stringify(index),
    atomic: true,
    createParents: true,
  });
}
