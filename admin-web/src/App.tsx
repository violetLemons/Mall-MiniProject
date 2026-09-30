import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AdminApi, SESSION_EXPIRED_EVENT } from './api/client';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Products } from './pages/Products';
import { Orders } from './pages/Orders';
import { Categories } from './pages/Categories';
import { Banners } from './pages/Banners';
import { Admins } from './pages/Admins';
import { Logs } from './pages/Logs';
import { AuditTickets } from './pages/AuditTickets';
import { MerchantSettings } from './pages/MerchantSettings';
import { CardKeys } from './pages/CardKeys';
import { Ads } from './pages/Ads';

// 登录守卫 (Route Guard)
const RequireAuth: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const user = AdminApi.getCurrentUser();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

// 超级管理员角色守卫 (Super Admin Guard)
const RequireSuperAdmin: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const user = AdminApi.getCurrentUser();
  if (!user || user.role !== 'SUPER_ADMIN') {
    return <Navigate to="/" replace />;
  }
  return children;
};

// 平台角色守卫 (Platform Guard): 商家 (MERCHANT) 不可访问平台专属模块
const RequirePlatform: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const user = AdminApi.getCurrentUser();
  if (!user || user.role === 'MERCHANT') {
    return <Navigate to="/" replace />;
  }
  return children;
};

import { ToastProvider } from './components/Toast';

// 会话失效监听：任何接口返回 401 时立即跳回登录页，避免停留在「已失效」的页面里
const SessionExpiryListener: React.FC = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = () => navigate('/login', { replace: true });
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  }, [navigate]);
  return null;
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <HashRouter>
        <SessionExpiryListener />
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="products" element={<Products />} />
            <Route path="audit" element={<AuditTickets />} />
            <Route path="merchant-settings" element={<MerchantSettings />} />
            <Route path="orders" element={<Orders />} />
            <Route
              path="categories"
              element={
                <RequirePlatform>
                  <Categories />
                </RequirePlatform>
              }
            />
            <Route
              path="banners"
              element={
                <RequirePlatform>
                  <Banners />
                </RequirePlatform>
              }
            />
            <Route
              path="admins"
              element={
                <RequireSuperAdmin>
                  <Admins />
                </RequireSuperAdmin>
              }
            />
            <Route
              path="card-keys"
              element={
                <RequireSuperAdmin>
                  <CardKeys />
                </RequireSuperAdmin>
              }
            />
            <Route
              path="ads"
              element={
                <RequireSuperAdmin>
                  <Ads />
                </RequireSuperAdmin>
              }
            />
            <Route
              path="logs"
              element={
                <RequirePlatform>
                  <Logs />
                </RequirePlatform>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </ToastProvider>
  );
};

export default App;
