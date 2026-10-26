/**
 * Ingest a user-curated list of additional models from ModelScope.
 *
 * These are models NOT covered by kv-cache-calculator's models.js and NOT
 * already present in src/data/models.json. The script:
 *  1. Fetches config.json from ModelScope for each model id (cached under
 *     scripts/.kv-configs/).
 *  2. Extracts the architecture (num_layers / hidden / heads / vocab / …).
 *  3. Detects the KV formula from config fields:
 *       compress_ratios                         → deepseek_v4_hybrid
 *       kv_lora_rank + index_head_dim           → dsa_mla
 *       kv_lora_rank (no indexer)               → mla
 *       none of the above                       → generic GQA (no kv block)
 *  4. Estimates paramsTotal / paramsActive (label suffix is authoritative,
 *     otherwise estimated from the architecture).
 *  5. Merges new entries into src/data/models.json (idempotent — skips any id
 *     already present).
 *
 * Usage: npx tsx scripts/ingest-modelscope-extra.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MODELS_JSON = path.join(ROOT, "src", "data", "models.json");
const MODELS_SCOPE_EXTRA_JSON = path.join(ROOT, "src", "data", "models-scope-extra.json");
const CACHE_DIR = path.join(ROOT, "scripts", ".kv-configs");

// ─── Curated list: [id (stored), ModelScope id (fetched), family, label] ────
// id uses the HF-style org so new entries group with existing ones (zai-org for
// GLM, MiniMaxAI for MiniMax, moonshotai for Kimi).
const MODELS: { id: string; msId: string; family: string; label: string }[] = [
  { id: "Qwen/Qwen3.8-27B",         msId: "Qwen/Qwen3.8-27B",         family: "qwen3.8",  label: "Qwen3.8-27B" },
  { id: "Qwen/Qwen3.8-2.4T-A95B",   msId: "Qwen/Qwen3.8-2.4T-A95B",   family: "qwen3.8",  label: "Qwen3.8-2.4T-A95B" },
  { id: "zai-org/GLM-4.6V",         msId: "ZhipuAI/GLM-4.6V",         family: "glm",      label: "GLM-4.6V" },
  { id: "zai-org/GLM-4.6V-Flash",   msId: "ZhipuAI/GLM-4.6V-Flash",   family: "glm",      label: "GLM-4.6V-Flash" },
  { id: "zai-org/GLM-4.7-Flash",    msId: "ZhipuAI/GLM-4.7-Flash",    family: "glm",      label: "GLM-4.7-Flash" },
  { id: "zai-org/GLM-4.7",          msId: "ZhipuAI/GLM-4.7",          family: "glm",      label: "GLM-4.7" },
  { id: "moonshotai/Kimi-K2.7-Code", msId: "MoonshotAI/Kimi-K2.7-Code", family: "kimi",    label: "Kimi-K2.7-Code" },
  { id: "moonshotai/Kimi-K3",       msId: "MoonshotAI/Kimi-K3",       family: "kimi",     label: "Kimi-K3" },
  { id: "deepseek-ai/DeepSeek-V4-Flash-0731",      msId: "deepseek-ai/DeepSeek-V4-Flash-0731",      family: "deepseek", label: "DeepSeek-V4-Flash-0731" },
  { id: "deepseek-ai/DeepSeek-V4-Flash-Base",      msId: "deepseek-ai/DeepSeek-V4-Flash-Base",      family: "deepseek", label: "DeepSeek-V4-Flash-Base" },
  { id: "deepseek-ai/DeepSeek-V4-Pro-0813",        msId: "deepseek-ai/DeepSeek-V4-Pro-0813",        family: "deepseek", label: "DeepSeek-V4-Pro-0813" },
  { id: "deepseek-ai/DeepSeek-V4-Pro-DSpark",      msId: "deepseek-ai/DeepSeek-V4-Pro-DSpark",      family: "deepseek", label: "DeepSeek-V4-Pro-DSpark" },
  { id: "deepseek-ai/DeepSeek-V4-Pro-Base",        msId: "deepseek-ai/DeepSeek-V4-Pro-Base",        family: "deepseek", label: "DeepSeek-V4-Pro-Base" },
];

// ─── Types ───────────────────────────────────────────────────────────────────

type KVFormula =
  | "standard_gqa" | "mla" | "dsa_mla"
  | "qwen_linear_full_hybrid" | "deepseek_v4_hybrid";

interface Arch {
  numLayers: number; hiddenSize: number; intermediateSize: number;
  numAttentionHeads: number; numKeyValueHeads: number; headDim: number;
  vocabSize: number; tieWordEmbeddings: boolean;
  attentionType: "mha" | "gqa" | "mqa" | "mla";
  maxContextLength: number; positionalEmbedding: "rope" | "alibi" | "yarn" | "learned";
}

interface KVBlock {
  formula: KVFormula;
  fields: Record<string, unknown>;
  defaultTokens?: number;
  maxPositionEmbeddings?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

/** "Qwen3.8-2.4T-A95B" → 2.4T total / 95B active. */
function estimateParamsFromName(label: string): { total: number; active?: number } {
  const m = label.match(/(\d+(?:\.\d+)?)\s*[TtBb]/);
  if (!m) return { total: 0 };
  const qty = parseFloat(m[1]);
  const unit = m[0].slice(-1).toLowerCase();
  const total = unit === "t" ? qty * 1e12 : qty * 1e9;
  const a = label.match(/[aA](\d+(?:\.\d+)?)\s*[TtBb]/);
  const active = a
    ? (a[0].slice(-1).toLowerCase() === "t" ? parseFloat(a[1]) * 1e12 : parseFloat(a[1]) * 1e9)
    : undefined;
  return { total, active };
}

