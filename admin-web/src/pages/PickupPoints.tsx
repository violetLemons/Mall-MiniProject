import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Plus,
  Edit2,
  Trash2,
  Clock,
  Phone,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw
} from 'lucide-react';
import { AdminApi } from '../api/client';
import { useToast } from '../components/Toast';

interface PickupPointItem {
  id: string;
  _id?: string;
  name: string;
  address: string;
  hours: string;
  phone?: string;
  status: 'ACTIVE' | 'DISABLED';
}

export const PickupPoints: React.FC = () => {
  const { toast } = useToast();
  const [points, setPoints] = useState<PickupPointItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchKey, setSearchKey] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingPoint, setEditingPoint] = useState<PickupPointItem | null>(null);
  const [form, setForm] = useState({
    name: '',
    address: '',
    hours: '09:00 - 22:00',
    phone: '',
    status: 'ACTIVE' as 'ACTIVE' | 'DISABLED'
  });

  const loadPoints = async () => {
    setLoading(true);
    try {
      const list = await AdminApi.getPickupPoints();
      setPoints(list || []);
    } catch (err: any) {
      toast(err.message || '加载自提点列表失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPoints();
  }, []);

  const handleOpenCreate = () => {
    setEditingPoint(null);
    setForm({
      name: '',
      address: '',
      hours: '09:00 - 22:00',
      phone: '',
      status: 'ACTIVE'
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (p: PickupPointItem) => {
    setEditingPoint(p);
    setForm({
      name: p.name,
      address: p.address,
      hours: p.hours || '09:00 - 22:00',
      phone: p.phone || '',
      status: p.status
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast('请输入自提点名称', 'error');
      return;
    }
    if (!form.address.trim()) {
      toast('请输入自提点详细地址', 'error');
      return;
    }
    try {
      await AdminApi.savePickupPoint({
        id: editingPoint ? editingPoint.id : undefined,
        name: form.name.trim(),
        address: form.address.trim(),
        hours: form.hours.trim() || '09:00 - 22:00',
        phone: form.phone.trim(),
        status: form.status
      });
      toast(editingPoint ? '自提点修改成功' : '新增自提点成功', 'success');
      setModalOpen(false);
      loadPoints();
    } catch (err: any) {
      toast(err.message || '保存失败', 'error');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`确定要删除自提点 [${name}] 吗？用户将无法再选择该门店自提。`)) return;
    try {
      await AdminApi.deletePickupPoint(id);
      toast(`已成功删除自提点 [${name}]`, 'success');
      loadPoints();
    } catch (err: any) {
      toast(err.message || '删除失败', 'error');
    }
  };

  const handleToggleStatus = async (p: PickupPointItem) => {
    const nextStatus = p.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      await AdminApi.savePickupPoint({
        id: p.id,
        name: p.name,
        address: p.address,
        hours: p.hours,
        phone: p.phone,
        status: nextStatus
      });
      toast(`自提点已切换为 [${nextStatus === 'ACTIVE' ? '营业中' : '已暂停营业'}]`, 'success');
      loadPoints();
    } catch (err: any) {
      toast(err.message || '状态切换失败', 'error');
    }
  };

  const filtered = points.filter(p =>
    p.name.toLowerCase().includes(searchKey.toLowerCase()) ||
    p.address.toLowerCase().includes(searchKey.toLowerCase())
  );

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
            自提门店管理 · Pickup Points
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', marginTop: '4px' }}>
            管理小程序用户在线下单时可选择的线下到店自提服务点，支持随时新增、调整或下架门店。
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={loadPoints}
            style={{
              padding: '10px 16px',
              backgroundColor: '#FFF',
              border: '1px solid #CBD5E1',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#334155',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <RefreshCw size={16} /> 刷新
          </button>
          <button
            onClick={handleOpenCreate}
            style={{
              padding: '10px 20px',
              backgroundColor: '#FF5500',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 700,
              color: '#FFF',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(255, 85, 0, 0.3)'
            }}
          >
            <Plus size={18} /> 新增自提门店
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#FFF', padding: '12px 18px', borderRadius: '12px', border: '1px solid #E2E8F0', maxWidth: '400px' }}>
        <Search size={18} color="#94A3B8" style={{ marginRight: '10px' }} />
        <input
          type="text"
          placeholder="搜索自提点名称、街道地址..."
          value={searchKey}
          onChange={(e) => setSearchKey(e.target.value)}
          style={{ border: 'none', outline: 'none', width: '100%', fontSize: '14px' }}
        />
      </div>

      {/* List / Table */}
      <div style={{ backgroundColor: '#FFF', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead>
            <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 600 }}>
              <th style={{ padding: '14px 20px' }}>门店名称</th>
              <th style={{ padding: '14px 20px' }}>详细地址</th>
              <th style={{ padding: '14px 20px' }}>营业时间</th>
              <th style={{ padding: '14px 20px' }}>联系电话</th>
              <th style={{ padding: '14px 20px' }}>状态</th>
              <th style={{ padding: '14px 20px', textAlign: 'right' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>
                  正在加载自提点数据...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '60px', textAlign: 'center', color: '#94A3B8' }}>
                  <MapPin size={36} color="#CBD5E1" style={{ margin: '0 auto 12px', display: 'block' }} />
                  暂无自提点数据，点击右上角即可创建首家自提点
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'rgba(255, 85, 0, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <MapPin size={18} color="#FF5500" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{item.name}</div>
                        <div style={{ fontSize: '12px', color: '#94A3B8' }}>ID: {item.id}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px', color: '#334155' }}>
                    {item.address}
                  </td>
                  <td style={{ padding: '16px 20px', color: '#475569' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={14} color="#64748B" />
                      {item.hours}
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px', color: '#475569' }}>
                    {item.phone ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Phone size={14} color="#64748B" />
                        {item.phone}
                      </div>
                    ) : (
                      <span style={{ color: '#CBD5E1' }}>-</span>
                    )}
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    {item.status === 'ACTIVE' ? (
                      <span
                        onClick={() => handleToggleStatus(item)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 10px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: 600,
                          backgroundColor: '#DCFCE7',
                          color: '#15803D',
                          cursor: 'pointer'
                        }}
                        title="点击可暂停营业"
                      >
                        <CheckCircle2 size={12} /> 营业中
                      </span>
                    ) : (
                      <span
                        onClick={() => handleToggleStatus(item)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 10px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: 600,
                          backgroundColor: '#F1F5F9',
                          color: '#64748B',
                          cursor: 'pointer'
                        }}
                        title="点击可恢复营业"
                      >
                        <XCircle size={12} /> 暂停营业
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => handleOpenEdit(item)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#F8FAFC',
                          border: '1px solid #CBD5E1',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#334155',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Edit2 size={13} /> 编辑
                      </button>
                      <button
                        onClick={() => handleDelete(item.id, item.name)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#FEF2F2',
                          border: '1px solid #FECACA',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#DC2626',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Trash2 size={13} /> 删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            backdropFilter: 'blur(4px)'
          }}
        >
          <div
            style={{
              backgroundColor: '#FFF',
              borderRadius: '16px',
              width: '520px',
              maxWidth: '90vw',
              padding: '28px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              animation: 'scaleUp 0.15s ease-out'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MapPin size={20} color="#FF5500" />
                {editingPoint ? '编辑自提门店' : '新增自提门店'}
              </div>
              <button
                onClick={() => setModalOpen(false)}
                style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: '#94A3B8' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  门店名称 *
                </label>
                <input
                  type="text"
                  required
                  placeholder="例如: 通用商城 旗舰自提站"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  详细地址 *
                </label>
                <input
                  type="text"
                  required
                  placeholder="例如: 深圳市南山区学苑大道1088号一楼"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    营业时间
                  </label>
                  <input
                    type="text"
                    placeholder="例如: 09:00 - 22:00"
                    value={form.hours}
                    onChange={(e) => setForm({ ...form, hours: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    联系电话
                  </label>
                  <input
                    type="text"
                    placeholder="例如: 13800000000"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  当前状态
                </label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
                >
                  <option value="ACTIVE">正常营业中 (小程序端可见可供自提)</option>
                  <option value="DISABLED">暂停营业 (小程序端不显示)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  style={{ padding: '10px 18px', backgroundColor: '#F1F5F9', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  style={{ padding: '10px 22px', backgroundColor: '#FF5500', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, color: '#FFF', cursor: 'pointer', boxShadow: '0 2px 8px rgba(255, 85, 0, 0.3)' }}
                >
                  确认保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
