# 贡献指南

> 英文版见 [CONTRIBUTING.en.md](CONTRIBUTING.en.md)。

## 添加新模型

### 快速开始

1. **加入白名单** —— 编辑 `data/models.yml`：
   ```yaml
   models:
     - meta-llama/Llama-3.1-8B
     - your-org/your-new-model   # ← 在这里添加
   ```

2. **执行抓取**：
   ```bash
   npx tsx scripts/ingest-models.ts
   ```

3. **校验**：
   ```bash
   npm run validate
   npm test
   ```

4. **提交**：
   ```bash
   git add src/data/models.json data/.model-cache.json
   git commit -m "data: add your-new-model"
   ```

### 使用 HuggingFace Token（用于受限模型）

```bash
export HF_TOKEN=hf_your_token_here
npx tsx scripts/ingest-models.ts
```

### 手动覆盖

如果模型存在 `config.json` 中没有的字段（MoE 激活参数量、MLA 压缩维度等），在 `data/models-override.yml` 中添加：

```yaml
overrides:
  "your-org/your-new-model":
    paramsActive: 37000000000
    mlaCompressedDim: 512
    notes: "MoE with MLA attention"
```

### 脚本做了什么

1. 从 HuggingFace Hub 拉取 `config.json`
2. 解析架构字段（层数、隐藏维度、注意力头数等）
3. 识别架构类型（dense / MoE / MLA / VLM / SSM / hybrid）
4. 从 safetensors 元数据中提取参数量
5. 按 schema 校验所有字段
6. 与现有 `src/data/models.json` 合并
7. 把缓存写入 `data/.model-cache.json` 以支持增量更新

### 排查问题

**"No config.json" 错误：**
- 模型受限（gated）→ 设置 `HF_TOKEN` 环境变量
- 模型不存在 → 检查 HuggingFace URL
- 模型的 config 不标准 → 添加手动覆盖

**"Validation failed" 错误：**
- 查看错误信息中提示缺失的字段
- 在 `data/models-override.yml` 中添加手动覆盖
- 或者直接去 HuggingFace 上修正该模型的 `config.json`

---

## 添加新 GPU

### 快速开始

1. **加入硬件 YAML** —— 编辑 `data/hardware.yml`：
   ```yaml
   gpus:
     # ... 已有条目 ...

     - id: nvidia-h100-nvl
       vendor: nvidia
       name: H100 NVL 94GB
       category: datacenter
       memoryGB: 94
       memoryBandwidthGBs: 3900
       flops:
         fp32: 60
         fp16: 900
         fp8: 1800
         int8: 1800
       tdpWatts: 400
       formFactor: pcie
       releaseYear: 2023
       notes: "PCIe variant with 94GB HBM3"
   ```

2. **执行刷新**：
   ```bash
   npx tsx scripts/refresh-hardware.ts
   ```

3. **校验**：
   ```bash
   npm run validate
   npm test
   ```

4. **提交**：
   ```bash
   git add src/data/gpus.json data/hardware.yml
   git commit -m "data: add H100 NVL 94GB"
   ```

### 必填字段

- `id` —— 唯一标识（kebab-case）
- `vendor` —— `nvidia` | `amd` | `apple` | `intel` | `google-tpu`
- `name` —— 显示名称
- `category` —— `consumer` | `workstation` | `datacenter` | `apple-silicon` | `tpu`
- `memoryGB` —— 显存容量，单位 GB（1-1024）
- `memoryBandwidthGBs` —— HBM 带宽，单位 GB/s
- `flops` —— 包含 `fp32`、`fp16`、`int8` 的对象（TFLOPS 或 TOPS）
- `tdpWatts` —— 设计功耗（1-5000）
- `formFactor` —— `pcie` | `sxm` | `oam` | `integrated` | `mxm`
- `releaseYear` —— 2000-2035

### 可选字段

- `nvlink` —— `{ perGPU_GBs: number }`，NVLink 带宽
- `msrpUSD` —— 官方建议零售价
- `streetUSD` —— 实际市场价格
- `notes` —— 任何补充说明

---

## 添加云实例

### 快速开始

