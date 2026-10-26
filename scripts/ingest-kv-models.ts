/**
 * Ingest kv-cache-calculator model configs + KV layout into llm-infra data.
 *
 * Steps:
 *  1. Load the 52 models from ../kv-cache-calculator/web/assets/models.js.
 *  2. Resolve each model's HuggingFace id to a ModelScope id (org mapping below).
 *  3. Download config.json from ModelScope (cached under scripts/.kv-configs/),
 *     extract architecture fields, and estimate paramsTotal/paramsActive.
 *  4. Write the raw audit trail to src/data/models-scope.json.
 *  5. Merge into src/data/models.json:
 *       - existing entries → append the `kv` layout block (arch untouched)
 *       - new models        → build full ModelSpec entries
 *
 * Usage: npx tsx scripts/ingest-kv-models.ts
 *
 * The script is idempotent: re-running only fills in what's missing.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ─── Paths ────────────────────────────────────────────────────────────────
const ROOT = path.resolve(import.meta.dirname, "..");
const KV_MODELS_JS = path.resolve(ROOT, "..", "kv-cache-calculator", "web", "assets", "models.js");
const MODELS_JSON = path.join(ROOT, "src", "data", "models.json");
const MODELS_SCOPE_JSON = path.join(ROOT, "src", "data", "models-scope.json");
const CACHE_DIR = path.join(ROOT, "scripts", ".kv-configs");

// HF org → ModelScope org. Unknown orgs keep their HF name.
const ORG_MAP: Record<string, string> = {
  "deepseek-ai": "deepseek-ai",
  "zai-org": "ZhipuAI",
  "moonshotai": "MoonshotAI",
  "Qwen": "Qwen",
  "google": "google",
  "CohereLabs": "CohereLabs",
  "XiaomiMiMo": "XiaomiMiMo",
  "MiniMaxAI": "MiniMax",
  "meta-llama": "meta-llama",
};

// KVFormula union (mirrors src/lib/formulas/types.ts)
type KVFormula =
  | "standard_gqa" | "mla" | "dsa_mla"
  | "qwen_linear_full_hybrid" | "mixed_full_sliding_gqa"
  | "minimax_msa" | "deepseek_v4_hybrid";

interface KVCacheModel {
  id: string;
  label: string;
  family: string;
  formula: KVFormula;
  fields: Record<string, unknown>;
  default_tokens: number;
  max_position_embeddings: number;
  source_retrieved_at: string;
  source_url: string;
}

interface Arch {
  numLayers: number; hiddenSize: number; intermediateSize: number;
  numAttentionHeads: number; numKeyValueHeads: number; headDim: number;
  vocabSize: number; tieWordEmbeddings: boolean;
  attentionType: "mha" | "gqa" | "mqa" | "mla";
  maxContextLength: number; positionalEmbedding: "rope" | "alibi" | "yarn" | "learned";
}

interface IngestedModel {
  kvId: string;
  hfId: string;
  msId: string;
  label: string;
  family: string;
  formula: KVFormula;
  fields: Record<string, unknown>;
  defaultTokens: number;
  maxPositionEmbeddings: number;
  sourceUrl: string;
  releaseDate: string;
  ok: boolean;
  error?: string;
  config?: Record<string, unknown>;
  architecture?: Arch;
  paramsTotal?: number;
  paramsActive?: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function hfIdFromSource(url: string): string | null {
  const m = url.match(/huggingface\.co\/([^/]+\/[^/]+)/);
  return m ? m[1] : null;
}

function msIdFromHf(hfId: string): string {
  const [org, name] = hfId.split("/");
  return `${ORG_MAP[org] ?? org}/${name}`;
}

/** Pick a value from the config, preferring text_config (VLMs nest text config). */
function pick(cfg: Record<string, unknown>, ...keys: string[]): unknown {
  const tc = (cfg.text_config ?? {}) as Record<string, unknown>;
  for (const k of keys) {
    if (tc[k] !== undefined) return tc[k];
    if (cfg[k] !== undefined) return cfg[k];
  }
  return undefined;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Rough params estimate from the model label, e.g. "Qwen3.5-397B-A17B" → 397B total / 17B active. */
function estimateParamsFromName(label: string): { total: number; active?: number } {
  const m = label.match(/(\d+(?:\.\d+)?)\s*[bB]/);
  if (!m) return { total: 0 };
  const total = parseFloat(m[1]) * 1e9;
  const a = label.match(/[aA](\d+(?:\.\d+)?)\s*[bB]/);
  const active = a ? parseFloat(a[1]) * 1e9 : undefined;
  return { total, active };
}

/**
 * Estimate paramsTotal / paramsActive from the architecture.
 * HF configs carry no param count; keys live at top level or in text_config.
 */
function estimateParams(
  cfg: Record<string, unknown>,
  arch: Arch
): { total: number; active?: number } {
  const hidden = arch.hiddenSize;
  const layers = arch.numLayers;
  const heads = arch.numAttentionHeads;
  const kvHeads = arch.numKeyValueHeads;
  const vocab = arch.vocabSize;
  const inter = arch.intermediateSize;
  const tied = arch.tieWordEmbeddings;

  // Attention. MLA (kv_lora_rank present) projects through a low-rank latent,
  // so the k/v path is hidden×kv_lora_rank instead of hidden×head_dim×kv_heads.
  const kvLoraRank = num(pick(cfg, "kv_lora_rank"));
  let attn: number;
  if (kvLoraRank > 0) {
    const nope = num(pick(cfg, "qk_nope_head_dim"), 0);
    const rope = num(pick(cfg, "qk_rope_head_dim"), 0);
    const latent = (nope + rope) || arch.headDim;
    // q + o through the full latent dim, k/v compressed to kv_lora_rank
    attn = 2 * hidden * heads * latent + hidden * kvLoraRank;
  } else {
    // q + o are dense (hidden²), k + v scale with num_kv_heads
    attn = 2 * hidden * hidden + 2 * hidden * arch.headDim * kvHeads;
  }

  // MoE detection — expert-count key varies across model families.
  const nExperts = num(pick(cfg, "num_local_experts", "num_experts", "n_routed_experts"));
  const nShared = num(pick(cfg, "num_shared_experts", "n_shared_experts"));
  const topK = num(pick(cfg, "num_experts_per_tok", "top_k_experts"), 1);
  const moeInter = num(pick(cfg, "moe_intermediate_size", "shared_expert_intermediate_size"), inter);
  const isMoe = nExperts > 0;

  // Some MoE models double the MLP width (Gemma 4), others gate it.
  const mlpScale = pick(cfg, "use_double_wide_mlp") === true ? 2 : 1;

  let mlpTotal: number;
  if (isMoe) {
    const sharedInter = num(pick(cfg, "shared_expert_intermediate_size"), moeInter);
    // routed experts use moe_intermediate_size; shared experts use their own
    mlpTotal = mlpScale * (nExperts * 3 * hidden * moeInter + nShared * 3 * hidden * sharedInter);
  } else {
    mlpTotal = mlpScale * 3 * hidden * inter;
  }

  const embed = vocab * hidden;
  const lmHead = tied ? 0 : vocab * hidden;
  const total = layers * (attn + mlpTotal) + embed + lmHead;

  let active: number | undefined;
  if (isMoe) {
    const sharedInter = num(pick(cfg, "shared_expert_intermediate_size"), moeInter);
    const base = layers * attn + embed + lmHead;
    active = base + mlpScale * layers * (topK * 3 * hidden * moeInter + nShared * 3 * hidden * sharedInter);
  }

  return { total, active };
}

function inferAttentionType(formula: KVFormula, numHeads: number, kvHeads: number): Arch["attentionType"] {
  if (formula === "mla" || formula === "dsa_mla") return "mla";
  if (kvHeads === 1) return "mqa";
  if (kvHeads > 0 && kvHeads < numHeads) return "gqa";
  return "mha";
}

/** Build the architecture from a fetched config + the kv-cache layout fields. */
function extractArchitecture(cfg: Record<string, unknown>, m: KVCacheModel): Arch {
  const f = m.fields;
  const numLayers = num(pick(cfg, "num_hidden_layers"), num(f.num_hidden_layers));
  const hiddenSize = num(pick(cfg, "hidden_size"), 0);
  const numAttentionHeads = num(pick(cfg, "num_attention_heads"), num(f.num_attention_heads));
  const numKeyValueHeads = num(pick(cfg, "num_key_value_heads"), num(f.num_key_value_heads, numAttentionHeads));
  const headDim = num(
    pick(cfg, "head_dim"),
    num(f.head_dim, hiddenSize ? hiddenSize / Math.max(1, numAttentionHeads) : 0)
  );
  const intermediateSize = num(
    pick(cfg, "intermediate_size", "moe_intermediate_size"),
    Math.round(4 * hiddenSize)
  );
  const vocabSize = num(pick(cfg, "vocab_size"));
  const tieWordEmbeddings = Boolean(pick(cfg, "tie_word_embeddings") ?? false);
  const maxContextLength = m.max_position_embeddings || num(pick(cfg, "max_position_embeddings"), 131072);

  return {
    numLayers,
    hiddenSize,
    intermediateSize,
    numAttentionHeads,
    numKeyValueHeads,
    headDim,
    vocabSize,
    tieWordEmbeddings,
    attentionType: inferAttentionType(m.formula, numAttentionHeads, numKeyValueHeads),
    maxContextLength,
    positionalEmbedding: "rope",
  };
}

// ─── Fetching ─────────────────────────────────────────────────────────────

async function fetchConfig(msId: string, kvId: string): Promise<Record<string, unknown> | null> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, `${kvId}.json`);
  if (fs.existsSync(cachePath)) {
    try {
      return JSON.parse(fs.readFileSync(cachePath, "utf-8")) as Record<string, unknown>;
    } catch { /* refetch */ }
  }
  const url = `https://modelscope.cn/api/v1/models/${encodeURIComponent(msId)}/repo?FilePath=config.json&Revision=master`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return null;
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  fs.writeFileSync(cachePath, JSON.stringify(json, null, 2));
  return json;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

