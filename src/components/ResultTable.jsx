import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, Button
} from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import * as XLSX from 'xlsx'

const LEVEL_CONFIG = {
  '高': { color: '#c62828', bg: '#ffebee', label: '高' },
  '中': { color: '#e65100', bg: '#fff3e0', label: '中' },
  '低': { color: '#1b5e20', bg: '#e8f5e9', label: '低' },
}

const SCENARIO_NAMES = {
  general: '通用场景',
  residential: '居民住宅小区',
  hospital: '医院及医疗机构',
  school: '学校及教育培训机构',
  nursing_home: '养老院及福利机构',
  warehouse_general: '通用仓库',
  warehouse_chemical: '危险化学品仓库',
  chemical_workshop: '化工生产车间',
  office: '写字楼/办公楼',
  mall: '大型商场/购物中心',
  market: '农贸市场/菜市场',
  kitchen: '餐饮后厨',
  construction: '建筑工地',
  gas_station: '加油站/加气站',
  hotel: '宾馆/酒店',
  gym: '体育馆/游泳馆',
  transport: '交通枢纽（车站/地铁站/机场）',
  industrial_zone: '工业园区/厂区道路',
  street_shop: '沿街商铺',
  park: '公园/广场',
  cinema: '影院/KTV/娱乐场所',
  library: '图书馆/博物馆/展览馆',
  historic: '文物古建筑/历史街区',
  scenic: '景区/游乐场',
  port: '港口/码头',
  power_station: '电力配电站/变电站',
  data_center: '通信基站/数据中心机房',
  printing: '印刷/喷涂/涂装车间',
  confined_space: '有限空间作业现场',
  high_altitude: '高处作业/外墙清洗现场',
  ev_charging: '电动自行车集中充电棚',
  logistics: '物流分拨中心',
  auto_repair: '汽车维修/4S店',
  pipe_gallery: '地下综合管廊',
  mining: '露天矿山/采石场',
  food_processing: '食品加工车间',
}

