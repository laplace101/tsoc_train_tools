import { t } from '@/lib/i18n';
/**
 * Clustering tool matrix for distributed LLM inference and training.
 */

export interface ClusteringTool {
  id: string;
  name: string;
  scenario: string;
  group: 'production' | 'hpc' | 'lightweight' | 'consumer';
  setupComplexity: 1 | 2 | 3 | 4 | 5;  // 1=easy, 5=hard
  supportedHardware: string[];
  maxClusterSize: string;
  latencyOverhead: string;
  description: string;
  docsUrl: string;
}

export const CLUSTERING_TOOLS: ClusteringTool[] = [
  {
    id: 'k8s-gpu-operator',
    name: 'Kubernetes + GPU Operator',
    get scenario() { return t('Production multi-tenant serving', '生产级多租户服务'); },
    group: 'production',
    setupComplexity: 4,
    supportedHardware: ['NVIDIA A100', 'H100', 'H200', 'L40S', 'A10G'],
    get maxClusterSize() { return t('10,000+ GPUs', '10,000+ 张 GPU'); },
    latencyOverhead: '1-5 ms (pod scheduling)',
    get description() { return t('NVIDIA GPU Operator automates GPU driver/plugin lifecycle in K8s. Pair with Volcano or Kueue for gang scheduling. Best for multi-tenant production.', 'NVIDIA GPU Operator 自动化管理 K8s 中的 GPU 驱动与插件生命周期。配合 Volcano 或 Kueue 做 gang 调度，最适合多租户生产环境。'); },
    docsUrl: 'https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/',
  },
  {
    id: 'slurm-enroot',
    name: 'Slurm + Enroot + Pyxis',
    get scenario() { return t('HPC long-running training jobs', 'HPC 长时训练任务'); },
    group: 'hpc',
    setupComplexity: 3,
    supportedHardware: ['NVIDIA A100', 'H100', 'H200', 'AMD MI300X'],
    get maxClusterSize() { return t('100,000+ GPUs', '100,000+ 张 GPU'); },
    latencyOverhead: '< 1 ms (bare-metal)',
    get description() { return t('Industry-standard HPC scheduler. Enroot provides rootless container runtime; Pyxis is the Slurm plugin. Optimal for large training runs with predictable job queues.', '业界标准的 HPC 调度器。Enroot 提供无 root 权限的容器运行时，Pyxis 是配套的 Slurm 插件。适合训练规模大、作业队列可预期的场景。'); },
    docsUrl: 'https://github.com/NVIDIA/enroot',
  },
  {
    id: 'ray-serve-vllm',
    name: 'Ray Serve + vLLM',
    get scenario() { return t('Distributed inference with autoscaling', '带自动扩缩的分布式推理'); },
    group: 'production',
    setupComplexity: 3,
    supportedHardware: ['NVIDIA A100', 'H100', 'H200', 'L40S', 'A10G', 'AMD MI300X'],
    get maxClusterSize() { return t('1,000+ GPUs', '1,000+ 张 GPU'); },
    get latencyOverhead() { return t('2-10 ms (Ray overhead)', '2–10 ms（Ray 开销）'); },
    get description() { return t('Ray Serve handles request routing and autoscaling; vLLM provides PagedAttention and continuous batching. Supports multi-node tensor parallelism natively.', 'Ray Serve 负责请求路由与自动扩缩；vLLM 提供 PagedAttention 和连续批处理，原生支持多机张量并行。'); },
    docsUrl: 'https://docs.vllm.ai/en/latest/serving/distributed_serving.html',
  },
  {
    id: 'nomad',
    name: 'Nomad + NVIDIA Plugin',
    get scenario() { return t('Lightweight orchestration', '轻量级编排'); },
    group: 'lightweight',
    setupComplexity: 2,
    supportedHardware: ['NVIDIA (any)', 'AMD (any)'],
    maxClusterSize: '1,000+ nodes',
    latencyOverhead: '1-3 ms',
    get description() { return t('HashiCorp Nomad with the NVIDIA device plugin. Simpler than Kubernetes, supports GPU scheduling with less operational overhead. Good for smaller teams.', 'HashiCorp Nomad 搭配 NVIDIA 设备插件。比 Kubernetes 更简单，支持 GPU 调度且运维负担更小，适合规模较小的团队。'); },
    docsUrl: 'https://developer.hashicorp.com/nomad/plugins/devices/nvidia',
  },
  {
    id: 'exo',
    name: 'exo',
    get scenario() { return t('Consumer / Apple Silicon heterogeneous cluster', '消费级 / Apple Silicon 异构集群'); },
    group: 'consumer',
    setupComplexity: 1,
    supportedHardware: ['Apple Silicon (M1/M2/M3/M4)', 'NVIDIA consumer', 'AMD consumer'],
    maxClusterSize: '~20 devices',
    get latencyOverhead() { return t('50-200 ms (Ethernet/TB5)', '50–200 ms（以太网 / TB5）'); },
    get description() { return t('Ring pipeline parallelism over mDNS-discovered peers. Supports Thunderbolt 5 RDMA for reduced latency. Ideal for running 70B+ models across multiple Mac Studios or consumer GPUs.', '基于 mDNS 自动发现的节点组成环形流水线并行。支持 Thunderbolt 5 RDMA 以降低延迟，适合在多台 Mac Studio 或消费级 GPU 上跑 70B 以上模型。'); },
    docsUrl: 'https://github.com/exo-explore/exo',
  },
  {
    id: 'petals',
    name: 'Petals',
    get scenario() { return t('Public swarm / collaborative inference', '公共集群 / 协作式推理'); },
    group: 'consumer',
    setupComplexity: 1,
    supportedHardware: ['NVIDIA consumer', 'AMD consumer', 'Apple Silicon'],
    get maxClusterSize() { return t('Unlimited (public swarm)', '不限（公共集群）'); },
    latencyOverhead: '200-2000 ms (internet)',
    get description() { return t('BitTorrent-style distributed inference. Each peer hosts a few transformer layers. ~5-6 tok/s for 70B, ~4 tok/s for 180B. Best for experimentation, not production SLOs.', '类 BitTorrent 的分布式推理：每个节点承载若干层 Transformer。70B 约 5–6 tok/s，180B 约 4 tok/s。适合实验探索，不适合生产 SLO。'); },
    docsUrl: 'https://github.com/bigscience-workshop/petals',
  },
  {
    id: 'gpustack',
    name: 'GPUStack',
    get scenario() { return t('Multi-backend GPU orchestration', '多后端 GPU 编排'); },
    group: 'lightweight',
    setupComplexity: 2,
    supportedHardware: ['NVIDIA (any)', 'AMD (any)', 'Apple Silicon', 'Intel Arc'],
    get maxClusterSize() { return t('100+ GPUs', '100+ 张 GPU'); },
    latencyOverhead: '5-20 ms',
    get description() { return t('Unified management plane for vLLM, SGLang, and TRT-LLM backends. Provides a single API endpoint across heterogeneous GPU clusters with automatic backend selection.', '统一管理 vLLM、SGLang、TRT-LLM 后端。为异构 GPU 集群提供单一 API 入口，并自动挑选合适的后端。'); },
    docsUrl: 'https://github.com/gpustack/gpustack',
  },
  {
    id: 'localai',
    name: 'LocalAI',
    get scenario() { return t('Local federation with llama.cpp workers', '基于 llama.cpp worker 的本地联邦'); },
    group: 'consumer',
    setupComplexity: 1,
    supportedHardware: ['NVIDIA consumer', 'AMD consumer', 'Apple Silicon', 'CPU'],
    maxClusterSize: '~10 nodes',
    get latencyOverhead() { return t('100-500 ms (LAN)', '100–500 ms（局域网）'); },
    get description() { return t('OpenAI-compatible API server using llama.cpp RPC workers for distributed inference. Supports CPU offload. Best for home labs and offline deployments.', '基于 llama.cpp RPC worker 的分布式推理服务，兼容 OpenAI API。支持 CPU 卸载，适合家庭实验室和离线部署。'); },
    docsUrl: 'https://localai.io/features/distribute/',
  },
];

/** Get tools filtered by group */
export function getToolsByGroup(group: ClusteringTool['group']): ClusteringTool[] {
  return CLUSTERING_TOOLS.filter(t => t.group === group);
}
