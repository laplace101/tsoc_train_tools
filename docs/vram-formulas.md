# llm-infra 显存占用计算公式（VRAM）

本文档完整整理当前 llm-infra 计算器在训练与推理两种工作负载下的显存（VRAM）占用计算公式，与 `src/lib/formulas/` 下的实现**逐条对应**。代码主体：

- [vram.ts](../src/lib/formulas/vram.ts) — 权重
- [kvcache.ts](../src/lib/formulas/kvcache.ts) — 通用 KV cache
- [kv-formulas.ts](../src/lib/formulas/kv-formulas.ts) — 高级 KV cache（7 套公式）
- [training.ts](../src/lib/formulas/training.ts) — 训练内存（激活/梯度/优化器）
- [training-methods.ts](../src/lib/formulas/training-methods.ts) — 各类训练方法的 N× 因子
- [training-advanced.ts](../src/lib/formulas/training-advanced.ts) — 梯度累积 / 序列打包 / FlashAttention / 激活重算
- [aggregate.ts](../src/lib/formulas/aggregate.ts) — 总 VRAM 汇总（`computeTotalVRAM`）
- [lora.ts](../src/lib/formulas/lora.ts) — LoRA 可训练参数量

> KV cache 部分的详细分公式见 [kv-cache-formulas.md](kv-cache-formulas.md)，本文在「推理」章节给出概要，并标注与其对应的引擎。

---

## 零、统一记法与单位

| 记号 | 含义 |
|---|---|
| `N` | 模型总参数量（`paramsTotal`） |
| `N_trainable` | 可训练参数量（LoRA/QLoRA 时 < N） |
| `L` | Transformer 层数（`numLayers`） |
| `s` | 序列长度 / 上下文（`seqLen` / `contextLength`） |
| `b` | batch size（并发序列数） |
| `a` | attention heads 数（`numAttentionHeads`） |
| `h` | hidden size（`hiddenSize`） |
| `H_kv` | KV heads 数（`numKeyValueHeads`） |
| `D` | head dimension（`headDim`） |
| `T` | tokens（序列长度） |
| `B` | sequences（batchSize） |
| `bytes` | 每参数/元素的字节数（精度） |
| `tp / pp / dp` | tensor / pipeline / data parallel 度数 |

**单位换算**：所有中间量先以字节计算，最后 `÷ 1e9` 转 GB。`weightsGB` 保留 1 位小数，`kvCacheGB` 保留 2 位小数。

---

## 一、权重内存（vram.ts）

```
weightGB = round( N × bytes / 1e9 , 1 )
```

- `bytes` 由权重精度决定（见文末「精度映射」表）。
- MoE 模型：传入 `paramsTotal`（含全部专家）。

---

## 二、KV Cache 内存（推理）

仅 `mode ∈ {inference, scale}` 时计入 `kvCacheGB`。按模型是否携带 `kv.formula` 分两套引擎：

### 2.1 通用引擎（kvcache.ts，模型无 `kv` 块）

**标准 MHA / GQA / MQA：**

```
kv_bytes = 2 × L × B × T × H_kv × D × bytes
```

`×2` 是 Key、Value 各一份；MQA 时 `H_kv = 1`。

**MLA（带 `mlaCompressedDim`）：**

```
kv_bytes = L × B × T × mlaCompressedDim × bytes
```

只用隐变量维度，无 `×2`（K、V 共享 latent 表示）。

### 2.2 高级引擎（kv-formulas.ts，模型带 `kv` 块）

7 套公式（`standard_gqa` / `mla` / `dsa_mla` / `qwen_linear_full_hybrid` / `mixed_full_sliding_gqa` / `minimax_msa` / `deepseek_v4_hybrid`），核心思想：

- `standard_gqa`、`mla` 与通用引擎公式一致，额外支持 draft/MTP 层开关。
- `dsa_mla`、`minimax_msa`、`deepseek_v4_hybrid`：KV 之外还有 **indexer 侧缓存**，使用**独立精度**（`indexerBytesPerElement`）。
- `qwen_linear_full_hybrid`：只有 full-attention 层计入普通 KV；linear-attention 层是**固定大小的运行时状态**（默认不计，可开关）。
- `mixed_full_sliding_gqa`：sliding 层只保留 `min(T, sliding_window)`。

完整公式见 [kv-cache-formulas.md](kv-cache-formulas.md)。

总 KV：

```
kvCacheGB = kvResult.totalGB   （高级引擎）  或   kvResult.kvCacheGB   （通用引擎）
```

---

## 三、训练内存（finetune / train）

`mode ∈ {finetune, train}` 时计入 `activationsGB / gradientsGB / optimizerGB`。

### 3.1 每层激活（Korthikanti et al. 2022）

