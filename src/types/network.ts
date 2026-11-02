import { t } from '@/lib/i18n';
/**
 * Interconnect specifications database.
 */

export interface InterconnectSpec {
  id: string;
  name: string;
  bandwidthGBs: number;    // per GPU/link, GB/s
  latencyUs: number;       // microseconds
  topology: 'intra-node' | 'inter-node';
  notes?: string;
}

export const INTERCONNECT_DB: InterconnectSpec[] = [
  {
    id: 'pcie-gen4',
    get name() { return t('PCIe Gen4 x16', 'PCIe Gen4 x16'); },
    bandwidthGBs: 32,
    latencyUs: 2,
    topology: 'intra-node',
    get notes() { return t('32 GB/s bidirectional', '32 GB/s 双向带宽'); },
  },
  {
    id: 'pcie-gen5',
    get name() { return t('PCIe Gen5 x16', 'PCIe Gen5 x16'); },
    bandwidthGBs: 64,
    latencyUs: 1.5,
    topology: 'intra-node',
    get notes() { return t('64 GB/s bidirectional', '64 GB/s 双向带宽'); },
  },
  {
    id: 'nvlink3',
    get name() { return t('NVLink 3 (A100)', 'NVLink 3（A100）'); },
    bandwidthGBs: 600,
    latencyUs: 0.5,
    topology: 'intra-node',
    get notes() { return t('600 GB/s per GPU, 12 links × 50 GB/s', '每 GPU 600 GB/s，12 条链路 × 50 GB/s'); },
  },
  {
    id: 'nvlink4',
    get name() { return t('NVLink 4 (H100/H200)', 'NVLink 4（H100/H200）'); },
    bandwidthGBs: 900,
    latencyUs: 0.5,
    topology: 'intra-node',
    get notes() { return t('900 GB/s per GPU, 18 links × 50 GB/s', '每 GPU 900 GB/s，18 条链路 × 50 GB/s'); },
  },
  {
    id: 'nvlink5',
    get name() { return t('NVLink 5 (B200/GB200)', 'NVLink 5（B200/GB200）'); },
    bandwidthGBs: 1800,
    latencyUs: 0.3,
    topology: 'intra-node',
    get notes() { return t('1.8 TB/s per GPU', '每 GPU 1.8 TB/s'); },
  },
  {
    id: 'ib-hdr',
    get name() { return t('InfiniBand HDR', 'InfiniBand HDR'); },
    bandwidthGBs: 25,
    latencyUs: 1,
    topology: 'inter-node',
    get notes() { return t('200 Gb/s ~25 GB/s per port', '每端口 200 Gb/s，约 25 GB/s'); },
  },
  {
    id: 'ib-ndr',
    get name() { return t('InfiniBand NDR', 'InfiniBand NDR'); },
    bandwidthGBs: 50,
    latencyUs: 0.6,
    topology: 'inter-node',
    get notes() { return t('400 Gb/s ~50 GB/s per port', '每端口 400 Gb/s，约 50 GB/s'); },
  },
  {
    id: 'ib-xdr',
    get name() { return t('InfiniBand XDR', 'InfiniBand XDR'); },
    bandwidthGBs: 100,
    latencyUs: 0.5,
    topology: 'inter-node',
    get notes() { return t('800 Gb/s ~100 GB/s per port', '每端口 800 Gb/s，约 100 GB/s'); },
  },
  {
    id: 'rocev2',
    get name() { return t('RoCEv2 (Spectrum-X)', 'RoCEv2 (Spectrum-X)'); },
    bandwidthGBs: 50,
    latencyUs: 2,
    topology: 'inter-node',
    get notes() { return t('400/800 Gb/s, 1-3µs latency', '400/800 Gb/s，延迟 1-3µs'); },
  },
  {
    id: 'aws-efa',
    get name() { return t('AWS EFA', 'AWS EFA'); },
    bandwidthGBs: 400,
    latencyUs: 1.5,
    topology: 'inter-node',
    get notes() { return t('3,200 Gbps aggregate on p5 instances', 'p5 实例上聚合带宽 3,200 Gbps'); },
  },
  {
    id: 'tpu-ici',
    get name() { return t('Google TPU ICI', 'Google TPU ICI'); },
    bandwidthGBs: 600,
    latencyUs: 0.5,
    topology: 'intra-node',
    get notes() { return t('4,800 Gb/s/chip on v5p', 'v5p 上每芯片 4,800 Gb/s'); },
  },
];
