import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminApi } from '../api/client';
import { Flame, Lock, User, ShieldAlert, ArrowRight } from 'lucide-react';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMsg('请输入用户名和安全管理密码');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      await AdminApi.login(username.trim(), password.trim());
      navigate('/');
    } catch (err: any) {
      setErrorMsg(err.message || '登录验证失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0F172A',
        backgroundImage: 'radial-gradient(ellipse at top, #1E293B, #0F172A)',
        padding: '20px'
      }}
    >
      <div
        className="animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: '#FFFFFF',
          borderRadius: '24px',
          padding: '40px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)'
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              backgroundColor: '#FF5500',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
              boxShadow: '0 10px 15px -3px rgba(255, 85, 0, 0.4)'
            }}
          >
            <Flame size={32} color="#FFF" />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
            通用商城
          </h2>
          <p style={{ fontSize: '14px', color: '#64748B', marginTop: '6px' }}>
            通用商城 · 全栈管理控制台
          </p>
        </div>

        {/* Security Alert Banner */}
        <div
          style={{
            backgroundColor: '#FFF7ED',
            border: '1px solid #FFEDD5',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px'
          }}
        >
          <ShieldAlert size={18} color="#EA580C" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '12px', color: '#9A3412', lineHeight: 1.5 }}>
            <strong>安全基线</strong>：管理员密码采用 PBKDF2 (10,000次迭代) + 32位随机盐存储；连续5次输错自动锁定30分钟。
          </div>
        </div>

        {errorMsg && (
          <div
            style={{
              backgroundColor: '#FEF2F2',
              color: '#DC2626',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              marginBottom: '20px',
              border: '1px solid #FECACA'
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
              管理员账号
            </label>
            <div style={{ position: 'relative' }}>
              <User size={18} color="#94A3B8" style={{ position: 'absolute', left: '14px', top: '14px' }} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 42px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => (e.target.style.borderColor = '#FF5500')}
                onBlur={(e) => (e.target.style.borderColor = '#CBD5E1')}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
              安全密码
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} color="#94A3B8" style={{ position: 'absolute', left: '14px', top: '14px' }} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 42px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => (e.target.style.borderColor = '#FF5500')}
                onBlur={(e) => (e.target.style.borderColor = '#CBD5E1')}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '10px',
              width: '100%',
              padding: '14px',
              borderRadius: '12px',
              backgroundColor: '#FF5500',
              color: '#FFFFFF',
              border: 'none',
              fontSize: '15px',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(255, 85, 0, 0.35)',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#E04B00'; }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#FF5500'; }}
          >
            <span>{loading ? '正在安全验签...' : '安全登录后台'}</span>
            <ArrowRight size={18} />
          </button>
        </form>

        {/* Quick Fill Credentials Helper */}
        <div
          style={{
            marginTop: '28px',
            paddingTop: '20px',
            borderTop: '1px solid #F1F5F9',
            fontSize: '12px',
            color: '#64748B',
            textAlign: 'center'
          }}
        >
          <div>通用商城 · 运营控制台</div>
          <div style={{ marginTop: '4px', color: '#94A3B8' }}>安全身份认证体系已启用 · 严禁未授权访问</div>
        </div>
      </div>
    </div>
  );
};