// ─── Merge into models.json ───────────────────────────────────────────────

interface ExistingEntry {
  [k: string]: unknown;
  id: string;
  architecture: Record<string, unknown>;
}

function mergeIntoModels(ingested: IngestedModel[]): { appended: number; newModels: number; failed: number } {
  const db = JSON.parse(fs.readFileSync(MODELS_JSON, "utf-8")) as ExistingEntry[];

  // Index existing entries by lowercase id and huggingfaceId for overlap matching.
  const byKey = new Map<string, ExistingEntry>();
  for (const e of db) {
    byKey.set(e.id.toLowerCase(), e);
    if (typeof e.huggingfaceId === "string") byKey.set(e.huggingfaceId.toLowerCase(), e);
  }

  let appended = 0;
  let newModels = 0;
  let failed = 0;

  for (const ing of ingested) {
    const existing = byKey.get(ing.hfId.toLowerCase());

    if (existing) {
      // Overlap model: append `kv` layout only, never touch arch/params.
      if (!existing.kv) {
        existing.kv = {
          formula: ing.formula,
          fields: { ...ing.fields, _source: ing.msId },
          defaultTokens: ing.defaultTokens,
          maxPositionEmbeddings: ing.maxPositionEmbeddings,
        };
        appended++;
      }
    } else {
      // New model: build a full entry from fetched config (or fallback).
      const entry = buildNewEntry(ing);
      db.push(entry);
      newModels++;
      if (!ing.ok) failed++;
    }
  }

  fs.writeFileSync(MODELS_JSON, JSON.stringify(db, null, 2) + "\n");
  return { appended, newModels, failed };
}

