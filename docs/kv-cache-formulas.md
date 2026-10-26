# KV Cache 计算方式说明

llm-infra 有两套 KV cache 引擎，按模型是否携带 `kv` 块自动分流：

| 引擎 | 文件 | 触发条件 | 覆盖模型 |
|---|---|---|---|
| 通用引擎（回退） | `src/lib/formulas/kvcache.ts` | 模型无 `kv.formula` | 标准 MHA/GQA/MQA、旧 MLA |
| 高级引擎（7 套公式） | `src/lib/formulas/kv-formulas.ts` | 模型带 `kv.formula` | DSA/MLA、Qwen linear、滑动窗口、MiniMax MSA、DeepSeek V4 等 |

统一记法：

- `T` = tokens（序列长度 seqLen）
- `B` = sequences（并发数 batchSize）
- `L` = 层数
- `H_kv` = KV heads 数
- `D` = head dimension
- `bytes` = KV 精度字节数
- `idx_bytes` = indexer 精度字节数（独立可选）

---

## 一、通用引擎（2 种）

无 `kv` 块的模型走这里，按 `attentionType` 分两种。

### 1. MHA / GQA / MQA（标准）

```
kv_bytes = 2 × L × B × T × H_kv × D × bytes
```

- `×2` 是 Key、Value 各一份。
- MQA 时 `H_kv = 1`。

### 2. MLA（带 `mlaCompressedDim`）

```
kv_bytes = L × B × T × mlaCompressedDim × bytes
```

只用隐变量维度，没有 `×2`（K、V 共享 latent 表示）。

---

## 二、高级引擎（7 套公式）

### 1. `standard_gqa` — 标准 MHA/GQA

与通用引擎公式一致，额外支持 draft/MTP 层开关：

```
total = T × B × active_layers × 2 × H_kv × D × bytes
active_layers = main_layers + draft_layers   （勾选 draft KV 时）
```

代表：Qwen3、Qwen2.5 系列。

### 2. `mla` — MLA 隐变量 KV

```
total = T × B × active_layers × (kv_lora_rank + qk_rope_head_dim) × bytes
```

代表：DeepSeek-V3 / R1、Kimi-K2.x、GLM-4.7-Flash。

### 3. `dsa_mla` — DSA/MLA + indexer

```
kv      = T × B × active_layers × (kv_lora_rank + qk_rope_head_dim) × bytes
indexer = T × B × active_indexer_layers × index_head_dim × idx_bytes
total   = kv + indexer
```

DSA 的 indexer 是独立侧缓存，使用**单独精度**（`idx_bytes`）。
代表：DeepSeek-V3.2、GLM-5 / 5.1 / 5.2。

### 4. `qwen_linear_full_hybrid` — Qwen linear/full 混合

只有 full-attention 层算普通 KV；linear-attention 层是**固定大小的运行时状态**（不随 token 线性增长），默认不计：

```
full_kv = T × B × full_attention_layers × 2 × H_kv × D × bytes
```

勾选「linear-attention state」后追加：

```
conv_state      = B × linear_layers × conv_kernel × (2×key_heads×key_dim + value_heads×value_dim) × 2   (BF16)
recurrent_state = B × linear_layers × value_heads × key_dim × value_dim × 4                              (FP32)
```

代表：Qwen3.5 / 3.6 / 3.8 全系列。

### 5. `mixed_full_sliding_gqa` — 混合 full/sliding GQA

```
full    = T × B × full_layers × full_kv_heads × (full_head_dim + full_v_head_dim) × bytes
sliding = min(T, sliding_window) × B × sliding_layers × sliding_kv_heads × (sliding_head_dim + sliding_v_head_dim) × bytes
total   = full + sliding
```

sliding 层只保留局部窗口 `min(T, sliding_window)`。
代表：Gemma-4 系列、Xiaomi MiMo-V2.5。

### 6. `minimax_msa` — MiniMax MSA 稀疏注意力

```
kv      = T × B × L × 2 × H_kv × D × bytes
indexer = T × B × sparse_attention_layers × index_head_dim × idx_bytes
total   = kv + indexer
```

代表：MiniMax-M3。

### 7. `deepseek_v4_hybrid` — DeepSeek V4 混合稀疏

每层按 `compress_ratio` 分三类（0 / 4 / 128）：

```
sliding    = active_layers × sliding_window × D × bytes
compressed = Σ_{ratio>0} floor(T / ratio) × D × bytes
indexer    = ratio4_layers × floor(T / 4) × index_head_dim × idx_bytes
total      = B × (sliding + compressed + indexer)
```

- ratio=0 层：只留固定 sliding-window KV；
- ratio=4 层：压缩 KV + 额外 indexer 侧缓存；
- ratio=128 层：只留压缩 KV；
- `compress_ratios` 末尾多出的 ratio=0 条目是 MTP draft 层（用 `slice(0, num_hidden_layers)` 切分）。

代表：DeepSeek-V4-Pro / Flash 全系列（默认 KV=FP8、indexer=FP4）。

---

## 三、精度字节映射

| 精度 | 字节/元素 |
|---|---|
| fp32 | 4 |
| fp16 / bf16 | 2 |
| fp8 / int8 | 1 |
| int4 / fp4 | 0.5 |

`indexer`（DSA / MiniMax / DeepSeek-V4）有**独立精度**：DeepSeek-V4 默认 FP4/int4，其余 fp16。

---

## 四、分流判定与开关

- 判定：模型 `kv.formula` 存在 → 高级引擎；否则 → 通用引擎。
- 三个可选开关（store）：
  - `includeDraftKvCache` — 是否计入 draft/MTP 层；
  - `includeLinearAttentionState` — 是否计入 Qwen linear 运行时状态；
  - `indexerPrecision` — indexer 侧精度。
