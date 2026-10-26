import * as React from 'react';
import { cn } from '@/lib/utils';

interface Article {
  id: string;
  title: string;
  sections: { id: string; heading: string; content: React.ReactNode }[];
}

const ARTICLES: Article[] = [
  {
    id: 'getting-started',
    title: '快速上手',
    sections: [
      {
        id: 'overview',
        heading: '概述',
        content: (
          <>
            <p>
              计算器（DCU-LLMcalculator）是一个以精度优先的估算工具，用于为任意 LLM 工作负载估算 GPU 显存、吞吐、延迟与云成本。全部在浏览器内运行——无后端、无遥测、无需注册。
            </p>
            <p className="mt-2">
              计算器支持两种流程：
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm mt-2">
              <li><strong>模型优先</strong> — 先选模型，再看哪些 GPU 能跑</li>
              <li><strong>硬件优先</strong> — 先选你的 GPU，再看哪些模型能装下</li>
            </ul>
          </>
        ),
      },
      {
        id: 'model-first-workflow',
        heading: '模型优先流程',
        content: (
          <>
            <p>这是默认流程。先选择一个模型：</p>
            <ol className="list-decimal list-inside space-y-1 text-sm mt-2">
              <li>点击模型选择器，或按 <kbd className="px-1.5 py-0.5 text-xs font-mono bg-bg-muted border border-border-subtle rounded">⌘K</kbd></li>
              <li>搜索你的模型（支持模糊搜索）</li>
              <li>选择精度（FP16、INT8、INT4、GGUF 格式）</li>
              <li>设置上下文长度与 batch size</li>
              <li>查看显存拆分与 GPU 推荐</li>
            </ol>
            <p className="mt-2">
              计算器展示三个 GPU 档位：<strong>Budget</strong>（最低成本）、<strong>Balanced</strong>（性价比最高）、<strong>Performance</strong>（吞吐最高）。
            </p>
          </>
        ),
      },
      {
        id: 'hardware-first-workflow',
        heading: '硬件优先流程',
        content: (
          <>
            <p>如果你已经有硬件，用硬件优先流程：</p>
            <ol className="list-decimal list-inside space-y-1 text-sm mt-2">
              <li>展开「Hardware-First Selection」区域</li>
              <li>从下拉框选择你的 GPU</li>
              <li>查看按适配状态排序的模型建议（绿色 = 可运行，黄色 = 紧张，红色 = 超限）</li>
              <li>点击建议的模型即可选中它</li>
            </ol>
            <p className="mt-2">
              该流程也可在 <strong>Reverse</strong> 页面使用，那里以可排序表格展示全部 318 个模型。
            </p>
          </>
        ),
      },
      {
        id: 'workload-modes',
        heading: '工作负载模式',
        content: (
          <>
            <p>用标签页或键盘快捷键切换模式：</p>
            <ul className="list-disc list-inside space-y-1 text-sm mt-2">
              <li><strong>Inference</strong> <kbd className="px-1.5 py-0.5 text-xs font-mono bg-bg-muted border border-border-subtle rounded">i</kbd> — 权重 + KV cache + 开销</li>
              <li><strong>Train</strong> <kbd className="px-1.5 py-0.5 text-xs font-mono bg-bg-muted border border-border-subtle rounded">t</kbd> — 完整训练（激活、梯度、优化器状态）</li>
            </ul>
            <p className="mt-2">
              训练模式支持 <strong>Full Fine-tune</strong>、<strong>LoRA</strong>、<strong>QLoRA</strong> 等方法。
            </p>
          </>
        ),
      },
      {
        id: 'sharing-configs',
        heading: '分享配置',
        content: (
          <>
            <p>
              你的完整配置都被编码进 URL。按 <kbd className="px-1.5 py-0.5 text-xs font-mono bg-bg-muted border border-border-subtle rounded">⌘↵</kbd> 复制分享链接。
            </p>
            <p className="mt-2">
              URL 包含：模型、精度、KV 精度、上下文长度、batch size、模式、并发用户数与 SLO 目标。
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: 'how-vram-is-calculated',
    title: '显存占用计算（训练）',
    sections: [
      {
        id: 'overview',
        heading: '概述与统一记法',
        content: (
          <>
            <p>
              总显存（VRAM）= <strong>模型权重</strong> + <strong>激活 + 梯度 + 优化器状态</strong> + 固定的 <strong>overhead</strong>（约 1 GB，CUDA context + 框架开销）。本文聚焦<strong>训练</strong>；推理侧的 KV cache 公式见「<strong>KV Cache 计算方式</strong>」指南。下面的公式与 <code className="font-mono text-xs bg-bg-muted px-1 rounded">src/lib/formulas/</code> 的实现逐条对应。
            </p>
            <p className="mt-2">统一记法：</p>
            <ul className="list-disc list-inside space-y-1 text-sm mt-2">
              <li><code className="font-mono text-xs bg-bg-muted px-1 rounded">N</code> — 模型总参数量（<code className="font-mono text-xs bg-bg-muted px-1 rounded">paramsTotal</code>）；LoRA/QLoRA 时用 <code className="font-mono text-xs bg-bg-muted px-1 rounded">N_trainable</code></li>
              <li><code className="font-mono text-xs bg-bg-muted px-1 rounded">L</code> — 层数，<code className="font-mono text-xs bg-bg-muted px-1 rounded">s</code> — 序列长度/上下文，<code className="font-mono text-xs bg-bg-muted px-1 rounded">b</code> — batch size</li>
              <li><code className="font-mono text-xs bg-bg-muted px-1 rounded">a</code> — attention heads，<code className="font-mono text-xs bg-bg-muted px-1 rounded">h</code> — hidden size，<code className="font-mono text-xs bg-bg-muted px-1 rounded">D</code> — head dimension</li>
              <li><code className="font-mono text-xs bg-bg-muted px-1 rounded">tp / pp / dp</code> — tensor / pipeline / data parallel 度数</li>
              <li><code className="font-mono text-xs bg-bg-muted px-1 rounded">bytes</code> — 每参数/元素的字节数（权重、KV 或优化器精度）</li>
            </ul>
            <p className="mt-2">所有中间量先按字节计算，最后 <code className="font-mono text-xs bg-bg-muted px-1 rounded">÷ 1e9</code> 转 GB。</p>
          </>
        ),
      },
      {
        id: 'weight-memory',
        heading: '权重内存',
        content: (
          <>
            <pre className="bg-bg-muted rounded-md p-3 text-xs font-mono overflow-x-auto mt-2">
              weightGB = round( N × bytes / 1e9 , 1 )
            </pre>
            <p className="mt-2">
              70B 模型 FP16（2 字节/参数）：<code className="font-mono text-xs bg-bg-muted px-1 rounded">70e9 × 2 / 1e9 = 140 GB</code>。MoE 模型传入 <code className="font-mono text-xs bg-bg-muted px-1 rounded">paramsTotal</code>（含全部专家）。
            </p>
            <p className="mt-2">权重精度映射（<code className="font-mono text-xs bg-bg-muted px-1 rounded">PRECISION_MAP</code>）：</p>
            <table className="w-full text-sm mt-2 border-collapse">
              <thead>
                <tr className="text-left text-fg-muted border-b border-border-subtle">
                  <th className="py-1.5 pr-3 font-medium">精度</th>
                  <th className="py-1.5 font-medium">字节/参数</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                <tr className="border-b border-border-subtle"><td className="py-1.5 pr-3">fp32</td><td>4</td></tr>
                <tr className="border-b border-border-subtle"><td className="py-1.5 pr-3">fp16 / bf16</td><td>2</td></tr>
                <tr className="border-b border-border-subtle"><td className="py-1.5 pr-3">fp8 / int8</td><td>1</td></tr>
                <tr className="border-b border-border-subtle"><td className="py-1.5 pr-3">q4 / int4 / fp4</td><td>0.5</td></tr>
                <tr className="border-b border-border-subtle"><td className="py-1.5 pr-3">GGUF Q4_K_M</td><td>~0.606</td></tr>
                <tr className="border-b border-border-subtle"><td className="py-1.5 pr-3">GGUF Q5_K_M</td><td>~0.711</td></tr>
                <tr><td className="py-1.5 pr-3">GGUF Q8_0</td><td>1.0625</td></tr>
              </tbody>
            </table>
          </>
        ),
      },
      {
        id: 'training-memory',
        heading: '训练内存',
        content: (
          <>
            <p>训练（finetune/train）在权重之上新增三项。<strong>激活</strong>采用 Korthikanti et al. 2022，逐层：</p>
            <pre className="bg-bg-muted rounded-md p-3 text-xs font-mono overflow-x-auto mt-2">
              act_per_layer = s × b × h × (34 + 5·s·a/h) × 2   字节
                            = L × act_per_layer / 1e9          GB  (fullActGB)
            </pre>
            <p className="mt-2">
              <strong>FlashAttention</strong> — 不再物化 O(N²) 的注意力分数矩阵，因此减去该项（界面默认开启）：
            </p>
            <pre className="bg-bg-muted rounded-md p-3 text-xs font-mono overflow-x-auto mt-2">
              attention_score = L × a × s² × b × bytes / 1e9     GB
              baseActGB       = flashAttention ? max(0, fullActGB - attention_score) : fullActGB
            </pre>
            <p className="mt-2">
              <strong>激活重算</strong>（<code className="font-mono text-xs bg-bg-muted px-1 rounded">none</code> / <code className="font-mono text-xs bg-bg-muted px-1 rounded">selective</code> / <code className="font-mono text-xs bg-bg-muted px-1 rounded">full</code>）作用于 <code className="font-mono text-xs bg-bg-muted px-1 rounded">baseActGB</code>：
            </p>
            <table className="w-full text-sm mt-2 border-collapse">
              <thead>
                <tr className="text-left text-fg-muted border-b border-border-subtle">
                  <th className="py-1.5 pr-3 font-medium">模式</th>
                  <th className="py-1.5 font-medium">保留的激活</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                <tr className="border-b border-border-subtle"><td className="py-1.5 pr-3">none</td><td>baseActGB</td></tr>
                <tr className="border-b border-border-subtle"><td className="py-1.5 pr-3">full</td><td>√L × (baseActGB / L)</td></tr>
                <tr><td className="py-1.5 pr-3">selective</td><td>baseActGB × 0.65</td></tr>
              </tbody>
            </table>
            <p className="mt-2"><strong>梯度</strong>与<strong>优化器</strong>（混合精度 Adam，ZeRO K=12）：</p>
            <pre className="bg-bg-muted rounded-md p-3 text-xs font-mono overflow-x-auto mt-2">
              gradientsGB  = N_trainable × 2 / 1e9                          (FP16)
              optimizerGB  = N_trainable × 12 / 1e9                         (FP32 主权重 4 + 动量 4 + 方差 4)
              optimizerGB  = N_trainable × 8 / 1e9                         (QLoRA paged 8-bit AdamW)
            </pre>
            <p className="mt-2">
              LoRA/QLoRA 的 <code className="font-mono text-xs bg-bg-muted px-1 rounded">N_trainable</code> = <code className="font-mono text-xs bg-bg-muted px-1 rounded">Σ rank × (d_in + d_out)</code>（adapter A: rank×d_in，B: rank×d_out）。基座权重：full/lora 用 <code className="font-mono text-xs bg-bg-muted px-1 rounded">bytesPerParam</code>（如 BF16），qlora 用 0.5 B（NF4）。
            </p>
          </>
        ),
      },
      {
        id: 'training-methods',
        heading: '训练方法内存矩阵',
        content: (
          <>
            <p>
              设置 <code className="font-mono text-xs bg-bg-muted px-1 rounded">trainingMethodId</code> 后，每个方法 = <code className="font-mono text-xs bg-bg-muted px-1 rounded">weights + gradients + optimizer + extraModels + activations</code>，其中 <code className="font-mono text-xs bg-bg-muted px-1 rounded">fp16GB = 2N</code>。下表合计不含激活：
            </p>
            <table className="w-full text-sm mt-2 border-collapse overflow-x-auto">
              <thead>
                <tr className="text-left text-fg-muted border-b border-border-subtle">
                  <th className="py-1.5 pr-3 font-medium">方法</th>
                  <th className="py-1.5 pr-3 font-medium">weights</th>
                  <th className="py-1.5 pr-3 font-medium">grads</th>
                  <th className="py-1.5 pr-3 font-medium">optimizer</th>
                  <th className="py-1.5 pr-3 font-medium">额外模型</th>
                  <th className="py-1.5 font-medium">合计（不含激活）</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                <tr className="border-b border-border-subtle"><td className="py-1.5 pr-3">pretrain / continued_pretrain / sft_full</td><td className="py-1.5 pr-3">2N</td><td className="py-1.5 pr-3">2N</td><td className="py-1.5 pr-3">12N</td><td className="py-1.5">—</td><td className="py-1.5">16N</td></tr>
                <tr className="border-b border-border-subtle"><td className="py-1.5 pr-3">sft_lora</td><td className="py-1.5 pr-3">2N（冻结）</td><td className="py-1.5 pr-3">2×N_trainable</td><td className="py-1.5 pr-3">12×N_trainable</td><td className="py-1.5">—</td><td className="py-1.5">2N + 14×N_trainable</td></tr>
                <tr className="border-b border-border-subtle"><td className="py-1.5 pr-3">sft_qlora</td><td className="py-1.5 pr-3">0.5N（NF4）</td><td className="py-1.5 pr-3">2×N_trainable</td><td className="py-1.5 pr-3">8×N_trainable</td><td className="py-1.5">—</td><td className="py-1.5">0.5N + 10×N_trainable</td></tr>
                <tr className="border-b border-border-subtle"><td className="py-1.5 pr-3">dpo</td><td className="py-1.5 pr-3">2N</td><td className="py-1.5 pr-3">2N</td><td className="py-1.5 pr-3">12N</td><td className="py-1.5">2N（reference）</td><td className="py-1.5">18N</td></tr>
                <tr className="border-b border-border-subtle"><td className="py-1.5 pr-3">grpo</td><td className="py-1.5 pr-3">2N</td><td className="py-1.5 pr-3">2N</td><td className="py-1.5 pr-3">12N</td><td className="py-1.5">4N（ref + reward）</td><td className="py-1.5">20N</td></tr>
                <tr className="border-b border-border-subtle"><td className="py-1.5 pr-3">rlhf_ppo</td><td className="py-1.5 pr-3">2N</td><td className="py-1.5 pr-3">2N</td><td className="py-1.5 pr-3">12N</td><td className="py-1.5">12N（critic + ref + reward）</td><td className="py-1.5">36N</td></tr>
                <tr className="border-b border-border-subtle"><td className="py-1.5 pr-3">kto / orpo</td><td className="py-1.5 pr-3">2N</td><td className="py-1.5 pr-3">2N</td><td className="py-1.5 pr-3">12N</td><td className="py-1.5">—</td><td className="py-1.5">16N</td></tr>
                <tr><td className="py-1.5 pr-3">distillation</td><td className="py-1.5 pr-3">2N</td><td className="py-1.5 pr-3">2N</td><td className="py-1.5 pr-3">12N</td><td className="py-1.5">2N_teacher（仅推理）</td><td className="py-1.5">16N + 2N_teacher</td></tr>
              </tbody>
            </table>
            <p className="mt-2">
              <code className="font-mono text-xs bg-bg-muted px-1 rounded">sft_full</code> 的 weights 用 <code className="font-mono text-xs bg-bg-muted px-1 rounded">fp16GB(2N)</code> 而非 <code className="font-mono text-xs bg-bg-muted px-1 rounded">baseGB</code>，故 weights+grads+optimizer = 2+2+12 = 16 B/param。
            </p>
          </>
        ),
      },
      {
        id: 'multi-gpu-vram',
        heading: '多卡显存（TP / PP / DP）',
        content: (
          <>
            <p>训练且 <code className="font-mono text-xs bg-bg-muted px-1 rounded">tp &gt; 1 || pp &gt; 1</code> 时，<code className="font-mono text-xs bg-bg-muted px-1 rounded">computeTotalVRAM</code> 对每卡分量做切分：</p>
            <pre className="bg-bg-muted rounded-md p-3 text-xs font-mono overflow-x-auto mt-2">
              weight_shards = tp × pp
              weightsGB    /= weight_shards    （权重、梯度、优化器按层 + 张量并行切分）
              gradientsGB  /= weight_shards
              optimizerGB  /= weight_shards
              activationsGB /= tp               （激活只按张量并行切分）
            </pre>
            <ul className="list-disc list-inside space-y-1 text-sm mt-2">
              <li><strong>数据并行（DP）</strong> — 每个副本持有一套完整 shard，不再进一步削减。</li>
              <li><strong>MoE 专家并行</strong> — attention 权重每卡保留，专家权重切分。</li>
              <li><code className="font-mono text-xs bg-bg-muted px-1 rounded">totalGB</code> 始终 = <code className="font-mono text-xs bg-bg-muted px-1 rounded">sum(components)</code>，切分后不变式仍成立。</li>
            </ul>
            <p className="mt-2">
              store 端训练时由 <code className="font-mono text-xs bg-bg-muted px-1 rounded">numGPUs</code> + <code className="font-mono text-xs bg-bg-muted px-1 rounded">parallelismType</code> 派生 <code className="font-mono text-xs bg-bg-muted px-1 rounded">tp/pp/dp</code>，并上报 <code className="font-mono text-xs bg-bg-muted px-1 rounded">vramPerGPU = breakdown.totalGB</code>（已切分，不再重复除 numGPUs）。
            </p>
          </>
        ),
      },
      {
        id: 'total-vram',
        heading: '总显存与调用链',
        content: (
          <>
            <p><strong>训练</strong>（finetune / train）总显存组成：</p>
            <pre className="bg-bg-muted rounded-md p-3 text-xs font-mono overflow-x-auto mt-2">
              totalGB = weights + activations + gradients + optimizer + overhead
            </pre>
            <p className="mt-2"><code className="font-mono text-xs bg-bg-muted px-1 rounded">overheadGB = 1.0</code>（CUDA context + 框架开销）。推理侧组成（<code className="font-mono text-xs bg-bg-muted px-1 rounded">weights + kvCache + overhead</code>）见「KV Cache 计算方式」指南。</p>
            <pre className="bg-bg-muted rounded-md p-3 text-xs font-mono overflow-x-auto mt-2">
              computeTotalVRAM (aggregate.ts)
                ├─ computeWeightMemory               → weightsGB
                └─ (finetune/train) computeTrainingMemory → activationsGB
                     + computeTrainingMethodMemory    → weights/grads/opt/extra
                   + TP/PP 切分

              computeTrainingMemory (training.ts)
                ├─ 激活（Korthikanti）→ FlashAttention → checkpoint
                ├─ 梯度（2 × N_trainable）
                └─ 优化器（12 / 8 × N_trainable）
            </pre>
          </>
        ),
      },
    ],
  },
  {
    id: 'kv-cache-formulas',
    title: 'KV Cache 计算方式',
    sections: [
      {
        id: 'two-engines',
        heading: '两套引擎',
        content: (
          <>
            <p>
              KV cache 有两套引擎，按模型是否携带 <code className="font-mono text-xs bg-bg-muted px-1 rounded">kv.formula</code> 自动分流。带 <code className="font-mono text-xs bg-bg-muted px-1 rounded">kv.formula</code> 的走高级引擎（7 套公式），其余走通用引擎。
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm mt-2">
              <li><strong>通用引擎</strong> — MHA/GQA/MQA 与旧 MLA 隐变量公式。</li>
              <li><strong>高级引擎</strong> — DSA/MLA indexer、Qwen linear/full 混合、滑动窗口混合、MiniMax MSA、DeepSeek V4 压缩缓存。</li>
            </ul>
            <p className="mt-2">
              统一记法：<code className="font-mono text-xs bg-bg-muted px-1 rounded">T</code> = tokens（序列长度 seqLen），<code className="font-mono text-xs bg-bg-muted px-1 rounded">B</code> = 并发数 batchSize，<code className="font-mono text-xs bg-bg-muted px-1 rounded">L</code> = 层数，<code className="font-mono text-xs bg-bg-muted px-1 rounded">H_kv</code> = KV heads，<code className="font-mono text-xs bg-bg-muted px-1 rounded">D</code> = head dimension，<code className="font-mono text-xs bg-bg-muted px-1 rounded">bytes</code> = KV 精度字节数，<code className="font-mono text-xs bg-bg-muted px-1 rounded">idx_bytes</code> = indexer 精度字节数。
            </p>
          </>
        ),
      },
      {
        id: 'generic-engine',
        heading: '通用引擎',
        content: (
          <>
            <pre className="bg-bg-muted rounded-md p-3 text-xs font-mono overflow-x-auto mt-2">
              {`MHA/GQA/MQA:  2 × L × B × T × H_kv × D × bytes
MLA:          L × B × T × mlaCompressedDim × bytes`}
            </pre>
            <p className="mt-2">
              MQA 时 <code className="font-mono text-xs bg-bg-muted px-1 rounded">H_kv = 1</code>。MLA 只用隐变量维度，没有 <code className="font-mono text-xs bg-bg-muted px-1 rounded">×2</code>（K、V 共享 latent 表示）。
            </p>
          </>
        ),
      },
      {
        id: 'advanced-formulas',
        heading: '高级公式（7 套）',
        content: (
          <>
            <p className="text-sm text-fg-muted">带 <code className="font-mono text-xs bg-bg-muted px-1 rounded">kv.formula</code> 的模型。indexer 精度（<code className="font-mono text-xs bg-bg-muted px-1 rounded">idx_bytes</code>）独立于 KV 精度。</p>
            {[
              ['standard_gqa', '标准 MHA/GQA', 'total = T × B × active_layers × 2 × H_kv × D × bytes', '与通用引擎一致，额外支持 draft/MTP 层开关。Qwen3 / Qwen2.5。'],
              ['mla', 'MLA 隐变量 KV', 'total = T × B × active_layers × (kv_lora_rank + qk_rope_head_dim) × bytes', '压缩隐变量 KV。DeepSeek-V3/R1、Kimi-K2.x、GLM-4.7-Flash。'],
              ['dsa_mla', 'DSA/MLA + indexer', 'kv = T × B × active_layers × (kv_lora_rank + qk_rope_head_dim) × bytes\nindexer = T × B × active_indexer_layers × index_head_dim × idx_bytes', 'indexer 是独立侧缓存，用单独精度。DeepSeek-V3.2、GLM-5/5.1/5.2。'],
              ['qwen_linear_full_hybrid', 'Qwen linear/full 混合', 'full = T × B × full_attention_layers × 2 × H_kv × D × bytes\n+ 可选线性状态:\n  conv_state      = B × linear_layers × conv_kernel × (2×key_heads×key_dim + value_heads×value_dim) × 2   (BF16)\n  recurrent_state = B × linear_layers × value_heads × key_dim × value_dim × 4                              (FP32)', '只有 full-attention 层算普通 KV；linear 层是固定大小的运行时状态（可选开关）。Qwen3.5/3.6/3.8。'],
              ['mixed_full_sliding_gqa', '混合 full/sliding GQA', 'full = T × B × full_layers × full_kv_heads × (full_head_dim + full_v_head_dim) × bytes\nsliding = min(T, sliding_window) × B × sliding_layers × sliding_kv_heads × (sliding_head_dim + sliding_v_head_dim) × bytes', 'sliding 层只保留局部窗口。Gemma-4、MiMo-V2.5。'],
              ['minimax_msa', 'MiniMax MSA 稀疏注意力', 'kv = T × B × L × 2 × H_kv × D × bytes\nindexer = T × B × sparse_layers × index_head_dim × idx_bytes', 'indexer 挑选稀疏 KV 块。MiniMax-M3。'],
              ['deepseek_v4_hybrid', 'DeepSeek V4 混合稀疏', 'sliding = active_layers × sliding_window × D × bytes\ncompressed = Σ(ratio > 0) floor(T / ratio) × D × bytes\nindexer = ratio4_layers × floor(T / 4) × index_head_dim × idx_bytes', '每层 compress_ratio（0/4/128）；ratio=4 层额外加 indexer 缓存。DeepSeek-V4。'],
            ].map(([formula, label, eq, desc]) => (
              <div key={formula as string} className="mt-4">
                <p className="text-sm font-semibold text-fg-primary">{label} <span className="font-mono text-xs text-fg-muted">({formula})</span></p>
                <pre className="bg-bg-muted rounded-md p-3 text-xs font-mono overflow-x-auto mt-1">{eq}</pre>
                <p className="text-sm text-fg-muted mt-1">{desc}</p>
              </div>
            ))}
          </>
        ),
      },
      {
        id: 'precision-mapping',
        heading: '精度映射',
        content: (
          <>
            <ul className="list-disc list-inside space-y-1 text-sm mt-2">
              <li>FP32 — 4 字节/元素</li>
              <li>FP16 / BF16 — 2 字节/元素</li>
              <li>FP8 / INT8 — 1 字节/元素</li>
              <li>INT4 / FP4 — 0.5 字节/元素</li>
            </ul>
            <p className="mt-2">
              indexer（DSA / MiniMax / DeepSeek-V4）精度独立：DeepSeek-V4 默认 FP4/INT4，其余 fp16。
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: 'choosing-quantization',
    title: 'Choosing a Quantization',
    sections: [
      {
        id: 'when-to-quantize',
        heading: 'When to Quantize',
        content: (
          <p>
            Quantization trades a small amount of model quality for significant VRAM savings. Use FP16/BF16 when you have enough VRAM and need maximum quality. Use INT8 for a ~2× memory reduction with minimal quality loss. Use INT4 or GGUF Q4_K_M when running on consumer hardware.
          </p>
        ),
      },
      {
        id: 'gguf-formats',
        heading: 'GGUF Formats',
        content: (
          <>
            <p>GGUF is the format used by llama.cpp. The K-quants use mixed precision per tensor:</p>
            <ul className="list-disc list-inside space-y-1 text-sm mt-2">
              <li><strong>Q4_K_M</strong> — 0.606 bytes/param. Best quality-to-size ratio for most use cases.</li>
              <li><strong>Q5_K_M</strong> — 0.711 bytes/param. Better quality, slightly larger.</li>
              <li><strong>Q8_0</strong> — 1.0625 bytes/param. Near-lossless, good for benchmarking.</li>
            </ul>
          </>
        ),
      },
      {
        id: 'kv-cache-precision',
        heading: 'KV Cache Precision',
        content: (
          <>
            <p>
              KV cache precision is independent of weight precision. You can run weights at FP16 but cache at INT8 or FP8 to save memory on long contexts.
            </p>
            <p className="mt-2">
              vLLM supports <code className="font-mono text-xs bg-bg-muted px-1 rounded">--kv-cache-dtype fp8</code> for further savings. The calculator shows a KV cache curve chart to visualize memory usage across different context lengths.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: 'advanced-features',
    title: 'Advanced Features',
    sections: [
      {
        id: 'concurrent-users',
        heading: 'Concurrent User Capacity',
        content: (
          <>
            <p>
              The <strong>Concurrency</strong> panel estimates how many concurrent users your deployment can serve while meeting SLO targets.
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm mt-2">
              <li><strong>TTFT (Time to First Token)</strong> — Prefill latency target (default: 500ms)</li>
              <li><strong>TPOT (Time Per Output Token)</strong> — Decode latency target (default: 50ms)</li>
              <li><strong>Batch Mode</strong> — Toggle between online and offline batch processing</li>
            </ul>
            <p className="mt-2">
              The calculator shows a latency curve chart, bottleneck indicator (memory vs throughput vs prefill), and replica scaling table.
            </p>
          </>
        ),
      },
      {
        id: 'parallelism',
        heading: 'Parallelism Strategies',
        content: (
          <>
            <p>
              The <strong>Parallelism</strong> panel helps you configure multi-GPU deployments:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm mt-2">
              <li><strong>Tensor Parallelism (TP)</strong> — Splits weight matrices across GPUs. Requires fast NVLink interconnect.</li>
              <li><strong>Pipeline Parallelism (PP)</strong> — Splits model layers across GPUs. Works with slower interconnects.</li>
              <li><strong>ZeRO-3</strong> — Shards optimizer states, gradients, and weights. Best for training.</li>
              <li><strong>MoE Expert Parallelism</strong> — Shards expert weights while keeping attention on all GPUs.</li>
            </ul>
            <p className="mt-2">
              Use the GPU slider (1-512 GPUs) to see per-GPU VRAM and cluster topology visualization.
            </p>
          </>
        ),
      },
      {
        id: 'speculative-decoding',
        heading: 'Speculative Decoding',
        content: (
          <>
            <p>
              Speculative decoding uses a small draft model to predict multiple tokens, then verifies with the target model in parallel.
            </p>
            <p className="mt-2">Supported methods:</p>
            <ul className="list-disc list-inside space-y-1 text-sm mt-2">
              <li><strong>Draft Model</strong> — Use a smaller model (e.g., 1B) to draft for a larger model (e.g., 70B)</li>
              <li><strong>Medusa</strong> — Multiple decoding heads predict future tokens</li>
              <li><strong>EAGLE-2 / EAGLE-3</strong> — Auto-regressive draft heads</li>
              <li><strong>Lookahead</strong> — N-gram based speculation</li>
              <li><strong>Prompt Lookup</strong> — Reuse tokens from the prompt</li>
            </ul>
            <p className="mt-2">
              The calculator estimates speedup (1.5-3×) and additional VRAM overhead.
            </p>
          </>
        ),
      },
      {
        id: 'training-methods',
        heading: 'Training Methods',
        content: (
          <>
            <p>
              Training mode supports three methods:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm mt-2">
              <li><strong>Full Fine-tune</strong> — Train all parameters. Requires 12× model size for optimizer states (FP32 master 4 + momentum 4 + variance 4).</li>
              <li><strong>LoRA</strong> — Train low-rank adapter matrices. Reduces VRAM by 10-100×.</li>
              <li><strong>QLoRA</strong> — LoRA with base weights quantized to NF4. Enables fine-tuning on consumer GPUs.</li>
            </ul>
            <p className="mt-2">
              Configure LoRA rank, alpha, and target modules. The calculator shows trainable parameter count and VRAM savings.
            </p>
          </>
        ),
      },
      {
        id: 'cloud-cost-analysis',
        heading: 'Cloud Cost Analysis',
        content: (
          <>
            <p>
              The cloud table shows 61 instances across 8 providers: AWS, Azure, GCP, Lambda, RunPod, Vast, CoreWeave, and Together AI.
            </p>
            <p className="mt-2">Metrics include:</p>
            <ul className="list-disc list-inside space-y-1 text-sm mt-2">
              <li><strong>On-demand hourly cost</strong> — Pay-as-you-go pricing</li>
              <li><strong>Spot hourly cost</strong> — Discounted preemptible instances</li>
              <li><strong>Cost per 1M tokens</strong> — Efficiency metric for inference workloads</li>
              <li><strong>Breakeven hours</strong> — When on-prem capex equals cloud opex</li>
            </ul>
            <p className="mt-2">
              Use the currency picker to view costs in USD, EUR, GBP, JPY, CNY, INR, or BRL.
            </p>
          </>
        ),
      },
      {
        id: 'tco-analysis',
        heading: 'Total Cost of Ownership',
        content: (
          <>
            <p>
              The <strong>TCO</strong> panel compares on-prem vs cloud costs over 3 years:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm mt-2">
              <li><strong>Capex</strong> — GPU purchase cost (MSRP or street price)</li>
              <li><strong>Electricity</strong> — TDP-based power draw × electricity rate × PUE</li>
              <li><strong>Colocation</strong> — Rack space, cooling, network</li>
              <li><strong>Staff</strong> — DevOps / SRE labor</li>
            </ul>
            <p className="mt-2">
              The calculator shows breakeven point and 3-year total cost for both options.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: 'compare-mode',
    title: 'Compare Mode',
    sections: [
      {
        id: 'adding-configs',
        heading: 'Adding Configurations',
        content: (
          <>
            <p>
              Compare up to 3 configurations side-by-side. Press <kbd className="px-1.5 py-0.5 text-xs font-mono bg-bg-muted border border-border-subtle rounded">c</kbd> or click the Compare button to add the current config.
            </p>
            <p className="mt-2">
              Each config is editable in the compare drawer. Change model, precision, context, or batch size independently.
            </p>
          </>
        ),
      },
      {
        id: 'delta-metrics',
        heading: 'Delta Metrics',
        content: (
          <>
            <p>
              Numeric deltas are shown relative to the anchor config (first column):
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm mt-2">
              <li><strong className="text-green-600 dark:text-green-400">Green</strong> — Improvement (lower VRAM, lower cost, higher throughput)</li>
              <li><strong className="text-red-600 dark:text-red-400">Red</strong> — Regression (higher VRAM, higher cost, lower throughput)</li>
            </ul>
            <p className="mt-2">
              Metrics include: VRAM, throughput, cloud cost, cost per 1M tokens, and GPU utilization.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: 'keyboard-shortcuts',
    title: 'Keyboard Shortcuts',
    sections: [
      {
        id: 'shortcuts-list',
        heading: 'All Shortcuts',
        content: (
          <>
            <p>Press <kbd className="px-1.5 py-0.5 text-xs font-mono bg-bg-muted border border-border-subtle rounded">?</kbd> to see all shortcuts.</p>
            <dl className="space-y-2 mt-3">
              {[
                ['⌘K', 'Open model search'],
                ['⌘\\', 'Toggle dark / light mode'],
                ['⌘↵', 'Copy share URL'],
                ['?', 'Show keyboard shortcuts'],
                ['Esc', 'Close dialog / drawer'],
                ['i', 'Switch to Inference mode'],
                ['t', 'Switch to Train mode'],
                ['r', 'Go to Reverse page'],
                ['c', 'Add config to compare'],
                ['g → m', 'Go to Models catalog'],
                ['g → h', 'Go to Hardware catalog'],
              ].map(([keys, desc]) => (
                <div key={keys as string} className="flex items-start gap-3">
                  <dt className="text-xs font-mono bg-bg-muted px-1.5 py-0.5 rounded border border-border-subtle flex-shrink-0">{keys}</dt>
                  <dd className="text-sm text-fg-muted">{desc}</dd>
                </div>
              ))}
            </dl>
          </>
        ),
      },
    ],
  },
  {
    id: 'glossary',
    title: 'Glossary',
    sections: [
      {
        id: 'terms',
        heading: 'Terms',
        content: (
          <dl className="space-y-3">
            {[
              ['VRAM', 'Video RAM — the GPU memory used to store model weights, KV cache, and activations.'],
              ['GQA', 'Grouped Query Attention — uses fewer KV heads than attention heads, reducing KV cache size.'],
              ['MQA', 'Multi-Query Attention — extreme GQA with a single KV head shared across all attention heads.'],
              ['MLA', 'Multi-head Latent Attention — DeepSeek\'s compressed KV cache using a low-rank latent space.'],
              ['MoE', 'Mixture of Experts — architecture where only a subset of parameters are active per token.'],
              ['LoRA', 'Low-Rank Adaptation — fine-tuning method that trains small adapter matrices instead of full weights.'],
              ['QLoRA', 'Quantized LoRA — LoRA with base weights quantized to NF4, enabling fine-tuning on consumer GPUs.'],
              ['Roofline Model', 'Performance model where throughput is bounded by memory bandwidth / active weight size.'],
              ['Tensor Parallelism', 'Splits individual weight matrices across GPUs, requiring fast NVLink interconnect.'],
              ['Pipeline Parallelism', 'Splits model layers across GPUs, suitable for slower interconnects.'],
              ['ZeRO', 'Zero Redundancy Optimizer — shards optimizer states, gradients, and weights across GPUs.'],
              ['TTFT', 'Time to First Token — prefill latency, the time to generate the first output token.'],
              ['TPOT', 'Time Per Output Token — decode latency, the time to generate each subsequent token.'],
              ['SLO', 'Service Level Objective — target latency or throughput for production deployments.'],
              ['Speculative Decoding', 'Uses a draft model to predict multiple tokens, then verifies in parallel.'],
              ['Gradient Checkpointing', 'Trades compute for memory by recomputing activations during backprop.'],
              ['NVLink', 'NVIDIA\'s high-bandwidth GPU interconnect (up to 900 GB/s per GPU).'],
              ['InfiniBand', 'High-speed network fabric for distributed training (400-800 Gbps).'],
            ].map(([term, def]) => (
              <div key={term as string}>
                <dt className="text-sm font-semibold text-fg-primary">{term}</dt>
                <dd className="text-sm text-fg-muted mt-0.5">{def}</dd>
              </div>
            ))}
          </dl>
        ),
      },
    ],
  },
];

export function Guides() {
  const [activeArticle, setActiveArticle] = React.useState(ARTICLES[0].id);
  const [activeSection, setActiveSection] = React.useState(ARTICLES[0].sections[0].id);

  const article = ARTICLES.find(a => a.id === activeArticle) ?? ARTICLES[0];

  // Scroll spy
  React.useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.find(e => e.isIntersecting);
        if (visible) setActiveSection(visible.target.id);
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );
    article.sections.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [article]);

  return (
    <div className="max-w-[1760px] mx-auto px-4 md:px-6 py-6">
      <div className="flex gap-8">

        {/* TOC sidebar — 240px sticky */}
        <nav className="hidden lg:flex flex-col gap-1 w-60 flex-shrink-0 sticky top-24 self-start h-fit" aria-label="Guide navigation">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted mb-2 px-2">Guides</h2>
          {ARTICLES.map(a => (
            <button
              key={a.id}
              onClick={() => { setActiveArticle(a.id); setActiveSection(a.sections[0].id); window.scrollTo({ top: 0 }); }}
              className={cn(
                'text-left text-sm px-2 py-1.5 rounded-md transition-colors',
                activeArticle === a.id
                  ? 'bg-accent/10 text-accent font-medium'
                  : 'text-fg-muted hover:text-fg-default hover:bg-bg-muted'
              )}
            >
              {a.title}
            </button>
          ))}
        </nav>

        {/* Article content — max 680px */}
        <article className="flex-1 max-w-[680px] prose prose-sm dark:prose-invert min-w-0">
          <h1 className="text-2xl font-semibold text-fg-primary mb-6 not-prose">{article.title}</h1>
          {article.sections.map(section => (
            <section key={section.id} id={section.id} className="mb-8 not-prose">
              <h2 className="text-base font-semibold text-fg-primary mb-3">{section.heading}</h2>
              <div className="text-sm text-fg-default leading-relaxed space-y-2">
                {section.content}
              </div>
            </section>
          ))}
        </article>

        {/* Section anchors sidebar — 180px sticky */}
        <nav className="hidden xl:flex flex-col gap-1 w-44 flex-shrink-0 sticky top-24 self-start h-fit" aria-label="Section navigation">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted mb-2 px-2">On this page</h2>
          {article.sections.map(s => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={() => setActiveSection(s.id)}
              className={cn(
                'text-xs px-2 py-1 rounded transition-colors',
                activeSection === s.id
                  ? 'text-accent font-medium'
                  : 'text-fg-muted hover:text-fg-default'
              )}
            >
              {s.heading}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
