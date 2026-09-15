/**
 * 降噪实验室 EQ 生成器（纯查表法）
 * 
 * 设计原则：
 * - 每个场景有 3 个环境档位（quiet / moderate / loud），共 12 条固定曲线
 * - quiet: 环境安静 (<40dB)，低频补偿弱，保持通透感
 * - moderate: 环境中等 (40-65dB)，原始预设值作为基线
 * - loud: 环境嘈杂 (>65dB)，低频全力衰减以抵消掩蔽效应
 * 
 * 频率段对应 Experiment BANDS（32Hz / 64Hz / 125Hz / 250Hz / 500Hz / 1kHz / 2kHz / 4kHz）
 */

// ─── EQ 表：4 场景 × 3 档位 = 12 条曲线 ──────────────────

const EQ_TABLE: Record<string, { quiet: number[]; moderate: number[]; loud: number[] }> = {
  commute: {
    // 通勤（交通噪音）—— 低频掩蔽效应最强，需深度衰减抵消
    quiet:   [-10, -5, -2, 0, +3, +2, -2, -6],
    moderate:[-18, -12, -5, 0, +3, +2, -3, -9],
    loud:    [-24, -18, -8, 0, +3, +2, -6, -15],
  },
  office: {
    // 办公室 —— 安静环境为主，人声清晰度优先，整体温和
    quiet:   [-5, -3, -1, 0, +2, +1, -4, -8],
    moderate:[-8, -5, -3, 0, +2, +1, -6, -12],
    loud:    [-12, -8, -5, 0, +3, +2, -9, -18],
  },
  social: {
    // 社交（人群嘈杂）—— 全力增强中频人声区，衰减环境嘶声
    quiet:   [-3, -1, +1, +4, +7, +6, -2, -10],
    moderate:[-5, -3, 0, +3, +6, +5, -3, -15],
    loud:    [-8, -5, -2, +2, +5, +4, -6, -20],
  },
  outdoor: {
    // 户外（风噪）—— 全频段衰减为主，低频最深以应对风噪能量集中区
    quiet:   [-12, -8, -4, -1, 0, -1, -6, -12],
    moderate:[-20, -15, -8, -3, 0, -2, -9, -18],
    loud:    [-24, -20, -12, -6, -2, -5, -15, -24],
  },
};

// ─── 档位选择逻辑 ──────────────────────────────

const QUIET_THRESHOLD = 40; // dB，低于此值 → quiet 档
const LOUD_THRESHOLD  = 65; // dB，高于此值 → loud 档

type IntensityLevel = 'quiet' | 'moderate' | 'loud';

function getIntensityLevel(db: number): IntensityLevel {
  if (db < QUIET_THRESHOLD) return 'quiet';
  if (db > LOUD_THRESHOLD) return 'loud';
  return 'moderate';
}

// ─── 主函数：根据场景 + 环境 dB 生成 EQ 值 ──────────────

/**
 * 动态生成 8 段 EQ 增益值
 * @param sceneType 场景类型（commute / office / social / outdoor）
 * @param ambientDB 当前环境分贝值。如果为 null（麦克风未采集），按 moderate 档处理
 * @returns 8 个 dB 增益值的数组，每个值在 -24 ~ +6 范围内
 */
export function generateEQ(sceneType: string, ambientDB: number | null): number[] {
  // fallback：没有环境数据时按 moderate 档处理
  const db = ambientDB ?? 50;

  const level = getIntensityLevel(db);
  const sceneTable = EQ_TABLE[sceneType];

  if (!sceneTable) {
    console.warn(`[EQGenerator] ⚠️ 未知场景类型: ${sceneType}，返回空数组`);
    return [];
  }

  // 深拷贝目标档位的曲线，避免外部修改污染原始数据
  const gains = [...sceneTable[level]];

  console.log(`[EQGenerator] 🎚️ ${sceneType} / ${level} (${db.toFixed(1)}dB) →`, gains);
  return gains;
}

// ─── 导出 EQ_TABLE 供调试/扩展使用 ──────────────────────

export { EQ_TABLE };
