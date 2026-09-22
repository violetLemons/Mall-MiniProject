import React, { useState, useEffect } from 'react';
import { AdminApi } from '../api/client';
import { AdminUser, AdminRole } from '../types';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { ShieldCheck, Plus, UserCheck, Lock } from 'lucide-react';

const ROLE_PERMISSIONS: Record<AdminRole, string[]> = {
  SUPER_ADMIN: ['*'],
  OPERATOR: [
    'product.view', 'product.create', 'product.update', 'product.status', 'product.delete',
    'order.view', 'order.ship', 'order.cancel',
    'category.manage', 'banner.manage', 'inventory.view'
  ],
  WAREHOUSE: ['inventory.view', 'inventory.update', 'order.ship'],
  MERCHANT: [
    'product.view', 'product.create', 'product.update', 'product.status', 'product.delete',
    'order.view', 'order.ship', 'inventory.view', 'inventory.update'
  ]
};

export const Admins: React.FC = () => {
  const { toast } = useToast();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<AdminUser>>({
    username: '',
    name: '',
    role: 'OPERATOR',
    merchantId: ''
  });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [subMchId, setSubMchId] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const list = await AdminApi.getAdmins();
      setAdmins(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCreate = () => {
    setFormData({
      username: '',
      name: '',
      role: 'OPERATOR',
      merchantId: ''
    });
    setPassword('');
    setConfirmPassword('');
    setSubMchId('');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.username?.trim() || !formData.name?.trim()) {
      toast('请输入登录账号与真实姓名', 'error');
      return;
    }
    if (!password || password.length < 8) {
      toast('密码长度不得少于 8 位字符', 'error');
      return;
    }
    if (password !== confirmPassword) {
      toast('两次输入的密码不一致，请核对', 'error');
      return;
    }

    const role = formData.role || 'OPERATOR';
    if (role === 'MERCHANT' && !formData.merchantId?.trim()) {
      toast('创建商家账号必须填写商家 ID (merchantId)', 'error');
      return;
    }
    if (role === 'MERCHANT' && subMchId.trim() && !/^\d{8,32}$/.test(subMchId.trim())) {
      toast('商户号格式不正确（需为 8-32 位数字）', 'error');
      return;
    }

    try {
      await AdminApi.saveAdmin({
        ...formData,
        merchantId: role === 'MERCHANT' ? (formData.merchantId || '').trim() : null,
        subMchId: role === 'MERCHANT' ? subMchId.trim() : '',
        password,
        permissions: ROLE_PERMISSIONS[role]
      } as any);
      toast(`管理员 [@${formData.username}] 开通成功`, 'success');
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      toast(err.message || '开通失败', 'error');
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
            管理员权限中心 · Admins
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', marginTop: '4px' }}>
            仅系统超级管理员 (SUPER_ADMIN) 具备访问权限；密码采用 10,000 次 PBKDF2-SHA512 盐化存储。
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          style={{
            padding: '10px 20px',
            backgroundColor: '#0F172A',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: 700,
            color: '#FFFFFF',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Plus size={18} color="#FF5500" />
          <span>开通管理员账号</span>
        </button>
      </div>

      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            <tr style={{ color: '#64748B' }}>
              <th style={{ padding: '14px 18px' }}>用户名 / 真实姓名</th>
              <th style={{ padding: '14px 18px' }}>系统角色</th>
              <th style={{ padding: '14px 18px' }}>权限集 (Permissions)</th>
              <th style={{ padding: '14px 18px' }}>状态</th>
              <th style={{ padding: '14px 18px' }}>最近登录时间</th>
              <th style={{ padding: '14px 18px' }}>创建时间</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((adm) => (
              <tr key={adm.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ padding: '14px 18px' }}>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{adm.name}</div>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>@{adm.username}</div>
                </td>
                <td style={{ padding: '14px 18px' }}>
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      backgroundColor: adm.role === 'SUPER_ADMIN' ? '#FFF0EB' : adm.role === 'MERCHANT' ? '#EFF6FF' : '#F1F5F9',
                      color: adm.role === 'SUPER_ADMIN' ? '#FF5500' : adm.role === 'MERCHANT' ? '#2563EB' : '#334155'
                    }}
                  >
                    {adm.role === 'SUPER_ADMIN' ? '超级管理员' : adm.role === 'MERCHANT' ? '商家' : adm.role === 'WAREHOUSE' ? '仓库专员' : '运营人员'}
                  </span>
                  {adm.role === 'MERCHANT' && (
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                      商家ID: {adm.merchantId || '—'}
                      {adm.subMchIdMask && <span style={{ marginLeft: '8px' }}>商户号: {adm.subMchIdMask}</span>}
                    </div>
                  )}
                </td>
                <td style={{ padding: '14px 18px' }}>
                  <code style={{ fontSize: '11px', backgroundColor: '#F8FAFC', padding: '2px 6px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                    {adm.permissions.join(', ')}
                  </code>
                </td>
                <td style={{ padding: '14px 18px' }}>
                  <Badge status={adm.status} />
                </td>
                <td style={{ padding: '14px 18px', color: '#64748B' }}>
                  {adm.lastLoginAt || '未登录'}
                </td>
                <td style={{ padding: '14px 18px', color: '#94A3B8' }}>
                  {adm.createdAt}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="开通后台管理员">
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              登录账号 (Username)
            </label>
            <input
              type="text"
              required
              value={formData.username || ''}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="例如: warehouse_manager"
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              真实姓名 / 负责岗位
            </label>
            <input
              type="text"
              required
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="例如: 张仓库主管"
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              权限角色 (Role)
            </label>
            <select
              value={formData.role || 'OPERATOR'}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as AdminRole })}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
            >
              <option value="OPERATOR">普通运营人员 (商品与订单读写)</option>
              <option value="WAREHOUSE">仓库专员 (仅库存管理)</option>
              <option value="MERCHANT">商家 (仅管理本商家商品/订单/库存)</option>
              <option value="SUPER_ADMIN">超级管理员 (拥有全部权限与物理清除权)</option>
            </select>
          </div>

          {formData.role === 'MERCHANT' && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                商家 ID (merchantId)
              </label>
              <input
                type="text"
                value={formData.merchantId || ''}
                onChange={(e) => setFormData({ ...formData, merchantId: e.target.value })}
                placeholder="例如: m1 / merchant_001"
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
              />
              <p style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
                该商家账号登录后仅能查看与操作 merchantId 对应的商品、订单与库存。
              </p>
            </div>
          )}

          {formData.role === 'MERCHANT' && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                微信支付商户号 (sub_mch_id，可选)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={subMchId}
                onChange={(e) => setSubMchId(e.target.value)}
                placeholder="8-32 位数字，用于后续分账结算"
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
              />
              <p style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
                数据库仅存 AES-256-GCM 密文，商家也可在「商户设置」中自行填写。
              </p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                登录初始密码 (至少 8 位)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 8 位安全密码"
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                确认登录密码
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入确认"
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
              />
            </div>
          </div>

          <div style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', borderRadius: '8px', fontSize: '12px', color: '#64748B' }}>
            管理员账号遵循高等级安全合规：密码经 10,000 次 PBKDF2-SHA512 盐化加密存储，禁止明文留存。
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFF', color: '#475569', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
            >
              取消
            </button>
            <button
              type="submit"
              style={{ padding: '9px 24px', borderRadius: '8px', border: 'none', backgroundColor: '#0F172A', color: '#FFF', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
            >
              确认开通
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