1. **加入云实例覆盖文件** —— 编辑 `data/cloud-overrides.yml`：
   ```yaml
   instances:
     # ... 已有条目 ...

     - id: aws-p6.48xlarge
       provider: aws
       instanceType: p6.48xlarge
       gpus:
         - id: nvidia-b200-sxm
           count: 8
       vcpus: 192
       ramGB: 2048
       storageGB: 8000
       networkGbps: 3200
       interconnect: nvswitch
       pricing:
         onDemandUSDPerHour: 150.00
         spotUSDPerHour: 45.00
       regions:
         - us-east-1
         - us-west-2
       lastPriceUpdate: "2026-04-20"
   ```

2. **执行刷新**：
   ```bash
   npx tsx scripts/refresh-cloud-prices.ts
   ```

3. **校验**：
   ```bash
   npm run validate
   npm test
   ```

4. **提交**：
   ```bash
   git add src/data/cloud.json data/cloud-overrides.yml
   git commit -m "data: add AWS p6.48xlarge (B200)"
   ```

---

## 每日自动更新

GitHub Actions 工作流会自动运行：

- **模型**：每天 3:17 UTC（`.github/workflows/ingest-models.yml`）
- **价格**：每天 4:00 UTC（`.github/workflows/refresh-prices.yml`）

数据有变化时两者都会自动创建 PR。审核并合并 PR 即可更新线上站点。

### 手动触发

进入 GitHub Actions → 选择工作流 → "Run workflow" → 选择参数。

---

## 测试你的改动

### 1. 校验数据 schema

```bash
npm run validate
```

它会检查：
- 所有必填字段是否齐全
- 数值范围是否合理（显存 1-1024 GB、参数量 1M-2T 等）
- 类型是否正确

### 2. 运行单元测试

```bash
npm test
```

244 个测试必须全部通过。

### 3. 构建应用

```bash
npm run build
```

必须以 0 个 TypeScript 错误完成。

### 4. 本地测试

```bash
npm run dev
```

打开 http://localhost:5173 并确认：
- 新模型出现在模型选择器中
- 新 GPU 出现在 GPU 推荐中
- 新云实例出现在云实例表中
- 所有计算结果正确

### 5. 在 Docker 中测试

```bash
docker compose up --build
```

打开 http://localhost:3000 并确认生产构建正常工作。

---

## 数据文件位置

| 文件 | 用途 | 更新方式 |
|---|---|---|
| `src/data/models.json` | 模型数据库（随应用打包） | `ingest-models.ts` |
| `src/data/gpus.json` | GPU 数据库（随应用打包） | `refresh-hardware.ts` |
| `src/data/cloud.json` | 云实例价格（随应用打包） | `refresh-cloud-prices.ts` |
| `src/data/exchange-rates.json` | 汇率（随应用打包） | `refresh-cloud-prices.ts` |
| `src/data/meta.json` | 数据版本与时间戳 | 所有脚本 |
| `data/models.yml` | 模型白名单（事实来源） | 手动 |
| `data/models-override.yml` | 模型手动覆盖 | 手动 |
| `data/hardware.yml` | GPU 规格（事实来源） | 手动 |
| `data/cloud-overrides.yml` | 云实例价格（事实来源） | 手动 |
| `data/.model-cache.json` | 增量更新缓存 | `ingest-models.ts` |

---

## 常见问题

### 受限模型报 "No config.json"

**解决方案**：设置 `HF_TOKEN` 环境变量：
```bash
export HF_TOKEN=hf_your_token_here
npx tsx scripts/ingest-models.ts
```

### "Validation failed" 错误

**解决方案**：查看错误信息并添加手动覆盖：
```yaml
# data/models-override.yml
overrides:
  "problematic-model":
    paramsActive: 12900000000
    notes: "Manual override for MoE active params"
```

### 脚本卡住或超时

**解决方案**：HuggingFace API 可能较慢。脚本在 CI 中有 45 分钟超时。本地运行时请耐心等待，或临时减少白名单条目。

### 汇率获取失败

**解决方案**：脚本会回退使用 `src/data/exchange-rates.json` 中的备用汇率。若 Frankfurter API 不可用，将直接使用内置汇率。

---

## 完整刷新（忽略缓存）

```bash
FULL_REFRESH=true npx tsx scripts/ingest-models.ts
```

即使 `lastModified` 没有变化，也会重新拉取全部模型。

---

## 有疑问？

在 GitHub 上提 issue，或查看脚本文件中的注释了解实现细节。