```
act_per_layer = s × b × h × (34 + 5·s·a/h) × 2   字节
```

系数 `34` 与 `5·s·a/h` 来自 Megatron 对 transformer 正向传播时的临时张量统计；`×2` 是 FP16/BF16 每元素字节数（`bytesPerParam`）。

### 3.2 FlashAttention 折叠（training.ts）

FlashAttention 不再物化 O(N²) 的注意力分数矩阵，因此从激活预算中减去该项：

```
attention_score = L × a × s × s × b × bytes / 1e9     GB
fullActGB       = (L × act_per_layer) / 1e9            GB
baseActGB       = flashAttention ? max(0, fullActGB - attention_score) : fullActGB
```

> `flashAttention` 默认 **false**：不显式传入时不产生削减（保持与旧调用兼容）。UI 面板与 store 默认 `true`，会实际折叠。

### 3.3 激活重算（checkpointing）

重算模式取 `checkpointMode`；未提供时回退到布尔 `gradientCheckpointing`（`true → 'full'`）：

```
mode = checkpointMode ?? (gradientCheckpointing ? 'full' : 'none')
```

| 模式 | 公式 | 说明 |
|---|---|---|
| `none` | `baseActGB` | 全部激活驻留 |
| `full` | `√L × (baseActGB / L)` | 经典 checkpointing，只存 √L 层 |
| `selective` | `baseActGB × 0.65` | 丢弃注意力分数项约 30–40% |

最终 `activationsGB` 即上述重算后的值。

### 3.4 可训练参数量（LoRA / QLoRA）

Full 微调：`N_trainable = N`。LoRA/QLoRA：

```
N_trainable = Σ_modules  rank × (d_in + d_out)
```

（见 [lora.ts](../src/lib/formulas/lora.ts)；LoRA 每个线性层新增 `A: rank×d_in + B: rank×d_out`。）

### 3.5 梯度

```
gradientsGB = N_trainable × 2 / 1e9    （FP16）
```

### 3.6 优化器状态（混合精度 Adam，ZeRO K=12）

| 模式 | 优化器 | 每参数字节 |
|---|---|---|
| full | FP32 主权重 4 + momentum 4 + variance 4 | **12** |
| lora | 同上，只作用于可训练参数 | **12**（× `N_trainable`） |
| qlora | paged AdamW 8-bit | **8**（× `N_trainable`） |

### 3.7 基座权重（训练模式）

| 模式 | 每参数字节 | 说明 |
|---|---|---|
| full / lora | `bytesPerParam`（如 BF16=2） | 基座权重 |
| qlora | **0.5** | NF4 量化基座 |

### 3.8 `training.ts` 汇总

```
totalTrainingGB = weightsGB + activationsGB + gradientsGB + optimizerGB
```

---

## 四、训练方法内存矩阵（training-methods.ts）

当 `trainingOptions.trainingMethodId` 设置时，走**按方法**的公式（`computeTrainingMethodMemory`）。每个方法 = `weights + gradients + optimizer + extraModels + activations`，其 N× 因子见下表（`fp16GB = 2N`）。`extraModelsGB` 方法末尾折入 `optimizerGB` 供总览展示。

| 方法 | weights | gradients | optimizer | extraModels | 合计（不含激活） |
|---|---|---|---|---|---|
| `pretrain` / `continued_pretrain` / `sft_full` | 2N | 2N | 12N | — | **16 B/param** |
| `sft_lora` | 2N（冻结） | 2×N_trainable | 12×N_trainable | — | 2N + **14×N_trainable** |
| `sft_qlora` | 0.5N（NF4） | 2×N_trainable | 8×N_trainable | — | 0.5N + **10×N_trainable** |
| `dpo` | 2N | 2N | 12N | 2N（reference） | **18N** |
| `grpo` | 2N | 2N | 12N | 2×2N（ref+reward） | **20N** |
| `rlhf_ppo` | 2N | 2N | 12N | 8N+2N+2N（critic+ref+reward） | **36N** |
| `kto` / `orpo` | 2N | 2N | 12N | — | **16N** |
| `distillation` | 2N | 2N | 12N | 2N（teacher，仅推理） | **16N + 2N_teacher** |

> 注：`sft_full` 的 `weights` 用 `fp16GB(2N)` 而不是 `baseGB`，因此公式中 `weights+grads+optimizer = 2+2+12 = 16 B/param`。

---

## 五、总 VRAM 汇总（aggregate.ts `computeTotalVRAM`）

### 5.1 各工作负载的组成

| 模式 | 组成 |
|---|---|
| `inference` / `scale` | `weights + kvCache + overhead` |
| `finetune` / `train` | `weights + activations + gradients + optimizer + overhead` |

