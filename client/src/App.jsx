import { useState, useEffect, useRef } from 'react'
import {
  Container, Box, Typography, Button, CircularProgress,
  Paper, Alert, Chip
} from '@mui/material'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import SearchIcon from '@mui/icons-material/Search'
import './styles/index.css'
import ScenarioDropdown from './components/ScenarioDropdown'
import ImageUploader from './components/ImageUploader'
import ResultTable from './components/ResultTable'
import { analyzeHazard } from './utils/api'

function App() {
  const [image, setImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [selectedScenario, setSelectedScenario] = useState('general')
  const [loading, setLoading] = useState(false)
  const [hazards, setHazards] = useState(null)
  const [error, setError] = useState(null)
  const [countdown, setCountdown] = useState(15)
  const timerRef = useRef(null)

  // 清理定时器
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
    // 启动15秒倒计时
    setCountdown(15)
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
    try {
      const data = await analyzeHazard(image, selectedScenario)
      setHazards(data)
    } catch (err) {
      const msg = err.response
        ? `API 错误 (${err.response.status})`
        : (err.message || '分析失败')
      setError(msg)
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
    setError(null)
  }

  return (
    <Box sx={{ minHeight: '100vh', py: { xs: 2, md: 4 }, backgroundColor: '#f4f6f9' }}>
      <Container maxWidth="lg">
        {/* 标题 */}
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
            <Typography variant="h4" color="primary.main" sx={{ fontWeight: 700 }}>
              安全隐患识别 5.0
              <Chip
                label="专业版"
                size="small"
                sx={{
                  ml: 1,
                  backgroundColor: 'primary.main',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.7rem',
                  height: 20,
                  verticalAlign: 'super',
                  minWidth: 45
                }}
              />
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            全新升级AI 安全隐患检测平台
          </Typography>
        </Box>

        {/* 输入区域 */}
        {!hazards ? (
          <Paper className="glass-card fade-in-up" sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
            {/* 场景选择 */}
            <ScenarioDropdown value={selectedScenario} onChange={setSelectedScenario} />

            {/* 照片上传 */}
            <Box sx={{ mt: 2.5 }}>
              <ImageUploader onImageSelect={handleImageSelect} imagePreview={imagePreview} />
            </Box>

            {/* 操作按钮 */}
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

        {/* 结果展示 */}
        {hazards && (
          <Box className="fade-in-up">
            <ResultTable hazards={hazards} scenario={selectedScenario} imagePreview={imagePreview} />
          </Box>
        )}
      </Container>

      {/* Footer */}
      <Box sx={{ textAlign: 'center', mt: 4, py: 2, color: 'text.muted' }}>
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

export default App