function ResultTable({ hazards, scenario, imagePreview }) {
  const hazardList = Array.isArray(hazards) ? hazards : [hazards]
  const now = new Date().toLocaleString('zh-CN')

  const getLevelLabel = (level) => {
    const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG['中']
    return (
      <Chip
        label={level + '风险'}
        size="small"
        sx={{
          backgroundColor: cfg.bg,
          color: cfg.color,
          fontWeight: 700,
          fontSize: '0.75rem',
          borderRadius: 1,
        }}
      />
    )
  }

  const handleDownloadExcel = () => {
    // 准备表格数据
    const excelData = hazardList.map((h, i) => ({
      '序号': i + 1,
      '隐患名称': h.hazard_name,
      '隐患等级': h.hazard_level + '风险',
      '具体描述': h.hazard_description,
      '涉及规范': h.relevant_regulations,
      '整改建议': h.rectification_suggestions,
      '预算经费': h.estimated_budget
    }))

    // 创建工作表
    const worksheet = XLSX.utils.json_to_sheet(excelData)

    // 设置列宽
    const colWidths = [
      { wch: 6 },   // 序号
      { wch: 20 },  // 隐患名称
      { wch: 10 },  // 隐患等级
      { wch: 40 },  // 具体描述
      { wch: 25 },  // 涉及规范
      { wch: 35 },  // 整改建议
      { wch: 15 }   // 预算经费
    ]
    worksheet['!cols'] = colWidths

    // 设置表头样式（加粗）
    const range = XLSX.utils.decode_range(worksheet['!ref'])
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
      if (!worksheet[cellAddress]) continue
      worksheet[cellAddress].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: 'F8FAFC' } },
        alignment: { horizontal: 'center', vertical: 'center' }
      }
    }

    // 创建工作簿
    const workbook = XLSX.utils.book_new()
    const timestamp = new Date().toLocaleString('zh-CN').replace(/[\/\:\s]/g, '')
    const sheetName = `${SCENARIO_NAMES[scenario] || '通用'}_${timestamp}`
    XLSX.utils.book_append_sheet(workbook, worksheet, '隐患台账')

    // 下载文件
    const fileName = `安全隐患台账_${SCENARIO_NAMES[scenario] || '通用'}_${timestamp}.xlsx`
    XLSX.writeFile(workbook, fileName)
  }

  const handleCopy = () => {
    let text = `安全隐患识别报告\n${'='.repeat(40)}\n`
    text += `检测场景：${SCENARIO_NAMES[scenario] || '通用'}\n`
    text += `检测时间：${now}\n`
    text += `共发现 ${hazardList.length} 个隐患\n\n`
    hazardList.forEach((h, i) => {
      text += `【隐患 ${i + 1}】${h.hazard_name} [等级：${h.hazard_level}]\n`
      text += `描述：${h.hazard_description}\n`
      text += `规范：${h.relevant_regulations}\n`
      text += `建议：${h.rectification_suggestions}\n`
      text += `预算：${h.estimated_budget}\n\n`
    })
    navigator.clipboard.writeText(text)
    alert('报告已复制到剪贴板')
  }

  return (
    <Paper className="glass-card" sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
      {/* 头部 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Box sx={{ width: 3, height: 20, borderRadius: 1.5, backgroundColor: 'primary.main' }} />
            <Typography variant="h6" color="primary.main">
              安全隐患识别报告
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            场景：{SCENARIO_NAMES[scenario] || '通用'} · 检测时间：{now} · 共发现 <strong>{hazardList.length}</strong> 个隐患
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={handleDownloadExcel}
            sx={{ backgroundColor: 'primary.main', '&:hover': { backgroundColor: 'primary.dark' } }}
          >
            下载台账
          </Button>
          <Button size="small" variant="outlined" startIcon={<ContentCopyIcon />} onClick={handleCopy}>
            复制报告
          </Button>
        </Box>
      </Box>

      {/* 桌面端：表格视图 */}
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f8fafc' }}>
                <TableCell width="5%">#</TableCell>
                <TableCell width="14%">隐患名称</TableCell>
                <TableCell width="8%">等级</TableCell>
                <TableCell width="28%">具体描述</TableCell>
                <TableCell width="18%">涉及规范</TableCell>
                <TableCell width="17%">整改建议</TableCell>
                <TableCell width="10%">预算经费</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {hazardList.map((hazard, i) => (
                <TableRow key={i} hover>
                  <TableCell align="center">
                    <Chip label={i + 1} size="small" color="primary" sx={{ minWidth: 28 }} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {hazard.hazard_name}
                    </Typography>
                    {/* 照片放在每个隐患名称下方 */}
                    {imagePreview && (
                      <Box sx={{ mt: 1 }}>
                        <img
                          src={imagePreview}
                          alt="已分析照片"
                          style={{
                            width: '100%', maxWidth: 160,
                            borderRadius: 6,
                            border: '1px solid rgba(0,0,0,0.08)'
                          }}
                        />
                      </Box>
                    )}
                  </TableCell>
                  <TableCell>{getLevelLabel(hazard.hazard_level)}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                      {hazard.hazard_description}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'text.secondary' }}>
                      {hazard.relevant_regulations}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box component="ul" sx={{ m: 0, pl: 2, fontSize: '0.8rem', lineHeight: 1.6 }}>
                      {hazard.rectification_suggestions.split('\n').filter(s => s.trim()).map((s, j) => (
                        <li key={j}>{s.replace(/^\d+[\.\、\s]*/, '')}</li>
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700} color="primary.main" sx={{ fontSize: '0.85rem' }}>
                      {hazard.estimated_budget}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* 手机端：卡片视图 */}
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        {/* 分析照片（手机端只显示一次，放在所有隐患卡片上方） */}
        {imagePreview && (
          <Box sx={{ mb: 2 }}>
            <img
              src={imagePreview}
              alt="已分析照片"
              style={{
                width: '100%',
                maxHeight: 240,
                objectFit: 'cover',
                borderRadius: 8,
                border: '1px solid rgba(0,0,0,0.08)',
                display: 'block',
              }}
            />
          </Box>
        )}

        {hazardList.map((hazard, i) => {
          const cfg = LEVEL_CONFIG[hazard.hazard_level] || LEVEL_CONFIG['中']
          return (
            <Paper
              key={i}
              variant="outlined"
              sx={{ p: 2, mb: 1.5, borderRadius: 2 }}
            >
              {/* 头部：编号 + 名称 + 等级 */}
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
                  <Chip
                    label={i + 1}
                    size="small"
                    color="primary"
                    sx={{ minWidth: 28, flexShrink: 0 }}
                  />
                  <Typography variant="subtitle1" fontWeight={700} sx={{ wordBreak: 'break-word', lineHeight: 1.3 }}>
                    {hazard.hazard_name}
                  </Typography>
                </Box>
                <Chip
                  label={hazard.hazard_level + '风险'}
                  size="small"
                  sx={{
                    backgroundColor: cfg.bg,
                    color: cfg.color,
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    borderRadius: 1,
                    flexShrink: 0,
                  }}
                />
              </Box>

              {/* 描述 */}
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.7rem', letterSpacing: 0.4, display: 'block', mb: 0.5 }}>
                  具体描述
                </Typography>
                <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                  {hazard.hazard_description}
                </Typography>
              </Box>

              {/* 涉及规范 */}
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.7rem', letterSpacing: 0.4, display: 'block', mb: 0.5 }}>
                  涉及规范
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'text.secondary', wordBreak: 'break-word' }}>
                  {hazard.relevant_regulations}
                </Typography>
              </Box>

              {/* 整改建议 */}
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.7rem', letterSpacing: 0.4, display: 'block', mb: 0.5 }}>
                  整改建议
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: '0.85rem', lineHeight: 1.6 }}>
                  {hazard.rectification_suggestions.split('\n').filter(s => s.trim()).map((s, j) => (
                    <li key={j}>{s.replace(/^\d+[\.\、\s]*/, '')}</li>
                  ))}
                </Box>
              </Box>

              {/* 预算 */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 1.5, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.7rem', letterSpacing: 0.4 }}>
                  预算经费
                </Typography>
                <Typography variant="body1" fontWeight={700} color="primary.main">
                  {hazard.estimated_budget}
                </Typography>
              </Box>
            </Paper>
          )
        })}
      </Box>
    </Paper>
  )
}

export default ResultTable