/** Architecture-based params estimate (dense / MoE / MLA). */
function estimateParams(
  cfg: Record<string, unknown>,
  arch: Arch
): { total: number; active?: number } {
  const { hiddenSize: hidden, numLayers: layers, numAttentionHeads: heads, numKeyValueHeads: kvHeads, headDim, vocabSize: vocab, intermediateSize: inter, tieWordEmbeddings: tied } = arch;

  const kvLoraRank = num(pick(cfg, "kv_lora_rank"));
  let attn: number;
  if (kvLoraRank > 0) {
    const nope = num(pick(cfg, "qk_nope_head_dim"), 0);
    const rope = num(pick(cfg, "qk_rope_head_dim"), 0);
    const latent = (nope + rope) || headDim;
    attn = 2 * hidden * heads * latent + hidden * kvLoraRank;
  } else {
    attn = 2 * hidden * hidden + 2 * hidden * headDim * kvHeads;
  }

  const nExperts = num(pick(cfg, "num_local_experts", "num_experts", "n_routed_experts"));
  const nShared = num(pick(cfg, "num_shared_experts", "n_shared_experts"));
  const topK = num(pick(cfg, "num_experts_per_tok", "top_k_experts"), 1);
  const moeInter = num(pick(cfg, "moe_intermediate_size", "shared_expert_intermediate_size"), inter);
  const isMoe = nExperts > 0;
  const mlpScale = pick(cfg, "use_double_wide_mlp") === true ? 2 : 1;

  let mlpTotal: number;
  if (isMoe) {
    const sharedInter = num(pick(cfg, "shared_expert_intermediate_size"), moeInter);
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

function extractArchitecture(cfg: Record<string, unknown>): Arch {
  const numLayers = num(pick(cfg, "num_hidden_layers"));
  const hiddenSize = num(pick(cfg, "hidden_size"));
  const numAttentionHeads = num(pick(cfg, "num_attention_heads"));
  const numKeyValueHeads = num(pick(cfg, "num_key_value_heads"), numAttentionHeads);
  const headDim = num(pick(cfg, "head_dim"), hiddenSize ? hiddenSize / Math.max(1, numAttentionHeads) : 0);
  const intermediateSize = num(pick(cfg, "intermediate_size", "moe_intermediate_size"));
  const vocabSize = num(pick(cfg, "vocab_size"));
  const tieWordEmbeddings = Boolean(pick(cfg, "tie_word_embeddings") ?? false);
  const maxContextLength = num(pick(cfg, "max_position_embeddings"), 131072);
  const kvLoraRank = num(pick(cfg, "kv_lora_rank"));

  let attentionType: Arch["attentionType"] = "mha";
  if (kvLoraRank > 0) attentionType = "mla";
  else if (numKeyValueHeads === 1) attentionType = "mqa";
  else if (numKeyValueHeads > 0 && numKeyValueHeads < numAttentionHeads) attentionType = "gqa";

  return {
    numLayers, hiddenSize, intermediateSize, numAttentionHeads, numKeyValueHeads,
    headDim, vocabSize, tieWordEmbeddings, attentionType, maxContextLength,
    positionalEmbedding: "rope",
  };
}

/** Detect the KV formula from config fields (mirrors the advanced engine). */
function detectKV(cfg: Record<string, unknown>): KVBlock | null {
  const compressRatios = pick(cfg, "compress_ratios");
  if (compressRatios !== undefined) {
    const ratios = String(compressRatios)
      .split(/[,\s]+/)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));
    return {
      formula: "deepseek_v4_hybrid",
      fields: {
        head_dim: num(pick(cfg, "head_dim")),
        index_head_dim: num(pick(cfg, "index_head_dim")),
        sliding_window: num(pick(cfg, "sliding_window")),
        num_hidden_layers: num(pick(cfg, "num_hidden_layers")),
        num_key_value_heads: num(pick(cfg, "num_key_value_heads")),
        compress_ratios: ratios,
      },
    };
  }

  // Qwen linear/full hybrid (Qwen3.5+): presence of linear_* keys marks the
  // linear-attention + full-attention layout. full/linear layer counts are
  // read from layer_types when present, else derived from full_attention_interval.
  const linearNumKeyHeads = pick(cfg, "linear_num_key_heads");
  if (linearNumKeyHeads !== undefined) {
    const numHiddenLayers = num(pick(cfg, "num_hidden_layers"));
    const layerTypes = Array.isArray(pick(cfg, "layer_types"))
      ? (pick(cfg, "layer_types") as unknown[]).map(String)
      : [];
    let fullAttentionLayers: number;
    let linearAttentionLayers: number;
    if (layerTypes.length > 0) {
      fullAttentionLayers = layerTypes.filter((t) => t.includes("full")).length;
      linearAttentionLayers = layerTypes.filter((t) => t.includes("linear")).length;
    } else {
      const interval = num(pick(cfg, "full_attention_interval"), 4);
      fullAttentionLayers = Math.ceil(numHiddenLayers / interval);
      linearAttentionLayers = numHiddenLayers - fullAttentionLayers;
    }
    return {
      formula: "qwen_linear_full_hybrid",
      fields: {
        full_attention_layers: fullAttentionLayers,
        linear_attention_layers: linearAttentionLayers,
        head_dim: num(pick(cfg, "head_dim")),
        linear_conv_kernel_dim: num(pick(cfg, "linear_conv_kernel_dim")),
        linear_key_head_dim: num(pick(cfg, "linear_key_head_dim")),
        linear_num_key_heads: num(pick(cfg, "linear_num_key_heads")),
        linear_num_value_heads: num(pick(cfg, "linear_num_value_heads")),
        linear_value_head_dim: num(pick(cfg, "linear_value_head_dim")),
        mtp_num_hidden_layers: num(pick(cfg, "mtp_num_hidden_layers")),
        num_attention_heads: num(pick(cfg, "num_attention_heads")),
        num_hidden_layers: numHiddenLayers,
        num_key_value_heads: num(pick(cfg, "num_key_value_heads")),
      },
    };
  }

  const kvLoraRank = num(pick(cfg, "kv_lora_rank"));
  if (kvLoraRank > 0) {
    const indexHeadDim = num(pick(cfg, "index_head_dim"));
    if (indexHeadDim > 0) {
      return {
        formula: "dsa_mla",
        fields: {
          kv_lora_rank: kvLoraRank,
          index_head_dim: indexHeadDim,
          num_hidden_layers: num(pick(cfg, "num_hidden_layers")),
          num_key_value_heads: num(pick(cfg, "num_key_value_heads")),
          qk_nope_head_dim: num(pick(cfg, "qk_nope_head_dim")),
          qk_rope_head_dim: num(pick(cfg, "qk_rope_head_dim")),
        },
      };
    }
    return {
      formula: "mla",
      fields: {
        kv_lora_rank: kvLoraRank,
        num_hidden_layers: num(pick(cfg, "num_hidden_layers")),
        num_key_value_heads: num(pick(cfg, "num_key_value_heads")),
        qk_nope_head_dim: num(pick(cfg, "qk_nope_head_dim")),
        qk_rope_head_dim: num(pick(cfg, "qk_rope_head_dim")),
        v_head_dim: num(pick(cfg, "v_head_dim")),
      },
    };
  }

  return null;
}

