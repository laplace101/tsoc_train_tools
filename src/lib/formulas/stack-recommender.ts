import type { GPUSpec, StackRecommendation, WorkloadMode } from './types';
import { t } from '@/lib/i18n';

/**
 * Recommend OS, driver, CUDA, PyTorch, container, and monitoring stack
 * based on GPU generation and workload mode.
 */
export function recommendStack(gpu: GPUSpec, mode: WorkloadMode): StackRecommendation {
  // ── OS ────────────────────────────────────────────────────────────────────
  let os: string;
  if (gpu.vendor === 'apple') {
    os = t('macOS 15+ (Sequoia)', 'macOS 15+（Sequoia）');
  } else if (gpu.vendor === 'amd') {
    os = t('Ubuntu 24.04 LTS (ROCm 6.2+)', 'Ubuntu 24.04 LTS（ROCm 6.2+）');
  } else {
    os = 'Ubuntu 24.04 LTS';
  }

  // ── Driver & CUDA ─────────────────────────────────────────────────────────
  let driver: string;
  let cuda: string;

  if (gpu.vendor === 'apple') {
    driver = t('Metal (built-in)', 'Metal（系统内置）');
    cuda = t('N/A (Metal Performance Shaders)', '不适用（Metal Performance Shaders）');
  } else if (gpu.vendor === 'amd') {
    driver = 'ROCm 6.2+';
    cuda = 'HIP (ROCm)';
  } else {
    // NVIDIA — determine by GPU generation
    const name = gpu.name.toLowerCase();
    if (name.includes('b200') || name.includes('b100') || name.includes('5090') || name.includes('5080') || name.includes('blackwell') || name.includes('6000 pro')) {
      driver = '570+';
      cuda = 'CUDA 12.8+';
    } else if (name.includes('h100') || name.includes('h200') || name.includes('hopper') || name.includes('l40') || name.includes('l4') || name.includes('4090') || name.includes('4080') || name.includes('4070') || name.includes('4060') || name.includes('ada')) {
      driver = '535+';
      cuda = t('CUDA 12.1+ (12.4+ for FP8)', 'CUDA 12.1+（用 FP8 需要 12.4+）');
    } else {
      // Ampere and older (A100, 3090, etc.)
      driver = '525+';
      cuda = 'CUDA 11.8–12.8';
    }
  }

  // ── PyTorch ───────────────────────────────────────────────────────────────
  let pytorch: string;
  if (gpu.vendor === 'apple') {
    pytorch = t('MLX or PyTorch 2.x (MPS backend)', 'MLX 或 PyTorch 2.x（MPS 后端）');
  } else if (gpu.vendor === 'amd') {
    pytorch = t('PyTorch 2.4+ (ROCm build)', 'PyTorch 2.4+（ROCm 版本）');
  } else {
    const name = gpu.name.toLowerCase();
    if (name.includes('b200') || name.includes('b100') || name.includes('5090') || name.includes('blackwell')) {
      pytorch = t('PyTorch 2.6+ (torch.compile)', 'PyTorch 2.6+（torch.compile）');
    } else {
      pytorch = t('PyTorch 2.4+ (torch.compile)', 'PyTorch 2.4+（torch.compile）');
    }
  }

  // ── Container ─────────────────────────────────────────────────────────────
  let container: string;
  if (gpu.vendor === 'apple') {
    container = t('N/A (native macOS)', '不适用（macOS 原生）');
  } else if (gpu.vendor === 'amd') {
    container = 'Docker + ROCm Container Toolkit';
  } else {
    container = t('Docker + NVIDIA Container Toolkit (nvidia-ctk)', 'Docker + NVIDIA Container Toolkit（nvidia-ctk）');
  }

  // ── Monitoring ────────────────────────────────────────────────────────────
  let monitoring: string;
  if (mode === 'train' || mode === 'finetune') {
    monitoring = 'DCGM + Prometheus + Grafana + W&B';
  } else if (gpu.vendor === 'apple') {
    monitoring = t('Activity Monitor + powermetrics', '活动监视器 + powermetrics');
  } else {
    monitoring = 'DCGM + Prometheus';
  }

  return { os, driver, cuda, pytorch, container, monitoring };
}
