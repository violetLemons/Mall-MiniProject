export function report(event: string, fields: Record<string, string | number> = {}): void {
  // Register these event names in the WeChat analysis console. Never report buyer identity/address.
  try { if (typeof wx.reportEvent === 'function') wx.reportEvent(event, fields); } catch (_) {}
}
export async function requirePrivacy(): Promise<void> {
  const api = wx as any;
  if (typeof api.requirePrivacyAuthorize !== 'function') throw new Error('请更新微信版本后使用此功能');
  await new Promise<void>((resolve,reject)=>api.requirePrivacyAuthorize({success:resolve,fail:()=>reject(new Error('请同意隐私保护指引后继续'))}));
}
export function openPrivacy(): void {
  const api=wx as any;
  if(typeof api.openPrivacyContract==='function')api.openPrivacyContract({fail:()=>wx.showToast({title:'请在微信后台配置隐私保护指引',icon:'none'})});
}
