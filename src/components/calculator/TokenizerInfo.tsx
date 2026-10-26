import { cn } from '@/lib/utils';
import type { ModelSpec } from '@/lib/formulas/types';
import { computeEmbeddingVRAM, computeVocabPercent, getFertility } from '@/lib/formulas/tokenizer';
import { useLanguage } from '@/lib/language';
import { t } from '@/lib/i18n';

interface TokenizerInfoProps {
  model: ModelSpec;
  bytesPerParam: number;
  className?: string;
}

/** Infer tokenizer type from model family */
function getTokenizerType(model: ModelSpec): string {
  const family = model.family.toLowerCase();
  if (family === 'llama' || family === 'mistral' || family === 'phi' || family === 'qwen') {
    return t('BPE (tiktoken-style)', 'BPE（tiktoken 风格）');
  }
  if (family === 'gemma') {
    return 'SentencePiece';
  }
  if (family === 'deepseek') {
    return 'BPE';
  }
  return 'BPE';
}

export function TokenizerInfo({ model, bytesPerParam, className }: TokenizerInfoProps) {
  const { t } = useLanguage();
  const arch = model.architecture;
  const tokenizerType = getTokenizerType(model);

  const embeddingGB = computeEmbeddingVRAM(
    arch.vocabSize,
    arch.hiddenSize,
    bytesPerParam,
    arch.tieWordEmbeddings
  );

  const vocabPercent = computeVocabPercent(
    arch.vocabSize,
    arch.hiddenSize,
    model.paramsTotal
  );

  const fertilityEn = getFertility('en');

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span className="text-xs font-medium text-fg-default">{t('Tokenizer', '分词器')}</span>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
        <span className="text-fg-muted">{t('Type', '类型')}</span>
        <span className="font-mono text-fg-default text-right">{tokenizerType}</span>

        <span className="text-fg-muted">{t('Vocab size', '词表大小')}</span>
        <span className="font-mono text-fg-default text-right">{arch.vocabSize.toLocaleString()}</span>

        <span className="text-fg-muted">{t('Tied embeddings', '输入输出嵌入共享')}</span>
        <span className="font-mono text-fg-default text-right">{arch.tieWordEmbeddings ? t('Yes', '是') : t('No', '否')}</span>

        <span className="text-fg-muted">{t('Embedding VRAM', '嵌入层显存')}</span>
        <span className="font-mono text-fg-default text-right">{embeddingGB.toFixed(2)} GB</span>

        <span className="text-fg-muted">{t('Vocab % of params', '词表占参数比例')}</span>
        <span className={cn('font-mono text-right', vocabPercent > 20 ? 'text-yellow-500' : 'text-fg-default')}>
          {vocabPercent.toFixed(1)}%
        </span>

        <span className="text-fg-muted">{t('Fertility (EN)', '平均分词数（英文）')}</span>
        <span className="font-mono text-fg-default text-right">~{fertilityEn} tok/word</span>
      </div>

      {vocabPercent > 20 && (
        <p className="text-[10px] text-yellow-600 dark:text-yellow-400 italic">
          Large vocab: embedding layer is {vocabPercent.toFixed(0)}% of model params
        </p>
      )}

      <p className="text-[10px] text-fg-muted italic">
        {t('Larger vocab = bigger embedding layer but fewer tokens per document = faster processing per word', '词表越大 → 嵌入层越大，但每篇文档的 token 数更少 → 单位字词处理更快')}
      </p>
    </div>
  );
}
