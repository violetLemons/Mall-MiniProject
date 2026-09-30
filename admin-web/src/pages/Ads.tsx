import React, { useState, useEffect } from 'react';
import { AdminApi } from '../api/client';
import { AdConfig, AdStats } from '../types';
import { useToast } from '../components/Toast';
import { formatCents, centsToYuan, yuanToCents } from '../utils/format';
import { Clapperboard, Eye, Coins, Wallet, Save } from 'lucide-react';

export const Ads: React.FC = () => {
  const { toast } = useToast();
  const [stats, setStats] = useState<AdStats>({ totalCount: 0, totalRewarded: 0, todayCount: 0, todayRewarded: 0 });
  const [config, setConfig] = useState<AdConfig>({
    name: '看视频得购物额度',
    adUnitId: '',
    rewardAmount: 0,
    dailyLimit: 5,
    enabled: false
  });
  const [rewardYuan, setRewardYuan] = useState('0');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cfg, st] = await Promise.all([
        AdminApi.getAdConfig(),
        AdminApi.getAdStats().catch(() => null)
      ]);
      setConfig(cfg);
      setRewardYuan(String(centsToYuan(cfg.rewardAmount)));
      if (st) setStats(st);
    } catch (err: any) {
      toast(err.message || '广告配置加载失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const rewardAmount = yuanToCents(rewardYuan);
    if (!Number.isInteger(rewardAmount) || rewardAmount <= 0) {
      toast('单次奖励额度必须为正数（元）', 'error');
      return;
    }
    const dailyLimit = Number(config.dailyLimit);
    if (!Number.isInteger(dailyLimit) || dailyLimit < 1) {
      toast('每日上限必须为 >=1 的整数', 'error');
      return;
    }

    setSaving(true);
    try {
      const saved = await AdminApi.saveAdConfig({
        name: config.name,
        adUnitId: config.adUnitId,
        rewardAmount,
        dailyLimit,
        enabled: config.enabled
      });
      setConfig(saved);
      setRewardYuan(String(centsToYuan(saved.rewardAmount)));
      toast('广告配置已保存', 'success');
    } catch (err: any) {
      toast(err.message || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const statCards = [
    { label: '今日发放额度', value: formatCents(stats.todayRewarded), color: '#059669', bg: '#ECFDF5', icon: Coins },
    { label: '累计发放额度', value: formatCents(stats.totalRewarded), color: '#2563EB', bg: '#EFF6FF', icon: Wallet },
    { label: '累计观看次数', value: stats.totalCount.toLocaleString(), color: '#D97706', bg: '#FFFBEB', icon: Eye }
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
            广告管理 · Ads
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', marginTop: '4px' }}>
            配置激励视频广告位，用户观看后可获得购物额度；仅超级管理员 (SUPER_ADMIN) 可操作。
          </p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        {statCards.map(s => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '16px',
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
              }}
            >
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '12px',
                  backgroundColor: s.bg,
                  color: s.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Icon size={22} />
              </div>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
                  {s.value}
                </div>
                <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>{s.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 配置表单 */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          boxShadow: 'var(--shadow-sm)',
          padding: '24px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <Clapperboard size={20} color="#FF5500" />
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0 }}>广告位配置</h2>
        </div>

        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#94A3B8' }}>加载中...</div>
        ) : (
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                广告位名称
              </label>
              <input
                type="text"
                value={config.name}
                onChange={(e) => setConfig({ ...config, name: e.target.value })}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                微信广告位 ID (adUnitId)
              </label>
              <input
                type="text"
                value={config.adUnitId}
                onChange={(e) => setConfig({ ...config, adUnitId: e.target.value.trim() })}
                placeholder="例如: adunit-xxxxxxxxxxxxxxxx"
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
              />
              <p style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
                上线后（UV ≥ 500 开通流量主）在微信公众平台创建激励视频广告位后填写；未填时广告自动关闭。
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  单次奖励额度（元）
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={rewardYuan}
                  onChange={(e) => setRewardYuan(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  每人每日观看上限
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={config.dailyLimit}
                  onChange={(e) => setConfig({ ...config, dailyLimit: Number(e.target.value) })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
                />
              </div>
            </div>

            {/* 启用开关 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', backgroundColor: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>启用广告</div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  开启后小程序端「看广告得额度」入口才会展示并发放额度。
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfig({ ...config, enabled: !config.enabled })}
                style={{
                  width: '46px',
                  height: '26px',
                  borderRadius: '9999px',
                  border: 'none',
                  backgroundColor: config.enabled ? '#059669' : '#CBD5E1',
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                  flexShrink: 0
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: '3px',
                    left: config.enabled ? '23px' : '3px',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    backgroundColor: '#FFFFFF',
                    transition: 'left 0.15s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                  }}
                />
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#FF5500',
                  color: '#FFF',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Save size={16} />
                <span>{saving ? '保存中...' : '保存配置'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
