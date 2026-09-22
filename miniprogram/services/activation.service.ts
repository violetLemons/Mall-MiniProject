import { callCloud } from './cloud';

/**
 * 卡密兑换结果
 */
export interface ActivationRedeemResult {
  code: string;
  type: string;
  benefit: string;
  value: number;
}

export class ActivationService {
  /**
   * 卡密兑换 (调用 activation.redeem，服务端校验并原子认领)
   */
  static async redeem(code: string): Promise<ActivationRedeemResult> {
    return callCloud<ActivationRedeemResult>(
      'activation',
      'redeem',
      { code }
    );
  }
}
