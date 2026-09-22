import React, { useState, useEffect, useRef } from 'react';
import { AdminApi } from '../api/client';
import { Category } from '../types';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { compressImage } from '../utils/image';
import { Plus, Edit2, Trash2, ImagePlus, Loader2 } from 'lucide-react';

export const Categories: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Category>>({
    name: '',
    icon: '',
    sort: 10
  });
  const [iconPreview, setIconPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const list = await AdminApi.getCategories();
      setCategories(Array.isArray(list) ? list : []);
    } catch (error: any) {
      setCategories([]);
      alert(error?.message || '加载分类失败，请检查云端连接');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCreate = () => {
    setFormData({ name: '', icon: '', sort: 10 });
    setIconPreview('');
    setModalOpen(true);
  };

  const handleOpenEdit = (c: Category) => {
    // icon 存 fileID（历史 emoji 或旧 https 直接回填）；iconPreview 用 https/emoji 预览
    setFormData({ ...c, icon: c.iconFileID || c.icon || '' });
    setIconPreview(c.icon || '');
    setModalOpen(true);
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const { fileID, url } = await AdminApi.uploadCategoryImage(compressed);
      setFormData(prev => ({ ...prev, icon: fileID || url }));
      setIconPreview(url);
    } catch (err: any) {
      alert(err?.message || '图片上传失败，请重试');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) return;
    if (!formData.icon?.trim()) {
      alert('请上传分类图片（或填写图片链接）');
      return;
    }
    // 只提交业务字段，避免把 productCount/createdAt/iconFileID 等非持久化字段写入数据库
    const payload: Partial<Category> = {
      id: formData.id,
      name: formData.name.trim(),
      icon: formData.icon,
      sort: Number(formData.sort) || 0
    };
    await AdminApi.saveCategory(payload);
    setModalOpen(false);
    await loadData();
  };

  const handleDelete = async (c: Category) => {
    if (!window.confirm(`确定删除分类 [${c.name}] 吗？`)) return;
    try {
      await AdminApi.deleteCategory(c.id);
      await loadData();
    } catch (e: any) {
      alert(e.message || '删除失败');
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
            类目中心 · Categories
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', marginTop: '4px' }}>
            维护小程序首页金刚区分类与二级导航品类树（严格防误删外键校验）。
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          style={{
            padding: '10px 20px',
            backgroundColor: '#FF5500',
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
          <Plus size={18} />
          <span>新增商品分类</span>
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
              <th style={{ padding: '14px 18px' }}>分类图标与名称</th>
              <th style={{ padding: '14px 18px' }}>展示排序权值</th>
              <th style={{ padding: '14px 18px' }}>关联在售商品</th>
              <th style={{ padding: '14px 18px' }}>状态</th>
              <th style={{ padding: '14px 18px', textAlign: 'right' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {c.icon?.startsWith('data:image') || c.icon?.startsWith('http') || c.icon?.startsWith('/') ? (
                      <img src={c.icon} alt={c.name} style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
                    ) : (
                      <span style={{ fontSize: '24px' }}>{c.icon || '🛍️'}</span>
                    )}
                    <span style={{ fontWeight: 700, color: '#0F172A', fontSize: '14px' }}>{c.name}</span>
                  </div>
                </td>
                <td style={{ padding: '14px 18px', fontWeight: 600, color: '#334155' }}>
                  {c.sort}
                </td>
                <td style={{ padding: '14px 18px', color: '#64748B' }}>
                  {c.productCount} 件
                </td>
                <td style={{ padding: '14px 18px' }}>
                  <Badge status={c.status} />
                </td>
                <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      onClick={() => handleOpenEdit(c)}
                      style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFF', cursor: 'pointer' }}
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(c)}
                      style={{ padding: '6px', borderRadius: '6px', border: 'none', backgroundColor: 'transparent', color: '#EF4444', cursor: 'pointer' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={formData.id ? '编辑分类' : '新建品类'}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              分类名称
            </label>
            <input
              type="text"
              required
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="例如: 热销商品"
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              分类图片
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '72px',
                  height: '72px',
                  borderRadius: '12px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#F8FAFC',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  flexShrink: 0
                }}
              >
                {iconPreview ? (
                  /^(https?:\/\/|cloud:\/\/|data:image\/|\/)/.test(iconPreview) ? (
                    <img src={iconPreview} alt="分类图片预览" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '28px' }}>{iconPreview}</span>
                  )
                ) : (
                  <ImagePlus size={28} color="#94A3B8" />
                )}
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFF',
                    color: '#334155',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: uploading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    opacity: uploading ? 0.6 : 1
                  }}
                >
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                  <span>{uploading ? '上传中...' : (iconPreview ? '更换图片' : '上传图片')}</span>
                </button>
                <span style={{ fontSize: '12px', color: '#94A3B8' }}>
                  建议透明 PNG 图标，上传后自动压缩至 240px
                </span>
              </div>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              图片链接 URL（可选，直接粘贴 https 链接）
            </label>
            <input
              type="text"
              value={typeof formData.icon === 'string' && formData.icon.startsWith('http') ? formData.icon : ''}
              onChange={(e) => {
                const v = e.target.value.trim();
                setFormData({ ...formData, icon: v });
                setIconPreview(v);
              }}
              placeholder="https://..."
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              排序权重 (数字越大越靠前)
            </label>
            <input
              type="number"
              value={formData.sort || 0}
              onChange={(e) => setFormData({ ...formData, sort: Number(e.target.value) })}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
            />
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
              style={{ padding: '9px 24px', borderRadius: '8px', border: 'none', backgroundColor: '#FF5500', color: '#FFF', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
            >
              保存分类
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
