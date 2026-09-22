import React, { useState, useEffect } from 'react';
import { AdminApi } from '../api/client';
import { Product, Category } from '../types';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { formatCents } from '../utils/format';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  ArchiveRestore,
  AlertOctagon,
  Upload,
  Image as ImageIcon,
  Sparkles,
  X,
  FileText,
  PlusCircle,
  Smartphone,
  Truck,
  Eye,
  ShieldCheck,
  Share2,
  ArrowLeft,
  Heart,
  MessageCircle,
  ShoppingBag
} from 'lucide-react';

export const Products: React.FC = () => {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ON_SALE' | 'OFF_SALE' | 'DELETED'

  // Edit/Create Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingDetail, setUploadingDetail] = useState(false);
  const [detailUrlInput, setDetailUrlInput] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const coverInputRef = React.useRef<HTMLInputElement>(null);
  const detailInputRef = React.useRef<HTMLInputElement>(null);

  // Preview Modal State
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  const [formData, setFormData] = useState<any>({
    name: '',
    subtitle: '',
    description: '',
    brand: '',
    category: '',
    categoryId: '',
    cover: '',
    minPrice: '',
    maxPrice: '',
    totalStock: 100,
    tags: ['新品'],
    deliveryTypes: ['DELIVERY'],
    detailImages: []
  });

  const currentUser = AdminApi.getCurrentUser();

  const loadCategories = async () => {
    try {
      const list = await AdminApi.getCategories();
      setCategories(Array.isArray(list) ? list : []);
    } catch (err: any) {
      setCategories([]);
      toast(err?.message || '加载分类失败，请检查云端连接', 'error');
    }
  };

  const loadProducts = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (statusFilter !== 'ALL') filters.status = statusFilter;
      if (categoryFilter) filters.categoryId = categoryFilter;
      if (searchKeyword.trim()) filters.keyword = searchKeyword.trim();
      const list = await AdminApi.getProducts(filters);
      setProducts(list);
    } catch (err: any) {
      console.error('[loadProducts] Error:', err);
      toast(err.message || '加载商品列表失败，请检查云端连接', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadProducts();
  }, [statusFilter, categoryFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadProducts();
  };

  const handleToggleStatus = async (product: Product) => {
    const nextStatus = product.status === 'ON_SALE' ? 'OFF_SALE' : 'ON_SALE';
    await AdminApi.updateProductStatus(product.id, nextStatus);
    toast(`商品 [${product.name}] 已${nextStatus === 'ON_SALE' ? '上架发布' : '下架停售'}`, 'success');
    await loadProducts();
  };

  const handleSoftDelete = async (product: Product) => {
    if (!window.confirm(`确定将商品 [${product.name}] 移入回收站软删除吗？(历史订单数据将完整保留)`)) return;
    try {
      await AdminApi.softDeleteProduct(product.id);
      toast(`商品 [${product.name}] 已移入回收站软删除`, 'info');
      await loadProducts();
    } catch (e: any) {
      toast(e.message || '操作失败', 'error');
    }
  };

  const handleRestore = async (product: Product) => {
    try {
      await AdminApi.restoreProduct(product.id);
      toast(`商品 [${product.name}] 已从回收站恢复`, 'success');
      await loadProducts();
    } catch (e: any) {
      toast(e.message || '恢复失败', 'error');
    }
  };

  const handlePurge = async (product: Product) => {
    if (!window.confirm(`【高危物理清除】确定彻底删除商品 [${product.name}] 吗？此操作不可逆！`)) return;
    try {
      await AdminApi.purgeProduct(product.id);
      toast('物理销毁成功，数据已彻底抹除', 'success');
      await loadProducts();
    } catch (e: any) {
      toast(e.message || '物理删除失败', 'error');
    }
  };

  const handleOpenCreateModal = () => {
    const defaultCat = categories.find(c => c.status === 'ACTIVE') || categories[0];
    setFormData({
      name: '',
      subtitle: '',
      description: '',
      brand: '',
      category: defaultCat?.name || '',
      categoryId: defaultCat?.id || '',
      cover: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800',
      minPrice: '',
      maxPrice: '',
      totalStock: 100,
      tags: ['新品', '热卖'],
      deliveryTypes: ['DELIVERY'],
      detailImages: []
    });
    setDetailUrlInput('');
    setNewTagInput('');
    setEditModalOpen(true);
  };

  const handleOpenEditModal = (p: Product) => {
    setFormData({
      ...p,
      name: p.name || p.title || '',
      subtitle: p.subtitle || '',
      description: p.description || '',
      tags: p.tags && p.tags.length > 0 ? p.tags : ['新品'],
      detailImages: p.detailImages && p.detailImages.length > 0 ? p.detailImages : (p.images && p.images.length > 0 ? p.images : (p.cover ? [p.cover] : [])),
      minPrice: (p.minPrice !== undefined && p.minPrice !== null) ? Number((p.minPrice / 100).toFixed(2)) : '',
      maxPrice: (p.maxPrice !== undefined && p.maxPrice !== null) ? Number((p.maxPrice / 100).toFixed(2)) : '',
      totalStock: (p.totalStock !== undefined && p.totalStock !== null) ? p.totalStock : '',
      deliveryTypes: p.deliveryTypes && p.deliveryTypes.length > 0 ? p.deliveryTypes : ['DELIVERY']
    });
    setDetailUrlInput('');
    setNewTagInput('');
    setEditModalOpen(true);
  };

  const handleApplyTemplate = () => {
    setFormData(prev => ({
      ...prev,
      subtitle: prev.subtitle?.trim() || '经典款 / 优质材质 / 潮流穿搭必备',
      tags: prev.tags && prev.tags.length > 0
        ? Array.from(new Set([...prev.tags, '爆款推荐', '潮流百搭', '正品保障']))
        : ['爆款推荐', '经典复刻', '潮流百搭', '正品保障'],
      description: prev.description?.trim() ? prev.description : `【商品详情档案】
• 设计理念：主打实用百搭，精选优质材质，做工精细、经久耐用。
• 使用体验：注重使用舒适度，兼顾日常通勤与多种使用场景需求。
• 品质保障：严格品控、做工扎实，耐磨耐用，性价比高。
• 搭配建议：适合多种风格穿搭，轻松驾驭休闲、通勤与日常场合。
• 保养指南：请使用专业清洁剂轻柔打理，避免阳光暴晒及潮湿存放。`,
      detailImages: (prev.detailImages && prev.detailImages.length > 0)
        ? prev.detailImages
        : [
            prev.cover || 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800',
            'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800',
            'https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?w=800'
          ]
    }));
    toast('已成功套用商品详情模板！您可以按需微调修改', 'success');
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      toast('正在上传封面图至云端存储...', 'info');
      const url = await AdminApi.uploadProductImage(file);
      setFormData(prev => ({ ...prev, cover: url }));
      toast('封面图上传成功！', 'success');
    } catch (err: any) {
      toast(err?.message || '封面图上传失败', 'error');
    } finally {
      setUploadingCover(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleDetailImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingDetail(true);
    try {
      toast(`正在上传 ${files.length} 张详情图至云端...`, 'info');
      const newUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const url = await AdminApi.uploadProductImage(files[i]);
        if (url) newUrls.push(url);
      }
      setFormData(prev => ({
        ...prev,
        detailImages: [...(prev.detailImages || []), ...newUrls]
      }));
      toast(`成功上传 ${newUrls.length} 张详情图！`, 'success');
    } catch (err: any) {
      toast(err?.message || '详情图上传失败', 'error');
    } finally {
      setUploadingDetail(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleAddDetailUrl = () => {
    if (!detailUrlInput.trim()) return;
    setFormData(prev => ({
      ...prev,
      detailImages: [...(prev.detailImages || []), detailUrlInput.trim()]
    }));
    setDetailUrlInput('');
  };

  const handleRemoveDetailImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      detailImages: (prev.detailImages || []).filter((_, i) => i !== index)
    }));
  };

  const handleAddTag = () => {
    if (!newTagInput.trim()) return;
    const tag = newTagInput.trim();
    if (!formData.tags?.includes(tag)) {
      setFormData(prev => ({ ...prev, tags: [...(prev.tags || []), tag] }));
    }
    setNewTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: (prev.tags || []).filter(t => t !== tagToRemove)
    }));
  };

  const handleSaveProductForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) {
      toast('【必填项未填写】请输入商品主标题/名称', 'error');
      return;
    }
    if (!formData.subtitle?.trim()) {
      toast('【必填项未填写】请输入商品副标题/卖点介绍', 'error');
      return;
    }
    if (!formData.categoryId || !categories.some(category => category.id === formData.categoryId)) {
      toast('【必填项未填写】请选择商品所属品类', 'error');
      return;
    }
    if (formData.minPrice === '' || formData.minPrice === null || formData.minPrice === undefined || isNaN(Number(formData.minPrice)) || Number(formData.minPrice) <= 0) {
      toast('【必填项未填写】请输入有效的基准售价（必须大于0元，支持0.01元等测试金额）', 'error');
      return;
    }
    if (formData.totalStock === '' || formData.totalStock === null || formData.totalStock === undefined || isNaN(Number(formData.totalStock)) || Number(formData.totalStock) < 0) {
      toast('【必填项未填写】请输入有效的初始库存数量（不能为负数）', 'error');
      return;
    }
    if (!formData.cover?.trim()) {
      toast('【必填项未填写】请上传或填写商品封面主图', 'error');
      return;
    }
    if (!formData.deliveryTypes || formData.deliveryTypes.length === 0) {
      toast('【必填项未填写】请至少勾选配送方式（顺丰快递包邮）', 'error');
      return;
    }

    const priceInCents = Math.round(Number(formData.minPrice) * 100);
    try {
      const saved = await AdminApi.saveProduct({
        ...formData,
        name: formData.name.trim(),
        title: formData.name.trim(),
        subtitle: formData.subtitle.trim(),
        minPrice: priceInCents,
        maxPrice: priceInCents,
        price: priceInCents,
        totalStock: Number(formData.totalStock),
        deliveryTypes: formData.deliveryTypes,
        images: formData.detailImages && formData.detailImages.length > 0 ? formData.detailImages : [formData.cover || ''],
        detailImages: formData.detailImages || []
      });

      // 商家提交 → 生成审核工单，不直接上架
      if (saved?.pending) {
        toast(`商品 [${formData.name}] 已提交审核工单，等待平台审核后上架`, 'success');
        setEditModalOpen(false);
        await loadProducts();
        return;
      }

      toast(`商品 [${formData.name}] 保存成功`, 'success');
      setEditModalOpen(false);
      await loadProducts();
    } catch (err: any) {
      toast(err.message || '保存失败', 'error');
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
            商品库 · Products
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', marginTop: '4px' }}>
            支持上架/下架、软删除及高危物理清除。
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
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
            gap: '8px',
            boxShadow: '0 4px 10px rgba(255, 85, 0, 0.25)'
          }}
        >
          <Plus size={18} />
          <span>新增商品</span>
        </button>
      </div>

      {/* 商家审核提示 */}
      {currentUser?.role === 'MERCHANT' && (
        <div
          style={{
            backgroundColor: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: '12px',
            padding: '12px 16px',
            fontSize: '13px',
            color: '#1E40AF',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <ShieldCheck size={18} color="#2563EB" />
          <span>新增或修改商品需提交审核工单，平台审核通过后自动上架。可在「商品审核工单」查看进度。</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          padding: '16px 20px',
          border: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap'
        }}
      >
        <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '11px' }} />
            <input
              type="text"
              placeholder="搜索商品名称、品牌..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '13px'
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              padding: '9px 16px',
              backgroundColor: '#0F172A',
              color: '#FFF',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            搜索
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              padding: '9px 12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '13px',
              color: '#334155'
            }}
          >
            <option value="">全部分类</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Status Tabs */}
          <div style={{ display: 'flex', backgroundColor: '#F1F5F9', borderRadius: '8px', padding: '3px' }}>
            {[
              { label: '全部', value: 'ALL' },
              { label: '在售中', value: 'ON_SALE' },
              { label: '已下架', value: 'OFF_SALE' },
              { label: '回收站', value: 'DELETED' }
            ].map(tab => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: statusFilter === tab.value ? '#FFFFFF' : 'transparent',
                  color: statusFilter === tab.value ? '#0F172A' : '#64748B',
                  boxShadow: statusFilter === tab.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
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
              <th style={{ padding: '14px 18px' }}>商品信息</th>
              <th style={{ padding: '14px 18px' }}>品牌 / 分类</th>
              <th style={{ padding: '14px 18px' }}>价格区间</th>
              <th style={{ padding: '14px 18px' }}>总物理库存</th>
              <th style={{ padding: '14px 18px' }}>销量</th>
              <th style={{ padding: '14px 18px' }}>状态</th>
              <th style={{ padding: '14px 18px', textAlign: 'right' }}>操作管理</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: '#94A3B8' }}>
                  暂无匹配的商品数据
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  {/* Info */}
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <img
                        src={p.cover}
                        alt={p.name}
                        style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover' }}
                      />
                      <div>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{p.name}</div>
                        <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                          {p.tags?.map(t => (
                            <span
                              key={t}
                              style={{
                                fontSize: '10px',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                backgroundColor: '#F1F5F9',
                                color: '#475569'
                              }}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Brand/Cat */}
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ fontWeight: 600, color: '#1E293B' }}>{p.brand}</div>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>{p.category}</div>
                  </td>

                  {/* Price */}
                  <td style={{ padding: '14px 18px', fontWeight: 700, color: '#FF5500' }}>
                    {formatCents(p.minPrice)} {p.maxPrice > p.minPrice && `~ ${formatCents(p.maxPrice)}`}
                    {currentUser?.role === 'SUPER_ADMIN' && (p.platformFee || 0) > 0 && (
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500, marginTop: '2px' }}>
                        抽成 {formatCents(p.platformFee)}/件 · 买家实付 {formatCents((p.minPrice || 0) + (p.platformFee || 0))}
                      </div>
                    )}
                  </td>

                  {/* Stock */}
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{ fontWeight: 600, color: p.totalStock < 30 ? '#EF4444' : '#0F172A' }}>
                      {p.totalStock} 件
                    </span>
                  </td>

                  {/* Sales */}
                  <td style={{ padding: '14px 18px', color: '#64748B' }}>
                    {p.sales} 件
                  </td>

                  {/* Status */}
                  <td style={{ padding: '14px 18px' }}>
                    <Badge status={p.status} />
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                      {p.status !== 'DELETED' ? (
                        <>
                          <button
                            onClick={() => handleOpenEditModal(p)}
                            title="编辑商品"
                            style={{
                              padding: '6px 10px',
                              borderRadius: '6px',
                              border: '1px solid #CBD5E1',
                              backgroundColor: '#FFF',
                              color: '#334155',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            <Edit2 size={14} />
                          </button>

                          <button
                            onClick={() => handleToggleStatus(p)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: '6px',
                              border: '1px solid #CBD5E1',
                              backgroundColor: '#FFF',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              color: p.status === 'ON_SALE' ? '#D97706' : '#059669'
                            }}
                          >
                            {p.status === 'ON_SALE' ? '下架' : '上架'}
                          </button>

                          <button
                            onClick={() => handleSoftDelete(p)}
                            title="软删除移入回收站"
                            style={{
                              padding: '6px',
                              borderRadius: '6px',
                              border: 'none',
                              backgroundColor: 'transparent',
                              color: '#EF4444',
                              cursor: 'pointer'
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleRestore(p)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              border: '1px solid #A7F3D0',
                              backgroundColor: '#ECFDF5',
                              color: '#059669',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <ArchiveRestore size={14} />
                            <span>恢复商品</span>
                          </button>

                          {currentUser?.role === 'SUPER_ADMIN' && (
                            <button
                              onClick={() => handlePurge(p)}
                              title="高危物理删除 (仅超管可用)"
                              style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: '1px solid #FECACA',
                                backgroundColor: '#FEF2F2',
                                color: '#DC2626',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <AlertOctagon size={14} />
                              <span>彻底清除</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit / Create Product Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={formData.id ? '编辑商品与详情页' : '发布全新商品'}
      >
        <form onSubmit={handleSaveProductForm} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 隐藏的本地图片上传 input */}
          <input
            type="file"
            ref={coverInputRef}
            style={{ display: 'none' }}
            accept="image/*"
            onChange={handleCoverUpload}
          />
          <input
            type="file"
            ref={detailInputRef}
            style={{ display: 'none' }}
            accept="image/*"
            multiple
            onChange={handleDetailImageUpload}
          />

          {/* 一键套用模板横幅 */}
          {/* 一键套用模板横幅与手机预览 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: 'linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%)',
              border: '1px solid #FED7AA',
              borderRadius: '10px'
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '13px', color: '#C2410C', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={16} /> 商品详情页一键套用与实时真机预览
              </div>
              <div style={{ fontSize: '12px', color: '#9A3412', marginTop: '2px' }}>
                自动预置副标题、详情设计文案、热卖标签与高清大图，可随时点击预览手机小程序效果
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setPreviewModalOpen(true)}
                style={{
                  padding: '7px 14px',
                  backgroundColor: '#0F172A',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 6px rgba(15, 23, 42, 0.25)'
                }}
              >
                <Smartphone size={14} />
                手机端详情预览
              </button>
              <button
                type="button"
                onClick={handleApplyTemplate}
                style={{
                  padding: '7px 14px',
                  backgroundColor: '#EA580C',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 6px rgba(234, 88, 12, 0.25)'
                }}
              >
                <Sparkles size={14} />
                套用商品模板
              </button>
            </div>
          </div>

          {/* 1. 基础信息 */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              商品主标题 / 商品名称 *
            </label>
            <input
              type="text"
              required
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="例如: 经典款商品"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '14px'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              商品副标题 / 核心卖点一句话 *
            </label>
            <input
              type="text"
              required
              value={formData.subtitle || ''}
              onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
              placeholder="例如: 经典款 · 潮流百搭 / 高性价比"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                所属品牌
              </label>
              <input
                type="text"
                value={formData.brand || ''}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                placeholder="例如: 品牌A / 品牌B"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '14px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                所属品类 *
              </label>
              <select
                value={formData.categoryId || ''}
                onChange={(e) => {
                  const catId = e.target.value;
                  const found = categories.find(c => c.id === catId);
                  setFormData({
                    ...formData,
                    categoryId: catId,
                    category: found ? found.name : formData.category
                  });
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '14px'
                }}
              >
                <option value="">请选择品类</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                基准售价 (¥) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="例如: 0.01 或 699"
                value={formData.minPrice === '' || formData.minPrice === undefined || formData.minPrice === null ? '' : formData.minPrice}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ ...formData, minPrice: val === '' ? '' : val });
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '14px'
                }}
              />
              <p style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                支持输入 0.01 元测试金额；可退格全部清空重新输入
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                初始总库存 (件) *
              </label>
              <input
                type="number"
                min="0"
                required
                placeholder="例如: 100"
                value={formData.totalStock === '' || formData.totalStock === undefined || formData.totalStock === null ? '' : formData.totalStock}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ ...formData, totalStock: val === '' ? '' : val });
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '14px'
                }}
              />
              <p style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                支持完全清空
              </p>
            </div>
          </div>

          {/* 配送方式选项配置 */}
          <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              配送服务与履约方式 * (可同时勾选，或自由切换勾选其中一种)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: formData.deliveryTypes?.includes('DELIVERY') ? '2px solid #FF5500' : '1px solid #CBD5E1',
                  backgroundColor: formData.deliveryTypes?.includes('DELIVERY') ? '#FFF7ED' : '#F8FAFC',
                  cursor: 'pointer'
                }}
              >
                <input
                  type="checkbox"
                  style={{ marginTop: '3px', cursor: 'pointer' }}
                  checked={formData.deliveryTypes?.includes('DELIVERY') || false}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    const cur = formData.deliveryTypes || [];
                    const next = checked ? Array.from(new Set([...cur, 'DELIVERY'])) : cur.filter((t: string) => t !== 'DELIVERY');
                    setFormData({ ...formData, deliveryTypes: next });
                  }}
                />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Truck size={15} color="#FF5500" /> 顺丰快递包邮
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                    承诺 48 小时内发货 · 顺丰极速空运
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* 2. 封面图（支持直接本地上传或输入URL） */}
          <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                商品封面主图 (支持本地文件直传 / 云端存储)
              </label>
              <button
                type="button"
                disabled={uploadingCover}
                onClick={() => coverInputRef.current?.click()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  backgroundColor: uploadingCover ? '#94A3B8' : '#0F172A',
                  color: '#FFF',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: uploadingCover ? 'not-allowed' : 'pointer'
                }}
              >
                <Upload size={13} />
                {uploadingCover ? '上传中...' : '本地上传封面图'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              {formData.cover ? (
                <div style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #CBD5E1', flexShrink: 0 }}>
                  <img src={formData.cover} alt="封面预览" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ) : (
                <div style={{ width: '80px', height: '80px', borderRadius: '8px', border: '1px dashed #CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '11px', flexShrink: 0 }}>
                  暂无封面
                </div>
              )}
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  value={formData.cover || ''}
                  onChange={(e) => setFormData({ ...formData, cover: e.target.value })}
                  placeholder="可点击右上方「本地上传封面图」，或粘贴图片直链 (https://...)"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px'
                  }}
                />
                <p style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>
                  建议尺寸：800x800 正方形，支持 JPG, PNG, WebP。点击按钮选择本地电脑图片即可自动上传。
                </p>
              </div>
            </div>
          </div>

          {/* 3. 详情页定制区 */}
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={16} color="#FF5500" />
              详情页专属排版与图文介绍
            </div>

            {/* 标签 */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                特色标签 (可点击快捷选用或自行添加)
              </label>
              {/* 快捷标签库 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {['爆款推荐', '经典复刻', '潮流百搭', '优质材质', '正品保障', '学生优惠', '联名限量', '高性价比'].map(tag => {
                  const isSelected = formData.tags?.includes(tag);
                  return (
                    <span
                      key={tag}
                      onClick={() => {
                        if (isSelected) handleRemoveTag(tag);
                        else setFormData({ ...formData, tags: [...(formData.tags || []), tag] });
                      }}
                      style={{
                        padding: '3px 9px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        backgroundColor: isSelected ? '#FF5500' : '#F1F5F9',
                        color: isSelected ? '#FFF' : '#475569',
                        transition: 'all 0.15s'
                      }}
                    >
                      {isSelected ? `✓ ${tag}` : `+ ${tag}`}
                    </span>
                  );
                })}
              </div>

              {/* 当前已有标签与输入 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                  placeholder="输入自定义标签后回车或点击添加..."
                  style={{
                    flex: 1,
                    padding: '7px 12px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px'
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  style={{
                    padding: '7px 14px',
                    backgroundColor: '#F1F5F9',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: '#334155'
                  }}
                >
                  添加
                </button>
              </div>

              {formData.tags && formData.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                  {formData.tags.map(t => (
                    <span
                      key={t}
                      style={{
                        padding: '3px 8px',
                        backgroundColor: '#FFF7ED',
                        color: '#EA580C',
                        border: '1px solid #FED7AA',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {t}
                      <X
                        size={12}
                        onClick={() => handleRemoveTag(t)}
                        style={{ cursor: 'pointer', strokeWidth: 2.5 }}
                      />
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 详情文案故事 */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                商品图文档案与详情故事 (Description)
              </label>
              <textarea
                rows={5}
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="输入商品背景、细节介绍、使用建议与保养指南..."
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* 详情图集 */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                  详情页轮播大图 / 图集 (可本地多选直传或粘贴链接)
                </label>
                <button
                  type="button"
                  disabled={uploadingDetail}
                  onClick={() => detailInputRef.current?.click()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '5px 12px',
                    backgroundColor: uploadingDetail ? '#94A3B8' : '#0F172A',
                    color: '#FFF',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: uploadingDetail ? 'not-allowed' : 'pointer'
                  }}
                >
                  <Upload size={13} />
                  {uploadingDetail ? '正在上传...' : '本地批量上传详情图'}
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <input
                  type="text"
                  value={detailUrlInput}
                  onChange={(e) => setDetailUrlInput(e.target.value)}
                  placeholder="或输入图片 URL 直链 (https://...)"
                  style={{
                    flex: 1,
                    padding: '7px 12px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px'
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddDetailUrl}
                  style={{
                    padding: '7px 14px',
                    backgroundColor: '#F1F5F9',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: '#334155'
                  }}
                >
                  添加链接
                </button>
              </div>

              {/* 详情图画廊缩略图 */}
              {formData.detailImages && formData.detailImages.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '10px' }}>
                  {formData.detailImages.map((imgUrl, idx) => (
                    <div
                      key={idx}
                      style={{
                        position: 'relative',
                        width: '100%',
                        paddingBottom: '100%',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#F8FAFC'
                      }}
                    >
                      <img
                        src={imgUrl}
                        alt={`详情图${idx + 1}`}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveDetailImage(idx)}
                        style={{
                          position: 'absolute',
                          top: '4px',
                          right: '4px',
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          backgroundColor: 'rgba(0,0,0,0.6)',
                          color: '#FFF',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', borderTop: '1px solid #E2E8F0', paddingTop: '14px' }}>
            <button
              type="button"
              onClick={() => setPreviewModalOpen(true)}
              style={{
                padding: '9px 16px',
                borderRadius: '8px',
                border: '1px solid #0F172A',
                backgroundColor: '#0F172A',
                color: '#FFF',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Smartphone size={15} />
              <span>📱 手机详情页实时预览</span>
            </button>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFF',
                  color: '#475569',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                取消
              </button>
              <button
                type="submit"
                style={{
                  padding: '9px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#FF5500',
                  color: '#FFF',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(255, 85, 0, 0.3)'
                }}
              >
                保存商品与详情
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* 手机端详情页实时真机预览 Modal */}
      <Modal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        title="📱 小程序端商品详情页 · 实时真机预览"
        width="460px"
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
          {/* 手机外壳 */}
          <div
            style={{
              width: '375px',
              backgroundColor: '#0F172A',
              borderRadius: '44px',
              padding: '12px',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35)',
              position: 'relative'
            }}
          >
            {/* 手机屏幕 */}
            <div
              style={{
                width: '100%',
                maxHeight: '680px',
                height: '680px',
                backgroundColor: '#F8FAFC',
                borderRadius: '34px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative'
              }}
            >
              {/* 顶部状态栏 */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  padding: '10px 20px 6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#0F172A',
                  position: 'relative',
                  zIndex: 10
                }}
              >
                <span>09:41</span>
                {/* 灵动岛 / 听筒孔 */}
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '8px',
                    transform: 'translateX(-50%)',
                    width: '85px',
                    height: '20px',
                    backgroundColor: '#000',
                    borderRadius: '20px'
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                  <span>5G</span>
                  <span>100%</span>
                </div>
              </div>

              {/* 微信小程序自定义导航栏 */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  padding: '8px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid #F1F5F9'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#1E293B', fontSize: '13px', fontWeight: 600 }}>
                  <ArrowLeft size={16} />
                  <span>商品详情</span>
                </div>
                {/* 胶囊按钮模拟 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '3px 10px',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    fontSize: '11px',
                    color: '#475569',
                    backgroundColor: '#FFF'
                  }}
                >
                  <span>•••</span>
                  <span style={{ width: '1px', height: '10px', backgroundColor: '#CBD5E1' }} />
                  <span>◎</span>
                </div>
              </div>

              {/* 页面可滚动内容区域 */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  paddingBottom: '20px'
                }}
              >
                {/* 封面大图 */}
                <div style={{ width: '100%', height: '280px', backgroundColor: '#F1F5F9', position: 'relative' }}>
                  <img
                    src={formData.cover || 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800'}
                    alt="商品主图"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '10px',
                      left: '12px',
                      backgroundColor: 'rgba(0,0,0,0.6)',
                      color: '#FFF',
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: '12px'
                    }}
                  >
                    1 / {1 + (formData.detailImages?.length || 0)}
                  </div>
                </div>

                {/* 核心价格与标题卡片 */}
                <div style={{ backgroundColor: '#FFFFFF', padding: '14px 16px', borderRadius: '12px', margin: '0 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#FF5500' }}>¥</span>
                    <span style={{ fontSize: '24px', fontWeight: 900, color: '#FF5500', letterSpacing: '-0.5px' }}>
                      {formData.minPrice !== '' && formData.minPrice !== undefined ? formData.minPrice : '0.00'}
                    </span>
                    <span style={{ fontSize: '11px', color: '#94A3B8', textDecoration: 'line-through', marginLeft: '6px' }}>
                      ¥{((Number(formData.minPrice) || 699) * 1.4).toFixed(0)}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#059669', backgroundColor: '#ECFDF5', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                      全网正品保障
                    </span>
                  </div>

                  {/* 主标题 */}
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginTop: '10px', lineHeight: '1.4' }}>
                    {formData.name || '【未命名商品主标题】'}
                  </div>

                  {/* 副标题 */}
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px', lineHeight: '1.4' }}>
                    {formData.subtitle || '【未填写副标题卖点，建议一键套用商品模板】'}
                  </div>

                  {/* 特色标签 */}
                  {formData.tags && formData.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '10px' }}>
                      {formData.tags.map((t: string) => (
                        <span
                          key={t}
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: '4px',
                            backgroundColor: '#FFF7ED',
                            color: '#EA580C',
                            border: '1px solid #FED7AA'
                          }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 配送服务选项卡片 */}
                <div style={{ backgroundColor: '#FFFFFF', padding: '12px 16px', borderRadius: '12px', margin: '0 8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                    配送方式
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(!formData.deliveryTypes || formData.deliveryTypes.includes('DELIVERY')) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0F172A' }}>
                        <Truck size={14} color="#FF5500" />
                        <span style={{ fontWeight: 600 }}>顺丰快递包邮</span>
                        <span style={{ fontSize: '11px', color: '#94A3B8', marginLeft: 'auto' }}>承诺48小时内发货</span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #F1F5F9', fontSize: '10px', color: '#64748B' }}>
                    <span>✓ 正品防伪双重鉴别</span>
                    <span>✓ 7天无理由退换</span>
                  </div>
                </div>

                {/* 图文档案详情介绍 */}
                <div style={{ backgroundColor: '#FFFFFF', padding: '14px 16px', borderRadius: '12px', margin: '0 8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileText size={14} color="#FF5500" />
                    商品图文档案
                  </div>
                  <div style={{ fontSize: '11px', color: '#475569', lineHeight: '1.7', whiteSpace: 'pre-line' }}>
                    {formData.description || '暂未填写商品图文档案与详情故事。可点击上方「套用商品模板」一键生成灵感文案！'}
                  </div>
                </div>

                {/* 详情图画廊长图流 */}
                {formData.detailImages && formData.detailImages.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '0 8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', padding: '0 4px' }}>
                      详情画廊实拍展示 ({formData.detailImages.length}张)
                    </div>
                    {formData.detailImages.map((imgUrl: string, idx: number) => (
                      <img
                        key={idx}
                        src={imgUrl}
                        alt={`详情实拍${idx + 1}`}
                        style={{ width: '100%', borderRadius: '8px', objectFit: 'cover' }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* 底部悬浮购买栏 */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  padding: '8px 12px 12px',
                  borderTop: '1px solid #F1F5F9',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', gap: '12px', padding: '0 6px', color: '#64748B' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '9px' }}>
                    <MessageCircle size={15} />
                    <span>客服</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '9px' }}>
                    <Heart size={15} />
                    <span>收藏</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '9px' }}>
                    <ShoppingBag size={15} />
                    <span>加购</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flex: 1 }}>
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      padding: '9px 0',
                      backgroundColor: '#FFEDD5',
                      color: '#EA580C',
                      border: 'none',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: 700
                    }}
                  >
                    加入购物车
                  </button>
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      padding: '9px 0',
                      backgroundColor: '#FF5500',
                      color: '#FFF',
                      border: 'none',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: 700
                    }}
                  >
                    立即购买
                  </button>
                </div>
              </div>

              {/* 底部 Home 横条 */}
              <div
                style={{
                  height: '14px',
                  backgroundColor: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <div style={{ width: '100px', height: '3px', backgroundColor: '#000', borderRadius: '3px' }} />
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
