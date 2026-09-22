/**
 * 系统与屏幕适配工具
 * 计算状态栏、胶囊位置与导航栏安全高度
 */

export interface SystemNavInfo {
  statusBarHeight: number;
  navBarHeight: number;
  menuButtonHeight: number;
  menuButtonTop: number;
  menuButtonLeft: number;
  menuButtonRight: number;
  capsuleTotalWidth: number;
  totalNavHeight: number;
  safeAreaBottom: number;
  windowWidth: number;
}

let cachedNavInfo: SystemNavInfo | null = null;

export function getSystemNavInfo(): SystemNavInfo {
  if (cachedNavInfo) {
    return cachedNavInfo;
  }

  let windowWidth = 375;
  let statusBarHeight = 20;
  let safeAreaBottom = 0;

  try {
    const windowInfo = (wx.getWindowInfo && typeof wx.getWindowInfo === 'function')
      ? wx.getWindowInfo()
      : (wx.getSystemInfoSync && typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : null);

    if (windowInfo) {
      windowWidth = windowInfo.windowWidth || 375;
      statusBarHeight = windowInfo.statusBarHeight || 20;
      const screenHeight = windowInfo.screenHeight || windowInfo.windowHeight || 667;
      const safeArea = windowInfo.safeArea;
      if (safeArea && typeof safeArea.bottom === 'number' && screenHeight) {
        safeAreaBottom = Math.max(screenHeight - safeArea.bottom, 0);
      }
    }
  } catch (e) {
    console.warn('getSystemNavInfo: getWindowInfo failed, using default', e);
  }

  // 确保所有关键数值均为有效正数，杜绝 NaN 与负数
  if (isNaN(safeAreaBottom) || safeAreaBottom < 0) safeAreaBottom = 0;
  if (isNaN(statusBarHeight) || statusBarHeight <= 0) statusBarHeight = 20;
  if (isNaN(windowWidth) || windowWidth <= 0) windowWidth = 375;

  // 获取胶囊按钮位置 (标准微信胶囊高 32px，宽 87px)
  let rect = {
    top: statusBarHeight + 6,
    height: 32,
    left: windowWidth - 94,
    right: windowWidth - 7,
    width: 87
  };

  try {
    if (wx.getMenuButtonBoundingClientRect && typeof wx.getMenuButtonBoundingClientRect === 'function') {
      const res = wx.getMenuButtonBoundingClientRect();
      if (res && typeof res.top === 'number' && res.top > 0 && typeof res.left === 'number' && res.left > 0) {
        rect = {
          top: res.top,
          height: res.height || 32,
          left: res.left,
          right: res.right || (res.left + (res.width || 87)),
          width: res.width || 87
        };
      }
    }
  } catch (e) {
    console.warn('getMenuButtonBoundingClientRect failed, using fallback', e);
  }

  // 胶囊按钮占据的总右侧宽度 (屏幕宽度 - 胶囊左边缘 + 少量安全内距)
  const capsuleTotalWidth = Math.max(windowWidth - rect.left + 8, 88);

  // 导航栏高度 = 胶囊按钮上下间距 * 2 + 胶囊高度 (标准微信通常 40-44px)
  const gap = Math.max(rect.top - statusBarHeight, 4);
  const navBarHeight = Math.max(gap * 2 + rect.height, 44);
  const totalNavHeight = statusBarHeight + navBarHeight;

  cachedNavInfo = {
    statusBarHeight,
    navBarHeight,
    menuButtonHeight: rect.height,
    menuButtonTop: rect.top,
    menuButtonLeft: rect.left,
    menuButtonRight: rect.right,
    capsuleTotalWidth,
    totalNavHeight,
    safeAreaBottom,
    windowWidth
  };

  return cachedNavInfo;
}
