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
    <Paper className="glass-card" sx={{ p: { xs: 1.5, md: 3 }, mb: 3 }}>
      {/* 头部 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Box sx={{ width: 3, height: 20, borderRadius: 1.5, backgroundColor: 'primary.main' }} />
            <Typography variant="h6" color="primary.main" sx={{ fontSize: { xs: '1rem', md: '1.25rem' } }}>
              安全隐患识别报告
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.75rem', md: '0.875rem' } }}>
            场景：{SCENARIO_NAMES[scenario] || '通用'} · 检测时间：{now} · 共发现 <strong>{hazardList.length}</strong> 个隐患
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
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

      {/* 分析照片：表格外面展示一次，所有 hazard 共用 */}
      {imagePreview && (
        <Box sx={{ mb: 2 }}>
          <img
            src={imagePreview}
            alt="已分析照片"
            style={{
              width: '100%',
              maxHeight: 280,
              objectFit: 'cover',
              borderRadius: 8,
              border: '1px solid rgba(0,0,0,0.08)',
              display: 'block',
            }}
          />
        </Box>
      )}

      {/* 7 列表格：桌面正常；手机端 # + 隐患名称 sticky 固定，其他字段横向滑 */}
      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{
          borderRadius: 2,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <Table
          size="small"
          sx={{
            minWidth: { xs: 820, md: 'auto' },
            '& .MuiTableCell-root': {
              verticalAlign: 'top',
              wordBreak: 'break-word',
            },
            // 手机端：# 列 + 隐患名称列 sticky
            '& .col-sticky-1': {
              position: { xs: 'sticky', md: 'static' },
              left: 0,
              zIndex: { xs: 2, md: 'auto' },
              backgroundColor: { xs: '#fff', md: 'transparent' },
            },
            '& .col-sticky-2': {
              position: { xs: 'sticky', md: 'static' },
              left: { xs: 56, md: 'auto' },
              zIndex: { xs: 2, md: 'auto' },
              backgroundColor: { xs: '#fff', md: 'transparent' },
            },
            // hover 时 sticky 列背景跟随
            '& .MuiTableRow-root:hover .col-sticky-1, & .MuiTableRow-root:hover .col-sticky-2': {
              backgroundColor: { xs: '#fafbfc', md: 'transparent' },
            },
            // header sticky 列 zIndex 更高 + 维持表头背景
            '& .MuiTableHead-root .col-sticky-1, & .MuiTableHead-root .col-sticky-2': {
              zIndex: { xs: 3, md: 'auto' },
              backgroundColor: '#f8fafc',
            },
            // 第 2 列右边加一道阴影分界（暗示 sticky 边界），仅手机端
            '& .col-sticky-2::after': {
              content: { xs: '""', md: 'none' },
              position: 'absolute',
              top: 0,
              bottom: 0,
              right: -1,
              width: 6,
              background: 'linear-gradient(to right, rgba(0,0,0,0.08), transparent)',
              pointerEvents: 'none',
            },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell
                className="col-sticky-1"
                align="center"
                sx={{ width: { xs: 56, md: '5%' }, minWidth: 56 }}
              >
                #
              </TableCell>
              <TableCell
                className="col-sticky-2"
                sx={{ width: { xs: 140, md: '14%' }, minWidth: 140 }}
              >
                隐患名称
              </TableCell>
              <TableCell sx={{ width: { xs: 80, md: '8%' }, minWidth: 80 }}>等级</TableCell>
              <TableCell sx={{ width: { xs: 200, md: '28%' }, minWidth: 200 }}>具体描述</TableCell>
              <TableCell sx={{ width: { xs: 140, md: '18%' }, minWidth: 140 }}>涉及规范</TableCell>
              <TableCell sx={{ width: { xs: 200, md: '17%' }, minWidth: 200 }}>整改建议</TableCell>
              <TableCell sx={{ width: { xs: 100, md: '10%' }, minWidth: 100 }} align="right">预算经费</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {hazardList.map((hazard, i) => (
              <TableRow key={i} hover>
                <TableCell className="col-sticky-1" align="center">
                  <Chip label={i + 1} size="small" color="primary" sx={{ minWidth: 28 }} />
                </TableCell>
                <TableCell className="col-sticky-2">
                  <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.4 }}>
                    {hazard.hazard_name}
                  </Typography>
                </TableCell>
                <TableCell>{getLevelLabel(hazard.hazard_level)}</TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                    {hazard.hazard_description}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.78rem',
                      color: 'text.secondary',
                      wordBreak: 'break-all',
                      lineHeight: 1.5,
                    }}
                  >
                    {hazard.relevant_regulations}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Box component="ul" sx={{ m: 0, pl: 2, fontSize: '0.8rem', lineHeight: 1.6, '& li': { mb: 0.25 } }}>
                    {hazard.rectification_suggestions.split('\n').filter(s => s.trim()).map((s, j) => (
                      <li key={j}>{s.replace(/^\d+[\.\、\s]*/, '')}</li>
                    ))}
                  </Box>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={700} color="primary.main" sx={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                    {hazard.estimated_budget}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 手机端滑动提示（仅 xs 显示） */}
      <Typography
        variant="caption"
        sx={{
          display: { xs: 'block', md: 'none' },
          textAlign: 'center',
          color: 'text.secondary',
          mt: 1,
          fontSize: '0.7rem',
        }}
      >
        ← 横向滑动查看其他字段（#和名称固定不动）→
      </Typography>
    </Paper>
  )
}

export default ResultTable
