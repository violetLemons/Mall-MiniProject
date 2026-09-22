import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingBag,
  Boxes,
  ClipboardList,
  Layers,
  Image as ImageIcon,
  ShieldCheck,
  FileText,
  LogOut,
  ExternalLink,
  Flame
} from 'lucide-react';
import { AdminApi } from '../api/client';

export const Layout: React.FC = () => {
  const navigate = useNavigate();
  const user = AdminApi.getCurrentUser();
  const [envInfo, setEnvInfo] = useState<{ env: string; label: string; isLocal: boolean; online: boolean }>({
    env: 'DETECTING',
    label: '正在探测服务环境...',
    isLocal: false,
    online: false
  });

  useEffect(() => {
    AdminApi.checkHealth().then(res => {
      if (res && res.env === 'LOCAL_SIMULATOR') {
        setEnvInfo({ env: 'LOCAL_SIMULATOR', label: '本地模拟环境', isLocal: true, online: true });
      } else {
        const isTest = res.appEnv === 'cloud-test';
        setEnvInfo({ env: res.env || 'CLOUDBASE', label: isTest ? 'CloudBase 测试环境' : 'CloudBase 云环境', isLocal: false, online: true });
      }
    }).catch(() => {
      setEnvInfo({ env: 'ERROR', label: '服务网关未连接', isLocal: false, online: false });
    });
  }, []);

  const handleLogout = async () => {
    await AdminApi.logout();
    navigate('/login');
  };

  const isMerchant = user?.role === 'MERCHANT';
  const navItems = isMerchant
    ? [
        { label: '运营大盘', path: '/', icon: LayoutDashboard },
        { label: '商品管理', path: '/products', icon: ShoppingBag },
        { label: '库存流水', path: '/inventory', icon: Boxes },
        { label: '订单管理', path: '/orders', icon: ClipboardList }
      ]
    : [
        { label: '运营大盘', path: '/', icon: LayoutDashboard },
        { label: '商品管理', path: '/products', icon: ShoppingBag },
        { label: '库存流水', path: '/inventory', icon: Boxes },
        { label: '订单管理', path: '/orders', icon: ClipboardList },
        { label: '类目中心', path: '/categories', icon: Layers },
        { label: '轮播营销', path: '/banners', icon: ImageIcon },
        ...(user?.role === 'SUPER_ADMIN'
          ? [{ label: '管理员权限', path: '/admins', icon: ShieldCheck }]
          : []),
        { label: '审计日志', path: '/logs', icon: FileText }
      ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
      {/* Sidebar */}
      <aside
        style={{
          width: '240px',
          backgroundColor: '#0F172A',
          color: '#F8FAFC',
          display: 'flex',
          flexDirection: 'column',
          position: 'sticky',
          top: 0,
          height: '100vh',
          zIndex: 10
        }}
      >
        {/* Brand Logo */}
        <div
          style={{
            padding: '24px 20px',
            borderBottom: '1px solid #1E293B',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: '#FF5500',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 10px rgba(255, 85, 0, 0.4)'
            }}
          >
            <Flame size={20} color="#FFF" />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '-0.3px', color: '#FFF' }}>
              通用商城
            </div>
            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500 }}>
              商城控制台 · v1.0.0
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '11px 14px',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#FFFFFF' : '#94A3B8',
                  backgroundColor: isActive ? '#FF5500' : 'transparent',
                  transition: 'all 0.15s ease',
                  boxShadow: isActive ? '0 4px 10px rgba(255, 85, 0, 0.25)' : 'none'
                })}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User Card & Logout */}
        <div
          style={{
            padding: '16px',
            borderTop: '1px solid #1E293B',
            backgroundColor: '#090D16'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: '#334155',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#FF5500'
                }}
              >
                {user?.name?.[0] || 'A'}
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#F1F5F9' }}>
                  {user?.name || '管理员'}
                </div>
                <div style={{ fontSize: '11px', color: '#64748B' }}>
                  {user?.role === 'SUPER_ADMIN' ? '超级管理员' : user?.role === 'MERCHANT' ? '商家' : '运营人员'}
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              title="退出登录"
              style={{
                background: 'none',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Topbar */}
        <header
          style={{
            height: '64px',
            backgroundColor: '#FFFFFF',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 28px',
            position: 'sticky',
            top: 0,
            zIndex: 9
          }}
        >
          <div style={{ fontSize: '14px', color: '#64748B', fontWeight: 500 }}>
            微信小程序商城全栈后台 · <span style={{ color: '#0F172A', fontWeight: 600 }}>实时在线</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                backgroundColor: !envInfo.online ? '#FEF2F2' : envInfo.isLocal ? '#EFF6FF' : '#ECFDF5',
                color: !envInfo.online ? '#DC2626' : envInfo.isLocal ? '#2563EB' : '#059669',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: !envInfo.online ? '#EF4444' : envInfo.isLocal ? '#3B82F6' : '#10B981'
                }}
              />
              {envInfo.label}
            </span>

            <a
              href="https://mp.weixin.qq.com"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '13px',
                color: '#64748B',
                fontWeight: 500
              }}
            >
              <span>微信公众平台</span>
              <ExternalLink size={14} />
            </a>
          </div>
        </header>

        {/* Page Content Viewport */}
        <main style={{ flex: 1, padding: '28px', minWidth: 0 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};
