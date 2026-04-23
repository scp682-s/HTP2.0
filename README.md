# 房树人拼图游戏 - 完整使用指南

## 🎯 项目简介

这是一个创新的心理学测验游戏，结合了经典的房树人（HTP）投射测验和拼图游戏。用户通过完成拼图，系统会基于操作行为生成专业的心理分析报告。

**核心特点**：
- ✅ 支持内置图片与用户上传图片
- ✅ 用户上传图片必须同时包含“房子+树+人物”三元素才可使用
- ✅ 基于AI大模型生成专业心理分析
- ✅ SQLite记录拼图行为并提炼近期画像，增强提示词质量
- ✅ 完全免费（使用免费AI API额度）

---

## 📦 快速安装（3分钟）

### Windows用户

1. **双击运行安装脚本**
```
双击 install.bat
```

2. **按照提示操作**
   - 脚本会自动检查Python环境
   - 自动安装依赖
   - 创建配置文件

3. **配置API密钥**
   - 编辑 `backend\.env` 文件
   - 填入 `DEEPSEEK_API_KEY`（心理报告）和 `BAILIAN_API_KEY`（图片三要素校验）

### Mac/Linux用户

1. **运行安装脚本**
```bash
chmod +x install.sh
./install.sh
```

2. **配置API密钥**
```bash
nano backend/.env
# 填入：
# DEEPSEEK_API_KEY=sk-你的密钥
# BAILIAN_API_KEY=sk-你的密钥
# CUSTOM_IMAGE_MAX_MB=20
# BAILIAN_IMAGE_MAX_MB=9
```

---

## 🔑 获取免费API密钥（2分钟）

### 推荐：DeepSeek（最简单）

1. 访问 https://platform.deepseek.com/
2. 点击"注册"，使用手机号注册
3. 登录后进入"API Keys"页面
4. 点击"创建新的API Key"
5. 复制生成的密钥（格式：sk-xxxxxxxx）
6. 粘贴到 `backend/.env` 文件中

**免费额度**：500万tokens（约可生成2000份报告）

### 其他选择

- **智谱AI**：https://open.bigmodel.cn/ （1000万tokens免费）
- **通义千问**：https://dashscope.aliyun.com/ （100万tokens免费）

详见 `backend/API_EXAMPLES.md`

---

## 🚀 启动项目

### 1. 启动后端服务

**Windows**:
```bash
cd backend
python app.py
```

**Mac/Linux**:
```bash
cd backend
python3 app.py
```

看到以下信息表示成功：
```
* Running on http://0.0.0.0:5000
```

### 2. 打开游戏页面

直接用浏览器打开 `frontend/index.html` 文件

或者使用本地服务器：
```bash
# Python 3
cd frontend
python -m http.server 8000

# 然后访问 http://localhost:8000
```

### 3. 测试功能

在新的命令行窗口运行：
```bash
cd backend
python test_api.py
```

---

## 🎮 使用流程

### 第一步：开始游戏

1. 打开 `frontend/index.html`
2. 点击"开始游戏"
3. 选择一张图片（**必须选择游戏提供的4张图片之一**）
   也可上传自定义图片，但必须包含“房子、树、人物”三种元素
4. 选择难度等级
5. 点击"生成拼图"

### 第二步：完成拼图

- **点击操作**：点击碎片 → 点击格子
- **拖拽操作**：直接拖动碎片到格子
- **格子交换**：点击格子内的碎片 → 点击另一个格子

### 第三步：查看报告

1. 完成拼图后进入完成页面
2. 点击"📊 查看心理分析报告"按钮
3. 等待5-15秒
4. 查看AI生成的心理分析报告

---

## ⚠️ 重要说明

### 关于图片分析

**✅ 可以分析的图片**：
- photo/1.png
- photo/2.png
- photo/3.jpg
- photo/4.jpg
- 用户上传图片（仅当同时包含房子、树、人物三元素）

**❌ 不能分析的图片**：
- 缺少房子、树、人物任一元素的上传图片
- 非图片数据或非法来源图片

### 为什么要做三要素校验？

1. **保证任务一致性**：房树人拼图需要三元素共同存在
2. **保证解释有效性**：缺少关键元素会影响行为与内容关联解释
3. **安全控制**：过滤不相关或无效内容

### 如果选择了自定义图片

系统会显示提示：
```
上传图片未通过校验，请确保同时包含房子、树、人物三种元素。
```

---

## 🔧 常见问题

### 1. 提示"网络错误"

**原因**：后端服务未启动

**解决**：
```bash
cd backend
python app.py
```

### 2. 提示"API Key错误"

**原因**：API密钥配置错误

