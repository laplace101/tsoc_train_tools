import { t } from '@/lib/i18n';
/**
 * Training method memory formulas.
 * Each method has a different set of models loaded in memory and different
 * optimizer/gradient requirements.
 *
 * The `multiplier` field represents the theoretical N× factor (excluding activations),
 * e.g. PPO = 36N, DPO = 18N, full SFT = 16N.
 */

export type TrainingMethodId =
  | 'pretrain'
  | 'continued_pretrain'
  | 'sft_full'
  | 'sft_lora'
  | 'sft_qlora'
  | 'dpo'
  | 'grpo'
  | 'rlhf_ppo'
  | 'kto'
  | 'orpo'
  | 'distillation';

export interface TrainingMethodMemory {
  methodId: TrainingMethodId;
  totalGB: number;
  breakdown: {
    weightsGB: number;       // frozen/base weights
    gradientsGB: number;     // gradient storage
    optimizerGB: number;     // optimizer states
    activationsGB: number;   // activation memory
    extraModelsGB: number;   // reference/reward/critic models
  };
  multiplier: number;        // formula-only N× factor (excludes activations)
  note: string;
}

/**
 * Compute training memory for a given method.
 *
 * @param methodId - training method
 * @param numParams - total model parameters
 * @param trainableParams - trainable params (for LoRA/QLoRA)
 * @param activationsGB - activation memory from training.ts
 * @param bytesPerParam - base precision bytes per param (e.g. 2 for BF16)
 */
export function computeTrainingMethodMemory(
  methodId: TrainingMethodId,
  numParams: number,
  trainableParams: number,
  activationsGB: number,
  bytesPerParam: number
): TrainingMethodMemory {
  // Base model size in GB at given precision
  const baseGB = (numParams * bytesPerParam) / 1e9;
  // Full BF16/FP16 model size (2 bytes/param) — used for formula calculations
  const fp16GB = (numParams * 2) / 1e9;

  switch (methodId) {
    case 'pretrain':
    case 'continued_pretrain':
    case 'sft_full': {
      // 16 B/param: weights(2) + grads(2) + FP32 master(4) + Adam m(4) + Adam v(4)
      const weightsGB = fp16GB;
      const gradientsGB = fp16GB;
      const optimizerGB = (numParams * 12) / 1e9;
      const extraModelsGB = 0;
      const formulaGB = weightsGB + gradientsGB + optimizerGB + extraModelsGB;
      const totalGB = formulaGB + activationsGB;
      const multiplier = formulaGB / baseGB;
      return {
        methodId,
        totalGB,
        breakdown: { weightsGB, gradientsGB, optimizerGB, activationsGB, extraModelsGB },
        multiplier,
        note: '16 B/param: weights(2) + grads(2) + FP32 master+Adam(12)',
      };
    }

    case 'sft_lora': {
      // 2N frozen weights + 14 × N_trainable + activations
      const weightsGB = fp16GB;
      const gradientsGB = (trainableParams * 2) / 1e9;
      const optimizerGB = (trainableParams * 12) / 1e9;
      const extraModelsGB = 0;
      const formulaGB = weightsGB + gradientsGB + optimizerGB + extraModelsGB;
      const totalGB = formulaGB + activationsGB;
      const multiplier = formulaGB / baseGB;
      return {
        methodId,
        totalGB,
        breakdown: { weightsGB, gradientsGB, optimizerGB, activationsGB, extraModelsGB },
        multiplier,
        note: '2N frozen + 14 × N_trainable + activations',
      };
    }

    case 'sft_qlora': {
      // 0.5N NF4 base + 10 × N_trainable + activations
      const weightsGB = (numParams * 0.5) / 1e9;
      const gradientsGB = (trainableParams * 2) / 1e9;
      const optimizerGB = (trainableParams * 8) / 1e9;
      const extraModelsGB = 0;
      const formulaGB = weightsGB + gradientsGB + optimizerGB + extraModelsGB;
      const totalGB = formulaGB + activationsGB;
      const multiplier = formulaGB / baseGB;
      return {
        methodId,
        totalGB,
        breakdown: { weightsGB, gradientsGB, optimizerGB, activationsGB, extraModelsGB },
        multiplier,
        note: '0.5N NF4 + 10 × N_trainable + activations',
      };
    }

    case 'dpo': {
      // 18N: policy(16N) + reference(2N)
      const weightsGB = fp16GB;
      const gradientsGB = fp16GB;
      const optimizerGB = (numParams * 12) / 1e9;
      const extraModelsGB = fp16GB;
      const formulaGB = weightsGB + gradientsGB + optimizerGB + extraModelsGB;
      const totalGB = formulaGB + activationsGB;
      const multiplier = formulaGB / baseGB;
      return {
        methodId,
        totalGB,
        breakdown: { weightsGB, gradientsGB, optimizerGB, activationsGB, extraModelsGB },
        multiplier,
        note: '18N: policy(16N) + reference model(2N)',
      };
    }

    case 'grpo': {
      // 20N: policy(16N) + reference(2N) + reward(2N)
      const weightsGB = fp16GB;
      const gradientsGB = fp16GB;
      const optimizerGB = (numParams * 12) / 1e9;
      const extraModelsGB = fp16GB * 2;
      const formulaGB = weightsGB + gradientsGB + optimizerGB + extraModelsGB;
      const totalGB = formulaGB + activationsGB;
      const multiplier = formulaGB / baseGB;
      return {
        methodId,
        totalGB,
        breakdown: { weightsGB, gradientsGB, optimizerGB, activationsGB, extraModelsGB },
        multiplier,
        note: '20N: policy(16N) + reference(2N) + reward(2N)',
      };
    }

    case 'rlhf_ppo': {
      // 36N: actor(16N) + critic(16N) + reference(2N) + reward(2N)
      const weightsGB = fp16GB;
      const gradientsGB = fp16GB;
      const optimizerGB = (numParams * 12) / 1e9;
      // critic(16N) + reference(2N) + reward(2N) = 20N extra
      const extraModelsGB = fp16GB * 8 + fp16GB + fp16GB;
      const formulaGB = weightsGB + gradientsGB + optimizerGB + extraModelsGB;
      const totalGB = formulaGB + activationsGB;
      const multiplier = formulaGB / baseGB;
      return {
        methodId,
        totalGB,
        breakdown: { weightsGB, gradientsGB, optimizerGB, activationsGB, extraModelsGB },
        multiplier,
        note: '36N: actor(16N) + critic(16N) + reference(2N) + reward(2N)',
      };
    }

    case 'kto':
    case 'orpo': {
      // 16N: reference-free, single model
      const weightsGB = fp16GB;
      const gradientsGB = fp16GB;
      const optimizerGB = (numParams * 12) / 1e9;
      const extraModelsGB = 0;
      const formulaGB = weightsGB + gradientsGB + optimizerGB + extraModelsGB;
      const totalGB = formulaGB + activationsGB;
      const multiplier = formulaGB / baseGB;
      return {
        methodId,
        totalGB,
        breakdown: { weightsGB, gradientsGB, optimizerGB, activationsGB, extraModelsGB },
        multiplier,
        note: '16N: reference-free single model',
      };
    }

    case 'distillation': {
      // 16 × N_student + 2 × N_teacher (teacher is inference-only)
      const weightsGB = fp16GB;
      const gradientsGB = fp16GB;
      const optimizerGB = (numParams * 12) / 1e9;
      const extraModelsGB = fp16GB;
      const formulaGB = weightsGB + gradientsGB + optimizerGB + extraModelsGB;
      const totalGB = formulaGB + activationsGB;
      const multiplier = formulaGB / baseGB;
      return {
        methodId,
        totalGB,
        breakdown: { weightsGB, gradientsGB, optimizerGB, activationsGB, extraModelsGB },
        multiplier,
        note: '16 × N_student + 2 × N_teacher (teacher inference-only)',
      };
    }
  }
}

