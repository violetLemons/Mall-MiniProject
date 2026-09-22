import React, { useState, useEffect, useRef } from 'react';
import { AdminApi } from '../api/client';
import { Banner } from '../types';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { compressImage } from '../utils/image';
import { Plus, Edit2, Trash2, Image as ImageIcon, LayoutGrid, Sliders, ImagePlus, Loader2 } from 'lucide-react';

const FALLBACK_BANNER_IMG = 'https://images.unsplash.com/photo-1556906781-9a412961c28c?w=1200';
const isValidImage = (v: string) => /^(https?:\/\/|cloud:\/\/|data:image\/|\/)/.test(v);

export const Banners: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'banners' | 'promoCards'>('banners');

  // 轮播图状态
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Banner>>({
    title: '',
    subtitle: '',
    imageUrl: '',
    badge: '开学特惠',
    linkUrl: '',
    targetUrl: '',
    sort: 10
  });
  const [bannerPreview, setBannerPreview] = useState('');
  const [bannerUploading, setBannerUploading] = useState(false);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);

  // 潮流活动专区 4 格卡片状态
  const [promoCards, setPromoCards] = useState<any[]>([]);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [selectedPromo, setSelectedPromo] = useState<any>(null);
  const [promoImageUrl, setPromoImageUrl] = useState('');
  const [promoTitle, setPromoTitle] = useState('');
  const [promoDesc, setPromoDesc] = useState('');
  const [promoTag, setPromoTag] = useState('');
  const [promoPreview, setPromoPreview] = useState('');
  const [promoUploading, setPromoUploading] = useState(false);
  const promoFileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const list = await AdminApi.getBanners();
      setBanners(list);
    } finally {
      setLoading(false);
    }
  };

  const loadPromoData = async () => {
    setPromoLoading(true);
    try {
      const list = await AdminApi.getPromoCards();
      setPromoCards(list);
    } catch (err: any) {
      console.error('加载潮流专区卡片失败', err);
    } finally {
      setPromoLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // [隐藏] 潮流活动专区 4 格卡片已下线，暂停加载；如需恢复取消注释
    // loadPromoData();
  }, []);

  const handleOpenCreate = () => {
    setFormData({
      title: '',
      subtitle: '',
      imageUrl: '',
      badge: '特惠',
      linkUrl: '/pages/goods/list?tag=校园特惠',
      targetUrl: '/pages/goods/list?tag=校园特惠',
      sort: 10
    });
    setBannerPreview('');
    setModalOpen(true);
  };

  const handleOpenEdit = (b: Banner) => {
    // imageUrl 存 fileID（云文件）；bannerPreview 用 https/云临时链接预览
    setFormData({
      ...b,
      imageUrl: b.imageFileID || b.imageUrl || '',
      linkUrl: b.targetUrl || b.linkUrl || '',
      targetUrl: b.targetUrl || b.linkUrl || ''
    });
    setBannerPreview(b.imageUrl || '');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title?.trim()) {
      toast('请输入轮播主标题', 'error');
      return;
    }
    if (!formData.imageUrl?.trim()) {
      toast('请上传轮播图片（或填写图片链接）', 'error');
      return;
    }
    if (!isValidImage(formData.imageUrl)) {
      toast('图片地址需为 https:// 链接或已上传的云文件', 'error');
      return;
    }
    try {
      await AdminApi.saveBanner({
        ...formData,
        targetUrl: formData.targetUrl || formData.linkUrl || ''
      });
      toast(`轮播 [${formData.title}] 保存成功`, 'success');
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      toast(err.message || '保存失败', 'error');
    }
  };

  const handleDelete = async (b: Banner) => {
    if (!window.confirm(`确定下线并删除轮播 [${b.title}] 吗？`)) return;
    try {
      await AdminApi.deleteBanner(b.id);
      toast(`轮播 [${b.title}] 已删除`, 'info');
      await loadData();
    } catch (e: any) {
      toast(e.message || '删除失败', 'error');
    }
  };

  const handleBannerImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerUploading(true);
    try {
      const compressed = await compressImage(file, 750, 'image/jpeg');
      const { fileID, url } = await AdminApi.uploadBannerImage(compressed);
      setFormData(prev => ({ ...prev, imageUrl: fileID || url }));
      setBannerPreview(url);
    } catch (err: any) {
      toast(err?.message || '图片上传失败，请重试', 'error');
    } finally {
      setBannerUploading(false);
      if (bannerFileInputRef.current) bannerFileInputRef.current.value = '';
    }
  };

  const handlePromoImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPromoUploading(true);
    try {
      const compressed = await compressImage(file, 400, 'image/jpeg');
      const { fileID, url } = await AdminApi.uploadBannerImage(compressed);
      setPromoImageUrl(fileID || url);
      setPromoPreview(url);
    } catch (err: any) {
      toast(err?.message || '图片上传失败，请重试', 'error');
    } finally {
      setPromoUploading(false);
      if (promoFileInputRef.current) promoFileInputRef.current.value = '';
    }
  };

  const handleOpenEditPromo = (card: any) => {
    setSelectedPromo(card);
    setPromoImageUrl(card.imageFileID || card.imageUrl || '');
    setPromoPreview(card.imageUrl || '');
    setPromoTitle(card.title || '');
    setPromoDesc(card.desc || '');
    setPromoTag(card.tag || '');
    setPromoModalOpen(true);
  };

  const handleSavePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoImageUrl.trim()) {
      toast('请上传卡片图片（或填写图片链接）', 'error');
      return;
    }
    if (!isValidImage(promoImageUrl)) {
      toast('图片地址需为 https:// 链接或已上传的云文件', 'error');
      return;
    }
    try {
      await AdminApi.updatePromoCard({
        key: selectedPromo.key || selectedPromo.id,
        imageUrl: promoImageUrl.trim(),
        title: promoTitle.trim(),
        desc: promoDesc.trim(),
        tag: promoTag.trim()
      });
      toast(`专区卡片 [${promoTitle || selectedPromo.title}] 更新成功`, 'success');
      setPromoModalOpen(false);
      await loadPromoData();
    } catch (err: any) {
      toast(err.message || '更新专区卡片失败', 'error');
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 顶部标题与功能切换 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
            轮播与专区营销 · Marketing
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', marginTop: '4px' }}>
            管理小程序首页顶部轮播广告大图。
          </p>
        </div>

        {activeTab === 'banners' && (
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
            <span>新增轮播活动位</span>
          </button>
        )}
      </div>

      {/* 标签栏 Tabs */}
      <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid #E2E8F0', paddingBottom: '2px' }}>
        <button
          onClick={() => setActiveTab('banners')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '8px 8px 0 0',
            border: 'none',
            background: activeTab === 'banners' ? '#FFFFFF' : 'transparent',
            color: activeTab === 'banners' ? '#FF5500' : '#64748B',
            fontWeight: activeTab === 'banners' ? 700 : 500,
            fontSize: '14px',
            cursor: 'pointer',
            borderBottom: activeTab === 'banners' ? '2px solid #FF5500' : '2px solid transparent'
          }}
        >
          <Sliders size={16} />
          <span>首页顶部轮播图 ({banners.length})</span>
        </button>

        {/* [隐藏] 潮流活动专区 tab 已下线，如需恢复请将下方 false 改为 true */}
        {false && (
          <button
            onClick={() => setActiveTab('promoCards')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: '8px 8px 0 0',
              border: 'none',
              background: activeTab === 'promoCards' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'promoCards' ? '#FF5500' : '#64748B',
              fontWeight: activeTab === 'promoCards' ? 700 : 500,
              fontSize: '14px',
              cursor: 'pointer',
              borderBottom: activeTab === 'promoCards' ? '2px solid #FF5500' : '2px solid transparent'
            }}
          >
            <LayoutGrid size={16} />
            <span>潮流活动专区 4 格卡片 ({promoCards.length || 4})</span>
          </button>
        )}
      </div>

      {/* Tab 1: 首页轮播图 */}
      {activeTab === 'banners' && (
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
                <th style={{ padding: '14px 18px' }}>活动大图预览</th>
                <th style={{ padding: '14px 18px' }}>标题与副标题</th>
                <th style={{ padding: '14px 18px' }}>营销角标</th>
                <th style={{ padding: '14px 18px' }}>跳转路径</th>
                <th style={{ padding: '14px 18px' }}>排序</th>
                <th style={{ padding: '14px 18px' }}>状态</th>
                <th style={{ padding: '14px 18px', textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {banners.map((b) => (
                <tr key={b.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '14px 18px' }}>
                    <img
                      src={b.imageUrl}
                      alt={b.title}
                      onError={(e) => { e.currentTarget.src = FALLBACK_BANNER_IMG; }}
                      style={{ width: '100px', height: '48px', borderRadius: '8px', objectFit: 'cover' }}
                    />
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ fontWeight: 700, color: '#0F172A' }}>{b.title}</div>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>{b.subtitle}</div>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#FFF0EB', color: '#FF5500', fontWeight: 600 }}>
                      {b.badge}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px', color: '#64748B', fontFamily: 'monospace' }}>
                    {b.linkUrl || '默认首页'}
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: 600, color: '#334155' }}>
                    {b.sort}
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <Badge status={b.status} />
                  </td>
                  <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                      <button
                        onClick={() => handleOpenEdit(b)}
                        style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFF', cursor: 'pointer' }}
                        title="编辑轮播"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(b)}
                        style={{ padding: '6px', borderRadius: '6px', border: 'none', backgroundColor: 'transparent', color: '#EF4444', cursor: 'pointer' }}
                        title="删除轮播"
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
      )}

      {/* Tab 2: 潮流活动专区 4 格卡片 */}
      {activeTab === 'promoCards' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              backgroundColor: '#FFF7ED',
              border: '1px solid #FFEDD5',
              padding: '14px 18px',
              borderRadius: '12px',
              fontSize: '13px',
              color: '#9A3412',
              lineHeight: 1.6
            }}
          >
            📌 <strong>说明</strong>：微信小程序首页【ZONE 潮流活动专区】为 4 个展示型功能卡片（点击无跳转反应）。
            您可以在此处随时更换各卡片的<strong>配图 URL</strong>及说明文字，修改后小程序前端刷新即可同步展示。
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '16px'
            }}
          >
            {promoCards.map((card, idx) => (
              <div
                key={card.id || card.key || idx}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1px solid #E2E8F0',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#FFFFFF',
                        backgroundColor: idx === 0 ? '#FF5500' : idx === 1 ? '#E53935' : idx === 2 ? '#2979FF' : '#111111',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        marginBottom: '6px'
                      }}
                    >
                      {card.tag}
                    </span>
                    <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                      {card.title}
                    </h3>
                    <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0 0' }}>
                      {card.desc}
                    </p>
                  </div>

                  <img
                    src={card.imageUrl}
                    alt={card.title}
                    onError={(e) => { e.currentTarget.src = FALLBACK_BANNER_IMG; }}
                    style={{
                      width: '80px',
                      height: '80px',
                      borderRadius: '12px',
                      objectFit: 'cover',
                      border: '1px solid #E2E8F0',
                      flexShrink: 0
                    }}
                  />
                </div>

                <div
                  style={{
                    paddingTop: '12px',
                    borderTop: '1px solid #F1F5F9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                    无跳转展示卡片
                  </span>
                  <button
                    onClick={() => handleOpenEditPromo(card)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      border: '1px solid #FF5500',
                      backgroundColor: '#FFF5F0',
                      color: '#FF5500',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <ImageIcon size={14} />
                    <span>更换图片 / 编辑</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 模态框: 首页轮播图编辑/新建 */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={formData.id ? '编辑轮播' : '新建活动轮播'}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              主标题
            </label>
            <input
              type="text"
              required
              value={formData.title || ''}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="例如: 校园新学期 · 潮流运动特辑"
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              副标题描述
            </label>
            <input
              type="text"
              value={formData.subtitle || ''}
              onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
              placeholder="例如: 全场精选好物 限时领券立减 80 元"
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              轮播大图
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '160px',
                  height: '77px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#F8FAFC',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  flexShrink: 0
                }}
              >
                {bannerPreview ? (
                  <img
                    src={bannerPreview}
                    alt="轮播图预览"
                    onError={(e) => { e.currentTarget.src = FALLBACK_BANNER_IMG; }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <ImagePlus size={28} color="#94A3B8" />
                )}
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  ref={bannerFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleBannerImageChange}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => bannerFileInputRef.current?.click()}
                  disabled={bannerUploading}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFF',
                    color: '#334155',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: bannerUploading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    opacity: bannerUploading ? 0.6 : 1
                  }}
                >
                  {bannerUploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                  <span>{bannerUploading ? '上传中...' : (bannerPreview ? '更换图片' : '上传图片')}</span>
                </button>
                <span style={{ fontSize: '12px', color: '#94A3B8' }}>
                  建议 750x360 比例横幅，上传后自动压缩为 JPEG
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
              value={typeof formData.imageUrl === 'string' && formData.imageUrl.startsWith('http') ? formData.imageUrl : ''}
              onChange={(e) => {
                const v = e.target.value.trim();
                setFormData({ ...formData, imageUrl: v });
                setBannerPreview(v);
              }}
              placeholder="https://..."
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                角标文案
              </label>
              <input
                type="text"
                value={formData.badge || '特惠'}
                onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                排序权重
              </label>
              <input
                type="number"
                value={formData.sort || 0}
                onChange={(e) => setFormData({ ...formData, sort: Number(e.target.value) })}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              小程序页面跳转链接 (Path)
            </label>
            <input
              type="text"
              value={formData.linkUrl || ''}
              onChange={(e) => setFormData({ ...formData, linkUrl: e.target.value })}
              placeholder="/pages/goods/list?tag=校园特惠"
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
              保存轮播
            </button>
          </div>
        </form>
      </Modal>

      {/* 模态框: 潮流活动专区 4 格卡片图片与文案更换 */}
      <Modal
        isOpen={promoModalOpen}
        onClose={() => setPromoModalOpen(false)}
        title={`更换专区卡片配图 · [${selectedPromo?.title || ''}]`}
      >
        <form onSubmit={handleSavePromo} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              卡片配图
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '80px',
                  height: '80px',
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
                {promoPreview ? (
                  <img
                    src={promoPreview}
                    alt="卡片配图预览"
                    onError={(e) => { e.currentTarget.src = FALLBACK_BANNER_IMG; }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <ImagePlus size={28} color="#94A3B8" />
                )}
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  ref={promoFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePromoImageChange}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => promoFileInputRef.current?.click()}
                  disabled={promoUploading}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFF',
                    color: '#334155',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: promoUploading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    opacity: promoUploading ? 0.6 : 1
                  }}
                >
                  {promoUploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                  <span>{promoUploading ? '上传中...' : (promoPreview ? '更换图片' : '上传图片')}</span>
                </button>
                <span style={{ fontSize: '12px', color: '#94A3B8' }}>
                  建议 1:1 正方形图片，上传后自动压缩为 JPEG
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
              value={typeof promoImageUrl === 'string' && promoImageUrl.startsWith('http') ? promoImageUrl : ''}
              onChange={(e) => {
                const v = e.target.value.trim();
                setPromoImageUrl(v);
                setPromoPreview(v);
              }}
              placeholder="https://..."
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                卡片主标题
              </label>
              <input
                type="text"
                required
                value={promoTitle}
                onChange={(e) => setPromoTitle(e.target.value)}
                placeholder="例如: 全场包邮"
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                卡片标签 (Tag)
              </label>
              <input
                type="text"
                value={promoTag}
                onChange={(e) => setPromoTag(e.target.value)}
                placeholder="例如: 配送服务"
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              副标题描述
            </label>
            <input
              type="text"
              value={promoDesc}
              onChange={(e) => setPromoDesc(e.target.value)}
              placeholder="例如: 极速空运实时查询"
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={() => setPromoModalOpen(false)}
              style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFF', color: '#475569', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
            >
              取消
            </button>
            <button
              type="submit"
              style={{ padding: '9px 24px', borderRadius: '8px', border: 'none', backgroundColor: '#FF5500', color: '#FFF', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
            >
              保存配图与内容
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
