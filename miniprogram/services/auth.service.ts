import { callCloud } from './cloud';

export interface UserProfile {
  _id?: string;
  _openid: string;
  userNo?: string;
  nickName: string;
  avatarUrl: string;
  phone?: string;
  status: 'ACTIVE' | 'FROZEN';
}

const STORAGE_USER_KEY = 'sneaker_mall_user';

export class AuthService {
  /**
   * 静默登录 / 自动获取身份 (自动获取/安排头像、昵称并随机分配用户ID)
   */
  static async login(extraParams: { nickName?: string; avatarUrl?: string } = {}): Promise<{ openid: string; user: UserProfile }> {
    const cached = wx.getStorageSync(STORAGE_USER_KEY);
    const params = {
      nickName: extraParams.nickName || cached?.user?.nickName || undefined,
      avatarUrl: extraParams.avatarUrl || cached?.user?.avatarUrl || undefined
    };
    const res = await callCloud<{ openid: string; user: UserProfile }>(
      'auth',
      'login',
      params
    );
    if (res && res.user) {
      wx.setStorageSync(STORAGE_USER_KEY, res);
    }
    return res;
  }

  /**
   * 自主更新用户头像与昵称
   */
  static async updateProfile(profile: { nickName?: string; avatarUrl?: string }): Promise<UserProfile> {
    const res = await callCloud<{ user: UserProfile }>('auth', 'updateProfile', profile);
    const cached = wx.getStorageSync(STORAGE_USER_KEY) || {};
    cached.user = { ...(cached.user || {}), ...(res.user || profile) };
    wx.setStorageSync(STORAGE_USER_KEY, cached);
    return cached.user;
  }

  /**
   * 获取当前缓存的用户信息
   */
  static getCurrentUser(): UserProfile | null {
    try {
      const data = wx.getStorageSync(STORAGE_USER_KEY);
      return data?.user || null;
    } catch {
      return null;
    }
  }
}
