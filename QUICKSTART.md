# 快速开始指南

## 第一步：选择AI服务商

推荐使用 **DeepSeek**（最简单、最便宜）

### DeepSeek 注册步骤

1. 访问 https://platform.deepseek.com/
2. 点击右上角"注册"
3. 使用手机号注册（支持中国大陆手机号）
4. 验证手机号后登录
5. 进入"API Keys"页面
6. 点击"创建新的API Key"
7. 复制生成的API Key（格式：sk-xxxxxxxxxxxxxxxx）

**免费额度**：新用户赠送 500万 tokens（约可生成 200-300 份报告）

## 第二步：安装后端

### Windows系统

1. 打开命令提示符（Win+R，输入cmd）

2. 进入项目目录：
```bash
cd "C:\Users\redking\Desktop\大创项目\心宇宙重塑：房树人图像趣拼\backend"
```

3. 安装Python依赖：
```bash
pip install -r requirements.txt
```

4. 创建环境变量文件：
```bash
copy .env.example .env
```

5. 编辑 `.env` 文件，填入你的API Key：
```
DEEPSEEK_API_KEY=sk-你的API密钥
BAILIAN_API_KEY=sk-你的阿里云百炼API密钥
# 可选：上传图片大小上限（MB），默认20
CUSTOM_IMAGE_MAX_MB=20
```

6. 启动后端服务：
```bash
python app.py
```

看到以下信息表示启动成功：
```
* Running on http://0.0.0.0:5000
```

### Mac/Linux系统

```bash
cd backend
pip3 install -r requirements.txt
cp .env.example .env
# 编辑 .env 文件，填入API Key
nano .env
# 启动服务
python3 app.py
```

## 第三步：启动前端

前端已完成集成，直接进入 `frontend` 目录启动静态服务：
```bash
cd frontend
python -m http.server 8000
```
然后访问 `http://localhost:8000`

## 第四步：测试

1. 确保后端服务正在运行（http://localhost:5000）
2. 打开游戏页面（frontend/index.html 或 http://localhost:8000）
3. 选择游戏提供的四张图片之一，或上传自定义图片（必须包含房子、树、人物三元素）
4. 完成拼图游戏
5. 在完成页面点击"查看心理分析报告"按钮
6. 等待几秒，报告生成完成

## 常见问题

### 1. 提示"网络错误"

**原因**：后端服务未启动

**解决**：
```bash
cd backend
python app.py
```

### 2. 提示"上传图片未通过校验"

**原因**：上传图片缺少房子、树、人物中的至少一种元素

**解决**：更换为同时包含房子、树、人物三种元素的图片，或使用内置标准图片

### 3. 提示"API Key错误"

**原因**：API Key配置错误

**解决**：
1. 检查 `.env` 文件中的API Key是否正确
2. 确保没有多余的空格或引号
3. 重启后端服务

### 4. 生成报告很慢

**原因**：网络延迟或API服务器响应慢

**解决**：
- 等待10-30秒
- 检查网络连接
- 尝试重新生成

### 5. Python命令不存在

**原因**：未安装Python

**解决**：
1. 访问 https://www.python.org/downloads/
2. 下载并安装Python 3.8+
3. 安装时勾选"Add Python to PATH"

## 部署到生产环境

### 使用Vercel部署（推荐）

1. 安装Vercel CLI：
```bash
npm install -g vercel
```

2. 在backend目录创建 `vercel.json`：
```json
{
  "version": 2,
  "builds": [
    {
      "src": "app.py",
      "use": "@vercel/python"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "app.py"
    }
  ],
  "env": {
    "DEEPSEEK_API_KEY": "@deepseek_api_key"
  }
}
```

3. 部署：
```bash
cd backend
vercel
```

4. 设置环境变量：
```bash
vercel env add DEEPSEEK_API_KEY
```

5. 更新前端的API地址：
```javascript
const API_BASE_URL = 'https://your-app.vercel.app';
```

### 使用Railway部署

1. 访问 https://railway.app/
2. 连接GitHub仓库
3. 选择backend目录
4. 添加环境变量 `DEEPSEEK_API_KEY`
5. 部署完成

## 成本估算

### DeepSeek

- 免费额度：500万tokens
- 付费价格：1元/百万tokens
- 单次报告消耗：约2000-3000 tokens
- 免费可生成：约1500-2500份报告
- 1000份报告成本：约2-3元

### 智谱AI

- 免费额度：1000万tokens
- 付费价格：5元/百万tokens
- 免费可生成：约3000-5000份报告
- 1000份报告成本：约10-15元

## 安全建议

1. **不要将API Key提交到Git**
   - `.env` 文件已在 `.gitignore` 中
   - 使用环境变量管理密钥

2. **限制API调用频率**
   - 添加请求频率限制
   - 防止恶意刷量

3. **验证图片来源**
   - 代码已实现白名单验证
   - 只分析游戏提供的图片

4. **HTTPS部署**
   - 生产环境使用HTTPS
   - 保护数据传输安全

## 获取帮助

- DeepSeek文档：https://platform.deepseek.com/docs
- Flask文档：https://flask.palletsprojects.com/
- 项目Issues：提交到你的GitHub仓库