// ─── Fetching ────────────────────────────────────────────────────────────────

async function fetchConfig(msId: string): Promise<Record<string, unknown> | null> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, `${msId.replace(/[/]/g, "__")}.json`);
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

// ─── Build entry ─────────────────────────────────────────────────────────────

interface BuiltEntry {
  ok: boolean;
  id: string;
  entry?: Record<string, unknown>;
  error?: string;
}

function buildEntry(model: (typeof MODELS)[number], cfg: Record<string, unknown>): BuiltEntry {
  const arch = extractArchitecture(cfg);
  if (!arch.numLayers || !arch.hiddenSize) {
    return { ok: false, id: model.id, error: "no LLM architecture fields in config (likely non-text model)" };
  }

  const labelParams = estimateParamsFromName(model.label);
  const archParams = estimateParams(cfg, arch);
  const paramsTotal = labelParams.total > 0 ? labelParams.total : archParams.total;
  const paramsActive = labelParams.active ?? archParams.active;
  const paramsSource = labelParams.total > 0 ? "label" : "arch";

  const kv = detectKV(cfg);
  const maxPositionEmbeddings = arch.maxContextLength;

  const entry: Record<string, unknown> = {
    id: model.id,
    family: model.family,
    displayName: model.label,
    releaseDate: "2026-08-20",
    license: "unknown",
    paramsTotal: Math.round(paramsTotal),
    architecture: arch,
    notes: `params from ${paramsSource === "label" ? "model name (total/active suffix)" : "architecture estimate"}`,
    huggingfaceId: model.id,
  };
  if (paramsActive) entry.paramsActive = Math.round(paramsActive);
  if (kv) {
    entry.kv = {
      formula: kv.formula,
      fields: { ...kv.fields, _source: model.msId },
      defaultTokens: maxPositionEmbeddings,
      maxPositionEmbeddings,
    };
  }

  return { ok: true, id: model.id, entry };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`Ingesting ${MODELS.length} models from ModelScope…\n`);

  const existing = JSON.parse(fs.readFileSync(MODELS_JSON, "utf-8")) as { id: string }[];
  const existingKeys = new Set(existing.map((m) => m.id.toLowerCase()));

  const results = await mapLimit(MODELS, 4, async (model) => {
    const cfg = await fetchConfig(model.msId);
    if (!cfg) {
      return { id: model.id, ok: false, error: `ModelScope config.json not found (${model.msId})` } as BuiltEntry;
    }
    const built = buildEntry(model, cfg);
    return built;
  });

  const audit: Record<string, unknown>[] = [];
  let added = 0;
  let updated = 0;
  let failed = 0;

  const describe = (entry: Record<string, unknown>) =>
    ` ${Math.round(((entry.paramsTotal as number) ?? 0) / 1e9)}B total` +
    (entry.paramsActive ? ` / ${Math.round((entry.paramsActive as number) / 1e9)}B active` : "") +
    (entry.kv ? ` (${(entry.kv as KVBlock).formula})` : " (generic GQA)");

  for (const r of results) {
    if (!r.ok) {
      audit.push({ id: r.id, ok: false, error: r.error });
      console.log(`  ✗ ${r.id} — ${r.error}`);
      failed++;
      continue;
    }
    const idx = existing.findIndex((m) => m.id.toLowerCase() === r.id.toLowerCase());
    if (idx >= 0) {
      existing[idx] = r.entry as { id: string };
      audit.push({ id: r.id, ok: true, replaced: true });
      console.log(`  ~ ${r.id} — updated in place:${describe(r.entry!)}`);
      updated++;
      continue;
    }
    existing.push(r.entry as { id: string });
    existingKeys.add(r.id.toLowerCase());
    audit.push(r.entry);
    console.log(`  + ${r.id} —${describe(r.entry!)}`);
    added++;
  }

  fs.writeFileSync(MODELS_JSON, JSON.stringify(existing, null, 2) + "\n");
  fs.writeFileSync(MODELS_SCOPE_EXTRA_JSON, JSON.stringify(audit, null, 2) + "\n");

  console.log(`\n✅ models.json: ${existing.length} total (+${added} new, ${updated} updated, ${failed} failed)`);
  console.log(`   Audit trail: src/data/models-scope-extra.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
