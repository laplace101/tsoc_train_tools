# LLMcalc — LLM 基础设施计算器

> 精度优先、纯客户端运行的工具，用于估算任意 LLM 负载所需的 GPU 显存、吞吐、延迟与云上成本。

为需要准确硬件估算的 ML 工程师、基础设施架构师与开发者打造 —— 不是拍脑袋的粗略估计。

> 英文版见 [README.en.md](README.en.md)。

---

## 它能做什么

LLMcalc 回答你在部署或训练大语言模型之前真正关心的问题：

- **这个模型需要多少显存？** —— 拆解为权重、KV Cache、激活值、梯度和优化器状态
- **哪张 GPU 能跑得动？** —— 按档次排序（经济 / 均衡 / 性能），带利用率条
- **云上要花多少钱？** —— 可排序表格，覆盖 AWS、Azure、GCP、Lambda、RunPod、Vast、CoreWeave、Together AI
- **能跑多快？** —— 基于 Roofline 模型的 tokens/sec 估算，含 prefill / decode 拆解
- **每百万 token 最便宜的选择是哪个？** —— 自动计算成本效率指标
- **能支撑多少并发用户？** —— 结合 SLO 的 TTFT / TPOT 目标做容量规划
- **自建 vs 上云的 TCO 是多少？** —— 完整的总拥有成本，含盈亏平衡分析
- **软件栈该怎么搭？** —— 操作系统、驱动、CUDA、PyTorch、容器与监控方案建议

全部在浏览器内运行。无后端、无遥测、无需账号。
<img width="2936" height="1668" alt="image" src="https://github.com/user-attachments/assets/072b10f6-7a8d-4537-ab32-3a06078e0a0a" />

---

## 功能特性

### 工作负载模式

| 模式 | 计算内容 |
|---|---|
| **推理** | 权重 + KV Cache + 开销，吞吐，每 token 成本 |
| **微调** | 权重 + 激活值 + 梯度 + 优化器（LoRA / QLoRA / 全参） |
| **训练** | 含梯度检查点的完整预训练显存 |
| **反查** | 给定 GPU，哪些模型能跑得下？ |

### 计算引擎

所有公式都是无副作用的纯 TypeScript 函数，并用属性测试（property-based testing）独立验证（19 个测试文件共 244 个用例）。

| 组成 | 公式 |
|---|---|
| 权重显存 | `num_params × bytes_per_param / 1e9` |
| KV Cache | `2 × layers × batch × seq_len × kv_heads × head_dim × bytes / 1e9` |
| 激活值显存 | `layers × seq × batch × hidden × (34 + 5×seq×heads/hidden) × 2` |
| 优化器（Adam） | `14 × num_params` 字节 |
| 吞吐 | `bandwidth_GBs / active_weights_GB × efficiency_factor` |
| 每 100 万 token 成本 | `(hourly_cost / (tok_per_sec × 3600)) × 1_000_000` |

支持 MoE（吞吐按激活参数量算、显存按总量算）、GQA、MQA 和 MLA（DeepSeek 压缩 KV Cache）。

### 精度选项

| 格式 | 字节/参数 |
|---|---|
| FP32 | 4.0 |
| FP16 / BF16 | 2.0 |
| INT8 / FP8 | 1.0 |
| INT4 | 0.5 |
| GGUF Q4\_K\_M | 0.606 |
| GGUF Q5\_K\_M | 0.711 |
| GGUF Q8\_0 | 1.0625 |

KV Cache 精度独立于权重精度设置。

### 模型数据库

70+ 个模型家族共 513 个模型，涵盖 Llama、Mistral、Qwen、DeepSeek、Gemma、Phi、Falcon、Cohere、Grok、InternLM、MiniCPM、SmolLM、Starcoder、Yi 等。每条记录都包含完整的架构参数：层数、隐藏维度、注意力头数、KV 头数、头维度、最大上下文长度、注意力类型以及 MoE 配置。

### GPU 数据库

12 家厂商共 147 张 GPU：