/**
 * Resolve params. Labels that encode sizes (e.g. "Qwen3.5-397B-A17B",
 * "Gemma 4 26B-A4B") are authoritative — they follow the vendor's own
 * total/active param convention. Otherwise fall back to the architecture
 * estimate from the fetched config.
 */
function resolveParams(ing: IngestedModel): { total: number; active?: number; source: "label" | "arch" | "none" } {
  const label = estimateParamsFromName(ing.label);
  if (label.total > 0) {
    return {
      total: label.total,
      active: label.active,
      source: "label",
    };
  }
  if (ing.architecture) {
    const est = estimateParams(ing.config ?? {}, ing.architecture);
    if (est.total > 0) return { ...est, source: "arch" };
  }
  return { total: 0, source: "none" };
}

function buildNewEntry(ing: IngestedModel): Record<string, unknown> {
  const notes: string[] = [];
  const params = resolveParams(ing);
  if (params.source === "label") notes.push("params from model name (total/active suffix)");
  else if (params.source === "arch") notes.push("params estimated from architecture");
  else notes.push("params unavailable");

  let arch = ing.architecture;
  if (!arch) {
    // Fallback when the fetch failed: derive what we can from the layout fields.
    const f = ing.fields;
    const numLayers = num(f.num_hidden_layers);
    const headDim = num(f.head_dim);
    const numAttentionHeads = num(f.num_attention_heads);
    const numKeyValueHeads = num(f.num_key_value_heads, numAttentionHeads);
    arch = {
      numLayers,
      hiddenSize: 0,
      intermediateSize: 0,
      numAttentionHeads,
      numKeyValueHeads,
      headDim,
      vocabSize: 0,
      tieWordEmbeddings: false,
      attentionType: inferAttentionType(ing.formula, numAttentionHeads, numKeyValueHeads),
      maxContextLength: ing.maxPositionEmbeddings,
      positionalEmbedding: "rope",
    };
  }

  const entry: Record<string, unknown> = {
    id: ing.hfId,
    family: ing.family.toLowerCase(),
    displayName: ing.label,
    releaseDate: ing.releaseDate,
    license: "unknown",
    paramsTotal: Math.round(params.total),
    architecture: arch,
    kv: {
      formula: ing.formula,
      fields: { ...ing.fields, _source: ing.msId },
      defaultTokens: ing.defaultTokens,
      maxPositionEmbeddings: ing.maxPositionEmbeddings,
    },
    notes: notes.join("; "),
    huggingfaceId: ing.hfId,
  };
  if (params.active) entry.paramsActive = Math.round(params.active);
  return entry;
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const kvData = require(KV_MODELS_JS) as { models: KVCacheModel[] };
  console.log(`Loaded ${kvData.models.length} models from kv-cache-calculator.`);

  // Resolve ids and fetch configs (concurrency 4).
  const withIds = kvData.models.map((m) => {
    const hfId = hfIdFromSource(m.source_url) ?? `${m.family}/${m.id}`;
    return { m, hfId, msId: msIdFromHf(hfId) };
  });

  const ingested = await mapLimit(withIds, 4, async ({ m, hfId, msId }): Promise<IngestedModel> => {
    const base: IngestedModel = {
      kvId: m.id,
      hfId,
      msId,
      label: m.label,
      family: m.family,
      formula: m.formula,
      fields: m.fields,
      defaultTokens: m.default_tokens,
      maxPositionEmbeddings: m.max_position_embeddings,
      sourceUrl: m.source_url,
      releaseDate: m.source_retrieved_at,
      ok: false,
    };
    try {
      const cfg = await fetchConfig(msId, m.id);
      if (!cfg) {
        base.error = "ModelScope config.json not found";
        return base;
      }
      base.config = cfg;
      base.architecture = extractArchitecture(cfg, m);
      base.ok = true;
      return base;
    } catch (e) {
      base.error = e instanceof Error ? e.message : String(e);
      return base;
    }
  });

  // Audit trail.
  fs.writeFileSync(MODELS_SCOPE_JSON, JSON.stringify(ingested, null, 2) + "\n");

  // Which entries were already present before the merge (for the report).
  const preDb = JSON.parse(fs.readFileSync(MODELS_JSON, "utf-8")) as { id: string; huggingfaceId?: string }[];
  const preKeys = new Set<string>();
  for (const e of preDb) {
    preKeys.add(e.id.toLowerCase());
    if (e.huggingfaceId) preKeys.add(e.huggingfaceId.toLowerCase());
  }

  // Merge.
  const { appended, newModels, failed } = mergeIntoModels(ingested);

  // Report.
  console.log(`\nmodels-scope.json written (${ingested.length} entries).`);
  console.log(`models.json updated: +${appended} kv blocks appended, +${newModels} new models, ${failed} failed fetches.`);
  for (const ing of ingested.filter((i) => !i.ok)) {
    console.log(`  ✗ ${ing.hfId} (${ing.msId}) — ${ing.error}`);
  }
  const brandNew = ingested.filter((i) => i.ok && !preKeys.has(i.hfId.toLowerCase()));
  if (brandNew.length > 0) {
    console.log("\nNew model entries:");
    for (const ing of brandNew) {
      const p = resolveParams(ing);
      console.log(
        `  + ${ing.hfId} — ${Math.round((p.total ?? 0) / 1e9)}B total` +
        (p.active ? ` / ${Math.round(p.active / 1e9)}B active` : "") +
        ` (${ing.formula}, ${p.source})`
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
