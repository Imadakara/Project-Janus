import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

// Локальная мультиязычная embedding-модель (без внешнего API) — см. ТЗ "Гибридный
// диалоговый движок", подтверждённое решение: работает на 100% входящих сообщений
// (Слой 2 классифицирует intent до принятия решения об эскалации), поэтому важно, чтобы
// это было бесплатно и быстро на CPU. Первый вызов скачивает и кэширует веса модели
// (~470MB) — в контейнере имеет смысл прогреть кэш на старте, а не лениво на первом запросе.
const MODEL_NAME = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

export const EMBEDDING_DIMENSION = 384;

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL_NAME);
  }
  return extractorPromise;
}

export async function embedText(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

// Форматирует вектор для использования в raw SQL (`$queryRaw`/`$executeRaw`) —
// Prisma не понимает тип `vector` через обычный Client API.
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