**解决**：
1. 检查 `backend/.env` 文件
2. 确保格式正确：`DEEPSEEK_API_KEY=sk-你的密钥`
3. 没有多余的空格或引号
4. 重启后端服务

### 3. 报告生成失败

**可能原因**：
- API密钥无效
- 免费额度用完
- 网络连接问题

**解决**：
1. 检查API密钥是否正确
2. 登录DeepSeek查看剩余额度
3. 检查网络连接
4. 查看后端控制台的错误信息

### 4. Python命令不存在

**解决**：
1. 下载Python：https://www.python.org/downloads/
2. 安装时勾选"Add Python to PATH"
3. 重启命令行

### 5. 端口5000被占用

**解决**：
修改 `backend/app.py` 最后一行：
```python
app.run(host='0.0.0.0', port=5001, debug=True)  # 改为5001
```

同时修改 `frontend/frontend-integration.js`：
```javascript
const API_BASE_URL = 'http://localhost:5001';
```

---

## 📊 成本说明

### DeepSeek

- **免费额度**：500万tokens
- **单次报告消耗**：约2000-3000 tokens
- **免费可生成**：约1500-2500份报告
- **付费价格**：1元/百万tokens

### 实际成本

| 使用场景 | 报告数量 | 成本 |
|---------|---------|------|
| 个人作业/测试 | 10-50份 | 完全免费 |
| 小型项目 | 100-500份 | 完全免费 |
| 中型项目 | 1000份 | 约2-3元 |
| 大型项目 | 10000份 | 约20-30元 |

---

## 📁 项目文件说明

```
项目根目录/
├── frontend/              # 前端目录（页面与静态资源）
│   ├── index.html         # 游戏主页面
│   ├── app.js             # 前端交互逻辑（调用后端拼图API）
│   ├── frontend-integration.js # AI报告集成
│   ├── photo/             # 前端图片资源
│   └── music/             # 前端音乐资源
├── install.bat            # Windows安装脚本
├── install.sh             # Mac/Linux安装脚本
├── QUICKSTART.md          # 快速开始指南
├── PROJECT_SUMMARY.md     # 项目总结
├── README.md              # 本文件
│
├── backend/               # 后端目录
│   ├── app.py            # Flask应用（核心代码）
│   ├── puzzle_engine.py  # 拼图算法引擎（服务端状态机）
│   ├── requirements.txt  # Python依赖列表
│   ├── .env.example      # 环境变量示例
│   ├── .env              # 环境变量（需自己创建）
│   ├── test_api.py       # API测试脚本
│   ├── README.md         # 后端详细说明
│   └── API_EXAMPLES.md   # 其他AI API集成示例
│
├── photo/                # 原始素材目录
└── music/                # 原始素材目录
```

---

## 🎓 技术栈

### 前端
- HTML5 + CSS3 + JavaScript
- 响应式设计
- 拖拽交互

### 后端
- Python 3.8+
- Flask（Web框架）
- OpenAI SDK（API调用）

### AI服务
- DeepSeek API（推荐）
- 或其他兼容OpenAI格式的API

---

## 🔒 安全特性

1. **图片来源白名单验证**
2. **用户上传图片自动拦截**
3. **CORS跨域保护**
4. **API密钥环境变量管理**
5. **完善的错误处理**

---

## 📝 开发者说明

### 修改AI提示词

编辑 `backend/app.py` 中的 `SYSTEM_PROMPT` 变量

### 添加新的标准图片

1. 将图片放入 `photo/` 目录
2. 在 `backend/app.py` 中添加到 `ALLOWED_IMAGES` 列表
3. 在 `frontend/index.html` 中添加到 `imageList` 数组

### 切换AI服务商

参考 `backend/API_EXAMPLES.md` 中的示例代码

---

## 🚀 部署到生产环境

### Vercel部署（推荐）

```bash
cd backend
npm install -g vercel
vercel
```

### Railway部署

1. 访问 https://railway.app/
2. 连接GitHub仓库
3. 添加环境变量
4. 自动部署

详见 `QUICKSTART.md`

---

## 📞 获取帮助

- **文档**：查看项目中的各个 `.md` 文件
- **测试**：运行 `python backend/test_api.py`
- **DeepSeek文档**：https://platform.deepseek.com/docs
- **Flask文档**：https://flask.palletsprojects.com/

---

## 📄 许可证

MIT License

---

## 🎉 开始使用

1. 运行 `install.bat`（Windows）或 `./install.sh`（Mac/Linux）
2. 配置 `backend/.env` 文件
3. 启动后端：`python backend/app.py`
4. 打开 `frontend/index.html`
5. 开始游戏！

**祝你使用愉快！** 🎮✨
