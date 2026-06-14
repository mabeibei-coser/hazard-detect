import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material'
import App from './App.jsx'
import './styles/index.css'

// MUI theme：与 ASG100 会员中心同一套设计语言 v2（暖白纸感 + 深青绿 + 墨黑 + VIP 古金）
// 颜色与 src/styles/index.css 的 CSS var 保持同步
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#0f766e', dark: '#0d6660', light: '#ccfbf1', contrastText: '#ffffff' },
    secondary: { main: '#525866' },
    success: { main: '#2f8559', dark: '#1f6344', light: '#e7f3ec', contrastText: '#ffffff' },
    warning: { main: '#b08a3e', dark: '#8a6c2f', light: '#fdf6e4', contrastText: '#ffffff' },
    error: { main: '#b8472d', light: '#fce8e1', contrastText: '#ffffff' },
    background: { default: '#fafaf7', paper: '#ffffff' },
    text: { primary: '#0f1419', secondary: '#525866', disabled: '#9098a5' },
    divider: '#e6e6e1',
  },
  typography: {
    // 统一字体走 CSS 变量 --font-base（典雅宋体），与 index.css / 三端保持同源、可一处切换
    fontFamily: 'var(--font-base)',
    h4: { fontWeight: 700, letterSpacing: '-0.025em' },
    h5: { fontWeight: 650, letterSpacing: '-0.018em' },
    h6: { fontWeight: 600, letterSpacing: '-0.012em' },
  },
  components: {
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 8 }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 8, textTransform: 'none', fontWeight: 600 }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 6 }
      }
    },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 700, fontSize: '0.875rem', color: '#0f1419' }
      }
    }
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)