| 厂商 | 覆盖范围 |
|---|---|
| NVIDIA | 消费级（RTX 20/30/40/50 系列）、工作站（RTX Ada、RTX Pro）、数据中心（A100、H100、H200、B100、B200、GB200） |
| AMD | RDNA 消费级（RX 7900 XTX）、Instinct 数据中心（MI300X、MI325X） |
| Apple Silicon | M1 到 M4 各版本（全芯片档次） |
| Intel | Arc 消费级、Gaudi 数据中心 |
| Google | TPU v4、v5e、v5p |
| AWS | Trainium、Inferentia |
| Cerebras | WSE-2、WSE-3（晶圆级） |
| Groq | LPU |
| SambaNova | RDU |
| Tenstorrent | Grayskull、Wormhole |
| Qualcomm | Cloud AI 100 |
| Huawei | Ascend |

### 云实例数据库

8 家服务商共 37 个实例：AWS、Azure、GCP、Lambda、RunPod、Vast、CoreWeave 和 Together AI —— 含按需与竞价两种定价。

### 高级面板

| 面板 | 提供内容 |
|---|---|
| **KV Cache 配置** | 精度选择器、缓存大小曲线图、逐层拆解 |
| **并发用户** | 结合 TTFT/TPOT SLO 目标的容量规划，对数刻度滑块最高 1 万用户 |
| **投机解码** | 草稿模型、Medusa、EAGLE-2、EAGLE-3、Lookahead、Prompt Lookup —— 含加速比估算与显存开销 |
| **并行策略** | 张量并行、流水线并行、ZeRO-3、MoE 并行策略，附拓扑图 |
| **集群** | 多节点规模测算、互联方案（NVLink / InfiniBand / PCIe）、集群拓扑可视化 |
| **容灾** | 副本冗余与故障转移成本建模 |
| **TCO** | 自建 vs 上云总拥有成本，含盈亏平衡分析（capex、PUE、电费、机房、人员） |
| **存储** | 检查点体积、磁盘 IOPS 需求 |
| **网络** | 分布式训练所需带宽 |
| **功耗** | 基于 TDP 的功耗与电费估算 |
| **分词器** | 词表大小、Embedding 显存、各模型的信息密度（fertility） |
| **多模态** | VLM 的视觉编码器显存开销 |
| **数据集估算** | 训练数据集体积与 token 数估算 |
| **格式推荐** | 按显存预算给出量化格式建议 |
| **预热** | 模型加载与预热时间估算 |
| **请求成本** | 按输入/输出 token 比例拆解单请求成本 |
| **Prefill/Decode 拆解** | 分别给出 prefill 与 decode 的吞吐和延迟 |
| **延迟曲线** | 吞吐与延迟的权衡曲线图 |
| **批处理** | 离线批处理的吞吐与成本建模 |
| **自动扩缩** | 副本自动伸缩阈值与成本 |

### 对比模式

最多可并排添加 3 个配置。数值差异相对锚点配置展示 —— 绿色表示改善、红色表示退化 —— 覆盖显存、吞吐、云成本和每百万 token 成本。

### 反查模式

把计算器反过来用：选一张 GPU（或手动输入显存），设定上下文长度和工作负载模式，数据库中所有模型按适配状态排序。放不下的模型会显示所需最低精度。

### 可分享链接

完整的计算器状态（模型、权重精度、KV 精度、上下文、批大小、模式、并发用户数、SLO 目标）都编码在 URL 里。分享链接后，对方看到的配置与你完全一致。

### 键盘快捷键

| 快捷键 | 操作 |
|---|---|
| `⌘K` | 打开模型搜索 |
| `⌘\` | 切换深色 / 浅色模式 |
| `⌘↵` | 复制分享链接 |
| `?` | 显示全部快捷键 |
| `i` `f` `t` `r` | 切换模式（推理 / 微调 / 训练 / 反查） |
| `c` | 把当前配置加入对比 |
| `g` → `m` | 前往模型库 |
| `g` → `h` | 前往硬件库 |
| `Esc` | 关闭弹窗或抽屉 |

---

## 页面

| 路由 | 说明 |
|---|---|
| `/` | 主计算器 |
| `/compare` | 配置并排对比 |
| `/reverse` | GPU → 模型适配矩阵 |
| `/models` | 可排序、可筛选的模型库 |
| `/hardware` | 可排序、可筛选的 GPU 库 |
| `/guides` | 方法论说明、量化指南、术语表 |

---

## 技术栈

| 层次 | 技术 |
|---|---|
| 框架 | React 18 + Vite 5 + TypeScript |
| 样式 | Tailwind CSS 3 + CSS 自定义属性 |
| 状态 | Zustand + nuqs（URL 即状态） |
| 路由 | React Router v7 |
| 搜索 | Fuse.js（模型模糊搜索） |
| 公式 | KaTeX（公式渲染） |
| 图表 | Recharts |
| 表格 | TanStack Table v8 |
| 图标 | Lucide React |
| 测试 | Vitest + fast-check（属性测试） |
| 容器 | Docker（node:20-alpine → nginx:1.27-alpine） |

---

## 快速开始

### 前置要求

- Node.js 20+
- npm 10+

### 本地开发

```bash
git clone https://github.com/kkpkishan/llm-infra-planner.git
cd llm-infra-planner
npm install
npm run dev
```

打开 [http://localhost:5173](http://localhost:5173)。

### 运行测试

```bash
# 单元测试 + 属性测试
npm test

