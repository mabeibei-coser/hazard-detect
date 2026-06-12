import { useState, useEffect, useRef } from 'react'
import {
  Container, Box, Typography, Button, CircularProgress,
  Paper, Alert, Chip, IconButton, Tooltip
} from '@mui/material'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import SearchIcon from '@mui/icons-material/Search'
import LoginIcon from '@mui/icons-material/Login'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import './styles/index.css'
import ScenarioDropdown from './components/ScenarioDropdown'
import ImageUploader from './components/ImageUploader'
import ResultTable from './components/ResultTable'
import BottomNav from './components/BottomNav'
import { analyzeHazard, fetchMe, gotoCenterLogin, CENTER_URL } from './utils/api'

// 大数据库版本标签：当前年月，跟 ASG100 首页同款
const dbVersionLabel = (() => {
  const now = new Date()
  return `大数据库版本${now.getFullYear()}年${now.getMonth() + 1}月`
})()

function App() {
  const [me, setMe] = useState(null)
  const [meReady, setMeReady] = useState(false)
  const [image, setImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [selectedScenario, setSelectedScenario] = useState('general')
  const [loading, setLoading] = useState(false)
  const [hazards, setHazards] = useState(null)
  const [reportId, setReportId] = useState(null)
  const [error, setError] = useState(null)
  const [countdown, setCountdown] = useState(20)
  const timerRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetchMe()
      .then((data) => { if (!cancelled) setMe(data) })
      .catch(() => { if (!cancelled) setMe(null) })
      .finally(() => { if (!cancelled) setMeReady(true) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const handleImageSelect = (file) => {
    setImage(file)
    setError(null)
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => setImagePreview(reader.result)
      reader.readAsDataURL(file)
    } else {
      setImagePreview(null)
    }
  }

  const handleAnalyze = async () => {
    if (!image) { setError('请先上传照片'); return }
    setLoading(true)
    setError(null)
    setHazards(null)
    setCountdown(20)
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
    try {
      const data = await analyzeHazard(image, selectedScenario)
      setHazards(data.hazards)
      setReportId(data.reportId)
    } catch (err) {
      if (err.status === 401) {
        setMe(null)
        setError('登录已失效，请重新登录')
      } else {
        setError(err.message || '分析失败')
      }
    } finally {
      setLoading(false)
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }
  }

  const handleReset = () => {
    setImage(null)
    setImagePreview(null)
    setSelectedScenario('general')
    setHazards(null)
    setReportId(null)
    setError(null)
  }

  // 悬浮底部导航：首页 = 回本应用首页（重置 + 回到顶部）；记录 = 会员中心识别历史；我的 = 去会员中心
  const goHome = () => {
    handleReset()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const goHistory = () => { window.location.href = `${CENTER_URL}?view=history` }
  const goMine = () => { window.location.href = CENTER_URL }

  let content
  if (!meReady) {
    content = (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={32} sx={{ color: 'primary.main' }} />
      </Box>
    )
  } else if (!me) {
    // 未登录：引导去会员中心登录（A600 不再自己登录）
    content = (
      <Box sx={{ minHeight: '100vh', py: { xs: 6, md: 10 }, pb: { xs: 11, md: 12 } }}>
        <Container maxWidth="sm">
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Typography variant="h4" color="primary.main" sx={{ fontWeight: 700, mb: 1 }}>
              安全隐患识别 5.0
            </Typography>
            <Typography variant="body2" color="text.secondary">
              请先登录以使用隐患识别功能
            </Typography>
          </Box>
          <Paper className="glass-card" sx={{ maxWidth: 420, mx: 'auto', p: { xs: 3, md: 4 }, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
              本平台使用统一会员账号，点击下方按钮前往登录，登录后自动返回
            </Typography>
            <Button
              variant="contained" size="large" startIcon={<LoginIcon />} onClick={gotoCenterLogin}
              sx={{ px: 4, py: 1.5 }}
            >
              前往登录 / 注册
            </Button>
          </Paper>
        </Container>
      </Box>
    )
  } else {
    content = (
    <Box sx={{ minHeight: '100vh', pt: { xs: 2, md: 4 }, pb: { xs: 11, md: 12 } }}>
      <Container maxWidth="lg">
        {/* 顶部：左侧返回首页（回 ASG100 平台） + 右侧大数据库版本标签 */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Tooltip title="返回首页">
            <IconButton
              size="small"
              onClick={() => { window.location.href = CENTER_URL }}
              sx={{
                color: 'var(--ink-3)',
                p: 0.5,
                '&:hover': { color: 'var(--accent)', backgroundColor: 'transparent' },
              }}
            >
              <ArrowBackRoundedIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'var(--accent)', flexShrink: 0 }} />
            <Box component="span" sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
              {dbVersionLabel}
            </Box>
          </Box>
        </Box>

        {/* 标题块：永远 prominent 居中 */}
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Typography
            variant="h4"
            color="primary.main"
            sx={{
              fontWeight: 700,
              mb: 1,
              fontSize: { xs: '1.5rem', md: '2.125rem' },
              lineHeight: 1.2,
            }}
          >
            安全隐患识别 5.0
            <Chip
              label="专业版"
              size="small"
              sx={{
                backgroundColor: 'primary.main',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.7rem',
                height: 20,
                minWidth: 45,
                ml: 0.75,
                verticalAlign: 'top',
                position: 'relative',
                top: '0.1em',
              }}
            />
          </Typography>
          <Typography variant="body2" color="text.secondary">
            全新升级AI 安全隐患检测平台
          </Typography>
        </Box>

        {/* 输入区域 */}
        {!hazards ? (
          <Paper className="glass-card fade-in-up" sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
            <ScenarioDropdown value={selectedScenario} onChange={setSelectedScenario} />

            <Box sx={{ mt: 2.5 }}>
              <ImageUploader onImageSelect={handleImageSelect} imagePreview={imagePreview} />
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, mt: 3 }}>
              <Button
                variant="contained"
                size="large"
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SearchIcon />}
                onClick={handleAnalyze}
                disabled={loading || !image}
                sx={{ px: 4, py: 1.5 }}
              >
                {loading ? 'AI分析中...' : '开始识别隐患'}
              </Button>
              {loading && (
                <Typography variant="body2" color="text.secondary">
                  预计 {countdown} 秒完成
                </Typography>
              )}
            </Box>

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
            )}
          </Paper>
        ) : (
          <Paper className="glass-card fade-in-up" sx={{ p: { xs: 2, md: 3 }, mb: 3, display: 'flex', justifyContent: 'center' }}>
            <Button
              variant="outlined"
              size="large"
              startIcon={<RestartAltIcon />}
              onClick={handleReset}
              sx={{ px: 4, py: 1.5 }}
            >
              重新识别
            </Button>
          </Paper>
        )}

        {hazards && (
          <Box className="fade-in-up">
            <ResultTable hazards={hazards} reportId={reportId} scenario={selectedScenario} imagePreview={imagePreview} isVip={me.isVip} />
          </Box>
        )}
      </Container>

      <Box sx={{ textAlign: 'center', mt: 4, py: 2, color: 'text.secondary' }}>
        <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>
          全新一代安全大模型5.0
        </Typography>
        <Typography variant="caption" sx={{ display: 'block' }}>
          谨世ASG人工智能实验室出品2013-{new Date().getFullYear()}
        </Typography>
      </Box>
    </Box>
    )
  }

  return (
    <>
      {content}
      <BottomNav onHome={goHome} onHistory={goHistory} onMine={goMine} />
    </>
  )
}

export default App
