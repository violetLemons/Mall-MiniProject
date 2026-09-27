import React, { useState } from 'react';
import { AdminApi } from '../api/client';
import { useToast } from '../components/Toast';
import { Store, ShieldCheck, Save, MapPin } from 'lucide-react';

export const MerchantSettings: React.FC = () => {
  const { toast } = useToast();
  const user = AdminApi.getCurrentUser();
  const [subMchId, setSubMchId] = useState('');
  const [currentMask, setCurrentMask] = useState(user?.subMchIdMask || '');
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [address, setAddress] = useState(user?.address || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [profileSaving, setProfileSaving] = useState(false);

  if (user?.role !== 'MERCHANT') {
    return (
      <div className="animate-fade-in" style={{ padding: '48px', textAlign: 'center', color: '#94A3B8' }}>
        仅商家账号可访问商户设置
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = subMchId.trim();
    if (!/^\d{8,32}$/.test(val)) {
      toast('商户号格式不正确（需为 8-32 位数字）', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await AdminApi.setSubMchId(val);
      setCurrentMask(res.subMchIdMask);
      setSubMchId('');
      toast('商户号已加密保存', 'success');
    } catch (err: any) {
      toast(err.message || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameVal = name.trim();
    const addressVal = address.trim();
    const phoneVal = phone.trim();
    if (!nameVal && !addressVal && !phoneVal) {
      toast('名称、地址与手机号不能同时为空', 'error');
      return;
    }
    if (nameVal && (nameVal.length < 2 || nameVal.length > 64)) {
      toast('商户名称需为 2-64 个字符', 'error');
      return;
    }
    if (addressVal.length > 200) {
      toast('地址长度不能超过 200 字', 'error');
      return;
    }
    if (phoneVal && !/^1\d{10}$/.test(phoneVal)) {
      toast('手机号格式不正确（需为 11 位大陆手机号）', 'error');
      return;
    }
    setProfileSaving(true);
    try {
      const res = await AdminApi.updateMerchantProfile({ name: nameVal, address: addressVal, phone: phoneVal });
      const finalName = res.name || nameVal;
      const finalAddress = res.address || addressVal;
      const finalPhone = res.phone || phoneVal;
      AdminApi.updateCurrentUser({ name: finalName, address: finalAddress, phone: finalPhone });
      setName(finalName);
      setAddress(finalAddress);
      setPhone(finalPhone);
      toast('商户资料已保存', 'success');
    } catch (err: any) {
      toast(err.message || '保存失败', 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '640px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
          商户设置 · Merchant Settings
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', marginTop: '4px' }}>
          设置本商家的名称与地址（订单页展示名称、快递估算距离），以及微信支付商户号（用于分账结算，仅存密文）。
        </p>
      </div>

      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <MapPin size={18} color="#2563EB" />
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>商家信息</span>
        </div>
        <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 16px' }}>
          商户名称是独立字段、用于订单页面展示（不填则订单页显示「未命名商户」）；地址用于后续快递系统估算与用户距离以计算运费。
        </p>

        <form onSubmit={handleProfileSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              商户名称
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="请输入商户名称（2-64 字）"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              商户地址
            </label>
            <textarea
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="请输入商户地址（如：上海市浦东新区XX路XX号，用于快递距离估算）"
              rows={3}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px', resize: 'vertical', fontFamily: 'inherit' }}
            />
            <p style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
              最多 200 字。
            </p>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              绑定手机号
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="请输入 11 位大陆手机号（用于商户小程序一键登录）"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
            />
            <p style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
              须为商户本人微信绑定的手机号，商户小程序端据此校验身份。
            </p>
          </div>

          <div>
            <button
              type="submit"
              disabled={profileSaving}
              style={{
                padding: '10px 24px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: profileSaving ? '#94A3B8' : '#2563EB',
                color: '#FFF',
                fontSize: '14px',
                fontWeight: 600,
                cursor: profileSaving ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Save size={16} />
              {profileSaving ? '保存中...' : '保存商户资料'}
            </button>
          </div>
        </form>
      </div>

      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <Store size={18} color="#FF5500" />
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>商家身份</span>
        </div>
        <div style={{ fontSize: '13px', color: '#475569', marginBottom: '16px' }}>
          商家 ID：<code style={{ backgroundColor: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>{user.merchantId || '—'}</code>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', backgroundColor: '#F8FAFC', borderRadius: '10px', marginBottom: '20px' }}>
          <ShieldCheck size={18} color="#059669" />
          <div>
            <div style={{ fontSize: '12px', color: '#64748B' }}>当前商户号 (脱敏)</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', letterSpacing: '1px' }}>
              {currentMask || '未配置'}
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              商户号 (sub_mch_id)
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={subMchId}
              onChange={e => setSubMchId(e.target.value)}
              placeholder="请输入 8-32 位数字商户号"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px', letterSpacing: '1px' }}
            />
            <p style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
              保存后仅展示末 4 位（如 ****1234），完整商户号以 AES-256-GCM 密文存储，不可逆查明文。
            </p>
          </div>

          <div>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '10px 24px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: saving ? '#94A3B8' : '#0F172A',
                color: '#FFF',
                fontSize: '14px',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Save size={16} />
              {saving ? '保存中...' : '加密保存商户号'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