# 监听模式
npm run test:watch

# 按 schema 校验数据文件
npm run validate
```

### 生产构建

```bash
npm run build
# 产物在 dist/
```

---

## Docker

```bash
# 构建并运行
docker build -t llm-hardware-calculator:latest .
docker run -p 3000:80 llm-hardware-calculator:latest
```

```bash
# Docker Compose（推荐）
docker compose up -d
```

打开 [http://localhost:3000](http://localhost:3000)。

生产镜像采用两阶段构建：

1. **构建阶段** —— `node:20-alpine` 安装依赖并执行 `npm run build`
2. **运行阶段** —— `nginx:1.27-alpine` 提供静态资源，带 gzip、带哈希资源的 1 年不可变缓存、SPA 路由和限流

镜像体积约 25 MB。

---

## 项目结构

```
src/
├── components/
│   ├── calculator/     # 全部计算器 UI 组件（50+ 组件）
│   ├── feedback/       # Toast、EmptyState、ErrorState、Skeleton
│   ├── layout/         # TopBar、ModeTabsBar、PageShell、Footer
│   └── primitives/     # Button、Input、Slider、Dialog、Popover 等
├── data/
│   ├── models.json     # 513 份 LLM 架构规格
│   ├── gpus.json       # 147 份带价格的 GPU 规格
│   ├── cloud.json      # 37 条云实例价格记录
│   └── meta.json       # 数据版本与构建时间戳
├── lib/
│   ├── formulas/       # 纯计算内核（40+ 公式模块）
│   ├── keyboard-shortcuts.ts
│   ├── url-serializer.ts
│   └── use-theme.ts
├── pages/              # Home、Compare、Reverse、Models、Hardware、Guides
├── store/              # Zustand 计算器 store
└── styles/             # Tailwind 配置、设计令牌、全局样式
scripts/
├── ingest-models.ts    # HuggingFace 模型抓取流水线
├── refresh-cloud-prices.ts
├── refresh-hardware.ts
└── validate-data.ts    # 构建期 JSON schema 校验
```

---

## 数据

所有数据都是随应用打包的静态 JSON，运行期不发起任何 API 请求。

- **模型** —— 通过抓取流水线从 HuggingFace 的 `config.json` 获取，MoE 激活参数量与 MLA 压缩维度等字段有人工覆盖值
- **GPU** —— 官方建议价 / 零售价、显存带宽、FP16 TFLOPS、TDP
- **云实例** —— 按需与竞价定价，带 `lastPriceUpdate` 时间戳

要更新数据，编辑 `src/data/` 下的 JSON 文件，然后运行 `npm run validate` 检查是否符合 schema。

要从 HuggingFace 重新抓取模型：

```bash
npx tsx scripts/ingest-models.ts
```

---

## 界面语言

界面默认使用中文，顶部工具栏的 `EN / CN` 按钮可随时切换回英文，语言偏好保存在 `localStorage` 中。

框架名、模型名、精度格式（FP16 / INT4）、GPU 型号、协议名（NVLink / InfiniBand）等技术名词保留英文原文。

---

## 参与贡献

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feat/your-feature`
3. 提交改动并补充测试
4. 运行 `npm test` 和 `npm run lint` —— 两者都必须通过
5. 发起 Pull Request

贡献指南详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 许可证

MIT
