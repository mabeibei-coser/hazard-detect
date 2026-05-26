# 🔍 安全隐患识别系统

AI 驱动的智能安全隐患检测与分析应用

## 功能特性

- 📷 **双模式上传**：支持文件选择和摄像头拍照
- 🎯 **10 种场景**：通用场景 + 医院/仓库/养老院/学校等 9 个垂直场景
- 🤖 **AI 识别**：基于大模型的智能安全隐患识别
- 📊 **结构化报告**：隐患名称/等级/描述/规范/建议/预算
- 🎨 **现代 UI**：浅色主题 + 玻璃拟态设计

## 技术栈

**前端**
- React 18 + Vite
- Axios
- 原生 CSS（玻璃拟态设计）

**后端**
- Node.js + Express
- Multer（文件上传）
- Axios（HTTP 请求）

**大模型**
- 星火大模型 API（astron-code-latest）

## 快速开始

### 1. 安装依赖

#### 前端
```bash
cd client
npm install
```

#### 后端
```bash
cd server
npm install
```

### 2. 启动服务

#### 后端（终端 1）
```bash
cd server
npm run dev
```
服务运行在：http://localhost:5000

#### 前端（终端 2）
```bash
cd client
npm run dev
```
应用运行在：http://localhost:3000

### 3. 使用流程

1. 访问 http://localhost:3000
2. 上传照片或拍照
3. 选择场景类型
4. 点击"开始识别隐患"
5. 查看 AI 分析结果

## 10 个预设场景

1. ⭐ 通用场景（默认）
2. 🏥 医院
3. 🏭 仓库
4. 👴 养老院
5. 🏫 学校
6. 🏢 办公楼
7. 🏗️ 建筑工地
8. 🏪 商场超市
9. 🏨 酒店
10. 🚇 交通枢纽

## 输出字段

- **隐患名称**：简洁描述（20 字以内）
- **隐患等级**：高/中/低
- **隐患描述**：详细说明（100-300 字）
- **涉及规范**：国家标准或行业规范
- **整改建议**：分步骤操作指南
- **预算经费**：金额范围估算

## API 文档

### POST /api/analyze

**请求参数**
- `image`: 图片文件（multipart/form-data）
- `scenario`: 场景 ID（可选，默认 general）

**响应示例**
```json
{
  "success": true,
  "data": {
    "hazard_name": "消防通道堵塞",
    "hazard_level": "高",
    "hazard_description": "...",
    "relevant_regulations": "GB 50016-2014...",
    "rectification_suggestions": "1. 立即清理...\n2. 设置警示...",
    "estimated_budget": "¥1,000 - 2,000 元"
  }
}
```

## 项目结构

```
safety-hazard-app/
├── client/              # 前端
│   ├── src/
│   │   ├── components/  # React 组件
│   │   ├── styles/      # 样式文件
│   │   ├── utils/       # 工具函数
│   │   └── App.jsx      # 主组件
│   └── package.json
└── server/              # 后端
    ├── src/
    │   ├── routes/      # 路由
    │   ├── services/    # 服务层
    │   └── index.js     # 入口文件
    ├── uploads/         # 上传文件临时目录
    └── package.json
```

## 开发说明

### 添加新场景

1. 在 `client/src/components/ScenarioSelector.jsx` 中添加场景
2. 在 `server/src/services/llmService.js` 中添加场景提示词

### 调整 UI 样式

- 主样式：`client/src/styles/index.css`
- 组件样式：`client/src/styles/App.css`

### 修改大模型配置

编辑 `server/.env` 文件：
- `LLM_API_KEY`: API 密钥
- `LLM_API_URL`: API 地址
- `LLM_MODEL_ID`: 模型 ID

## 注意事项

- 图片大小限制：10MB
- 支持格式：JPEG, PNG, WEBP
- 建议在网络良好的环境下使用
- 大模型响应时间：5-30 秒

## 部署建议

### 前端部署
```bash
cd client
npm run build
# 将 dist 目录部署到 Web 服务器
```

### 后端部署
```bash
cd server
npm start
# 使用 PM2 等进程管理工具
```

## 许可证

MIT

## 联系方式

如有问题，请联系开发团队。
