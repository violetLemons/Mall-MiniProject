import React, { useState } from 'react';
import { AdminApi } from '../api/client';
import { useToast } from '../components/Toast';
import { Store, ShieldCheck, Save } from 'lucide-react';

export const MerchantSettings: React.FC = () => {
  const { toast } = useToast();
  const user = AdminApi.getCurrentUser();
  const [subMchId, setSubMchId] = useState('');
  const [currentMask, setCurrentMask] = useState(user?.subMchIdMask || '');
  const [saving, setSaving] = useState(false);

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

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '640px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
          商户设置 · Merchant Settings
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', marginTop: '4px' }}>
          配置本商家的微信支付商户号 (sub_mch_id)，用于后续分账结算；数据库仅存 AES-256-GCM 密文。
        </p>
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
