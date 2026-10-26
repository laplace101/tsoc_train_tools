import { t } from '@/lib/i18n';
/**
 * Cluster topology recommendation based on GPU count and workload.
 */

export interface TopologyRecommendation {
  description: string;   // e.g. "2-tier fat-tree"
  interconnect: string;  // recommended interconnect
  notes: string;
}

/**
 * Recommend network topology based on cluster size and workload type.
 *
 * Decision tree:
 * - ≤8 GPUs (single node): NVLink
 * - 2-8 nodes (9-64 GPUs): fat-tree single-tier
 * - 8-64 nodes (65-512 GPUs): 2-tier fat-tree or rail-optimized
 * - 64+ nodes (513+ GPUs): 3-tier with spine-leaf
 */
export function recommendTopology(
  numGPUs: number,
  workload: 'training' | 'inference',
): TopologyRecommendation {
  if (numGPUs <= 8) {
    return {
      description: t('Single node', '单机'),
      interconnect: 'NVLink',
      notes: workload === 'training'
        ? t('All GPUs connected via NVLink switch; use TP=8 for full bandwidth', '所有 GPU 通过 NVLink 交换机互联；用 TP=8 跑满带宽')
        : t('Tensor parallelism across all GPUs; NVLink provides ~900 GB/s', '跨全部 GPU 做张量并行；NVLink 可提供约 900 GB/s 带宽'),
    };
  }

  if (numGPUs <= 64) {
    return {
      description: t('Fat-tree single-tier', '单层胖树'),
      interconnect: 'InfiniBand NDR (400 Gb/s)',
      notes: workload === 'training'
        ? t('Single-tier fat-tree; use DP + TP within nodes; PP across nodes', '单层胖树；节点内用 DP + TP，跨节点用 PP')
        : t('Low-latency single-tier fabric; suitable for disaggregated prefill/decode', '低时延单层组网；适合 Prefill / Decode 分离部署'),
    };
  }

  if (numGPUs <= 512) {
    return {
      description: '2-tier fat-tree or rail-optimized',
      interconnect: 'InfiniBand NDR/XDR (400-800 Gb/s)',
      notes: workload === 'training'
        ? t('2-tier fat-tree with rail-optimized routing; use ZeRO-3 or 3D parallelism', '双层胖树 + rail 优化路由；建议使用 ZeRO-3 或 3D 并行')
        : t('Rail-optimized for all-to-all traffic patterns in MoE inference', '针对 MoE 推理中的 all-to-all 通信做 rail 优化'),
    };
  }

  return {
    description: '3-tier spine-leaf',
    interconnect: 'InfiniBand XDR (800 Gb/s) + NVLink intra-node',
    notes: workload === 'training'
      ? '3-tier spine-leaf with 1:1 oversubscription; pipeline parallelism across pods'
      : t('Hierarchical fabric; route inference requests to GPU pods by model shard', '分层组网；按模型分片把推理请求路由到对应 GPU Pod'),
  };
}