`overheadGB = 1.0`（CUDA context + 框架开销）。

### 5.2 训练方法分发改写

- 若 `trainingMethodId` 设置：先用 `computeTrainingMemory` 算激活，再按 `computeTrainingMethodMemory` 取各分量；`extraModelsGB` 折入 `optimizerGB`。
- 否则：直接用 `computeTrainingMemory`（legacy 路径）返回 `activationsGB / gradientsGB / optimizerGB`。

### 5.3 TP / PP / DP 每卡切分（聚合层）

仅当 `mode ∈ {finetune, train}` 且 `tp > 1 || pp > 1` 时应用（默认 1/1/1 为 no-op）：

```
weight_shards = tp × pp
weightsGB     /= weight_shards      （权重、梯度、优化器按层+张量并行切分）
gradientsGB   /= weight_shards
optimizerGB   /= weight_shards
activationsGB /= tp                  （激活只按张量并行切分）
```

- 数据并行（DP）不进一步削减每卡内存（各副本持有一套完整 shard）。
- `totalGB` 始终 = 各分量之和，因此 property「sum = total」不变式在切分后仍成立。

### 5.4 store 端每卡显存

在 [calculator-store.ts](../src/store/calculator-store.ts) 的 `recompute()` 中，`vramPerGPU` 的取法：

| 场景 | `vramPerGPU` |
|---|---|
| 训练（tensor/zero3 parallel） | `breakdown.totalGB`（已按 TP 切分，不再除 numGPUs） |
| 训练（pipeline parallel） | `breakdown.totalGB`（同上） |
| MoE | `sharedWeights + expertWeights/numGPUs + (kv+overhead)/numGPUs` |
| 推理 | `breakdown.totalGB / numGPUs` |

训练模式的 TP/PP/DP 由 `numGPUs` + `parallelismType` 派生后传入 `computeTotalVRAM`，避免在 store 端重复除以 `numGPUs` 造成双重切分。

---

## 六、训练高级参数（training-advanced.ts）

这些是展示/配置项，不直接改变 `computeTotalVRAM` 的总量（梯度累积与序列打包不增加显存）：

| 参数 | 公式 | 说明 |
|---|---|---|
| 梯度累积 | `effectiveBatch = batchSize × accumSteps`；`extraVRAMGB = 0` | 梯度就地累加，无额外显存 |
| 序列打包 | `utilization = avgSeq/maxSeq`（未打包）；打包后夹到 85–95% | 吞吐提升，不改显存 |
| FlashAttention | `attentionScoreGB = L×a×s²×b×bytes/1e9`；启用则 `savedGB = attentionScoreGB` | 暴露给用户查看节省量（实际折叠见 §3.2） |
| 激活重算 | 见 §3.3；`none=0% / selective=5% / full=33%` 计算开销 | 暴露给用户查看 |

---

## 七、精度映射

**权重精度**（`PRECISION_MAP`，含量化类型）：

| 精度 | 字节/参数 |
|---|---|
| fp32 | 4 |
| fp16 / bf16 | 2 |
| fp8 | 1 |
| int8 | 1 |
| q4 / int4 / fp4 | 0.5 |
| q4_k_m 等 GGUF | 依 `QUANTIZATION_TYPES`（约 0.6/0.5…） |

**KV 精度**（`KV_PRECISION_MAP`，独立于权重）：fp32=4、fp16/bf16=2、fp8/int8=1、int4/fp4=0.5。**indexer 侧缓存有独立精度**（DeepSeek-V4 默认 FP4/int4，其余 fp16）。

---

## 八、代码调用链速查

```
computeTotalVRAM (aggregate.ts)
 ├─ computeWeightMemory (vram.ts)             → weightsGB
 ├─ (inference/scale) computeKVCache / computeModelKVCache → kvCacheGB
 └─ (finetune/train)
     ├─ 有 trainingMethodId: computeTrainingMemory → activationsGB
     │    + computeTrainingMethodMemory → weights/grads/opt/extra
     ├─ 无 trainingMethodId: computeTrainingMemory → act/grads/opt
     └─ TP/PP 切分（tp/pp/dp）

computeTrainingMemory (training.ts)
 ├─ 激活（Korthikanti）→ FlashAttention → checkpoint
 ├─ 梯度（2×N_trainable）
 └─ 优化器（12/12/8 × N / N_trainable）
```

---

## 九、验证

```bash
cd /workspace/llm-infra
npx tsc --noEmit          # 类型检查
npx vitest --run          # 单元 + property 测试
npm run build             # 生产构建
```

公式相关测试文件：`training.test.ts`、`training-methods.test.ts`、`aggregate.test.ts`、`kvcache.test.ts`、`kv-formulas.test.ts`、`parallelism.test.ts`。
