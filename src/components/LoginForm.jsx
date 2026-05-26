import React, { useState } from 'react';
import { Box, Typography, TextField, Button, Alert } from '@mui/material';
import LoginIcon from '@mui/icons-material/Login';
import { loginByPhone } from '../utils/api';

const PHONE_RE = /^1\d{10}$/;

/**
 * 手机号登录卡片（V1：无验证码）。
 * 登录成功后回调 onLoggedIn({ phone })，由父组件刷新页面状态。
 */
export default function LoginForm({ onLoggedIn }) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isValid = PHONE_RE.test(phone);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid || loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await loginByPhone(phone);
      onLoggedIn?.(data);
    } catch (err) {
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      className="glass-card"
      sx={{
        maxWidth: 420,
        mx: 'auto',
        p: { xs: 3, md: 4 },
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <Box sx={{ textAlign: 'center', mb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#1e3a5f', mb: 0.5 }}>
          手机号登录
        </Typography>
        <Typography variant="body2" sx={{ color: '#64748b', fontSize: '0.85rem' }}>
          输入 11 位手机号即可使用隐患识别，识别记录会自动保存到你的账号
        </Typography>
      </Box>
      <TextField
        label="手机号"
        value={phone}
        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
        disabled={loading}
        placeholder="请输入 11 位手机号"
        inputMode="numeric"
        autoComplete="tel"
        fullWidth
        error={Boolean(phone) && !isValid}
        helperText={phone && !isValid ? '手机号格式不正确（应为 1 开头 11 位）' : ' '}
      />
      {error && <Alert severity="error">{error}</Alert>}
      <Button
        type="submit"
        variant="contained"
        disabled={!isValid || loading}
        startIcon={loading ? null : <LoginIcon />}
        sx={{
          py: 1.5,
          background: isValid && !loading ? '#1e3a5f' : 'rgba(0,0,0,0.04)',
          color: isValid && !loading ? '#fff' : 'rgba(0,0,0,0.26)',
          '&:hover': {
            background: isValid && !loading ? '#2c5282' : 'rgba(0,0,0,0.04)',
          },
          '&.Mui-disabled': {
            color: 'rgba(0,0,0,0.26)',
            background: 'rgba(0,0,0,0.04)',
          },
        }}
      >
        {loading ? '登录中...' : '登录'}
      </Button>
      <Typography variant="caption" sx={{ color: '#94a3b8', textAlign: 'center' }}>
        本平台仅做隐患识别查询，不会发送任何短信
      </Typography>
    </Box>
  );
}