/** Human-readable labels for each training method */
export const TRAINING_METHOD_LABELS: Record<TrainingMethodId, string> = {
  get pretrain() { return t('Pre-training', '预训练'); },
  get continued_pretrain() { return t('Continued Pre-training', '继续预训练'); },
  get sft_full() { return t('SFT (Full)', 'SFT（全量）'); },
  get sft_lora() { return t('SFT (LoRA)', 'SFT（LoRA）'); },
  get sft_qlora() { return t('SFT (QLoRA)', 'SFT（QLoRA）'); },
  dpo: 'DPO',
  grpo: 'GRPO',
  rlhf_ppo: 'RLHF-PPO',
  kto: 'KTO',
  get orpo() { return t('ORPO / SimPO / CPO', 'ORPO / SimPO / CPO'); },
  get distillation() { return t('Distillation', '蒸馏'); },
};

/** Formula summary for display in picker */
export const TRAINING_METHOD_FORMULA: Record<TrainingMethodId, string> = {
  get pretrain() { return t('16 B/param — full weights', '16 字节/参数 —— 全量权重'); },
  get continued_pretrain() { return t('16 B/param — full weights', '16 字节/参数 —— 全量权重'); },
  get sft_full() { return t('16 B/param — full weights', '16 字节/参数 —— 全量权重'); },
  get sft_lora() { return t('2N frozen + 14 × N_trainable', '2N 冻结 + 14 × N 可训练'); },
  get sft_qlora() { return t('0.5N NF4 + 10 × N_trainable', '0.5N NF4 + 10 × N 可训练'); },
  get dpo() { return t('18N — policy + reference', '18N —— 策略 + 参考模型'); },
  get grpo() { return t('20N — policy + ref + reward', '20N —— 策略 + 参考 + 奖励模型'); },
  get rlhf_ppo() { return t('36N — actor + critic + ref + reward', '36N —— actor + critic + 参考 + 奖励模型'); },
  get kto() { return t('16N — reference-free', '16N —— 无需参考模型'); },
  get orpo() { return t('16N — reference-free', '16N —— 无需参考模型'); },
  get distillation() { return t('16N_student + 2N_teacher', '16N_学生 + 2N_教师'); },
};

/** Group methods by category */
export const TRAINING_METHOD_GROUPS = [
  {
    get label() { return t('Pre-training', '预训练'); },
    methods: ['pretrain', 'continued_pretrain'] as TrainingMethodId[],
  },
  {
    get label() { return t('Fine-tuning', '微调'); },
    methods: ['sft_full', 'sft_lora', 'sft_qlora'] as TrainingMethodId[],
  },
  {
    get label() { return t('Alignment', '对齐'); },
    methods: ['dpo', 'grpo', 'rlhf_ppo', 'kto', 'orpo'] as TrainingMethodId[],
  },
  {
    get label() { return t('Distillation', '蒸馏'); },
    methods: ['distillation'] as TrainingMethodId[],
  },
] as const;
