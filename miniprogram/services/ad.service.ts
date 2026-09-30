import { callCloud } from './cloud';

/**
 * 看广告得购物额度（激励视频）
 */
export interface AdInfo {
  enabled: boolean;
  adUnitId: string;
  rewardAmount: number; // 单次奖励额度（分）
  dailyLimit: number;   // 每人每日观看上限
  remainingToday: number; // 今日剩余可观看次数
}

export interface AdRewardResult {
  rewardAmount: number; // 本次发放额度（分）
  balance: number;      // 发放后余额（分）
}

export class AdService {
  /**
   * 拉取广告位配置与今日剩余次数
   */
  static async getAdInfo(): Promise<AdInfo> {
    return callCloud<AdInfo>('ads', 'getAdInfo', {});
  }

  /**
   * 上报「已完整观看广告」，服务端事务原子发放额度并校验每日上限
   */
  static async reward(): Promise<AdRewardResult> {
    return callCloud<AdRewardResult>('ads', 'reward', {});
  }
}
