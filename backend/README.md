# 房树人拼图游戏 - 后端服务

## 功能说明

这是房树人拼图游戏的后端服务，包含两部分能力：

1. 调用AI API生成心理分析报告
2. 提供服务端拼图引擎（拼图算法、状态校验、回退、交换、翻转等）
3. 使用 SQLite 记录用户操作轨迹，并提炼“近期行为摘要”参与提示词构建

### 重要安全限制

1. **支持两类图片**：
   - 游戏内置四张标准房树人图像（photo/1.png, photo/2.png, photo/3.jpg, photo/4.jpg）
   - 用户上传图片（仅当图片内容同时包含“房子+树+人物”三要素）
2. **三要素强校验**：用户上传图片会通过阿里云百炼多模态模型做内容校验；缺少任一元素会被拒绝
3. **只分析操作行为**：心理报告仍以拼图行为数据为主证据（用时、步数、间隔、修改等）

## 免费AI API推荐

### 1. DeepSeek (推荐) ⭐
- **官网**: https://platform.deepseek.com/
- **优势**: 
  - 新用户赠送500万tokens免费额度
  - API兼容OpenAI格式，易于集成
  - 中文理解能力强
  - 价格便宜（1元/百万tokens）
- **注册**: 支持手机号注册
- **获取API Key**: 注册后在控制台创建API密钥

### 2. 阿里云通义千问
- **官网**: https://dashscope.aliyun.com/
- **优势**: 
  - 新用户赠送100万tokens
  - 阿里云背书，稳定可靠
  - 中文能力优秀
- **注册**: 需要阿里云账号

### 3. 智谱AI (ChatGLM)
- **官网**: https://open.bigmodel.cn/
- **优势**: 
  - 新用户赠送1000万tokens
  - 清华大学技术支持
  - 免费额度较多
- **注册**: 支持手机号注册

### 4. 百度文心一言
- **官网**: https://cloud.baidu.com/product/wenxinworkshop
- **优势**: 
  - 百度出品，中文能力强
  - 有免费试用额度
- **注册**: 需要百度云账号

## 安装步骤

### 1. 安装Python依赖

```bash
cd backend
pip install -r requirements.txt
```

### 2. 配置API密钥

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的API密钥：

```
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
BAILIAN_API_KEY=sk-xxxxxxxxxxxxxxxx
# 可选：BAILIAN_VISION_MODEL=qwen-vl-max-latest,qwen-vl-max
# 可选：CUSTOM_IMAGE_MAX_MB=20
# 可选：BAILIAN_IMAGE_MAX_MB=9
```

### 3. 启动后端服务

```bash
python app.py
```

服务将在 `http://localhost:5000` 启动。

## API接口说明

### 1. 健康检查
```
GET /api/health
```

### 2. 生成分析报告
```
POST /api/generate-report
Content-Type: application/json

{
  "clientId": "web-xxxxxx",
  "gameId": "f2b8b5...",
  "imageSource": "photo/1.png",
  "gameData": {
    "completionTime": "02:30",
    "moveCount": 45,
    "difficulty": "3x3",
    "pieceOrder": [...],
    "timeIntervals": [...],
    "modificationCount": 5
  }
}
```

**响应**:
```json
{
  "success": true,
  "report": "# 心理分析报告\n\n...",
  "imageSource": "photo/1.png",
  "timestamp": 1234567890
}
```

**错误响应（上传图片缺少三要素）**:
```json
{
  "error": "图片校验未通过",
  "message": "图片缺少房子、树、人物中的至少一种元素。"
}
```

### 3. 验证图片
```
POST /api/validate-image
Content-Type: application/json

{
  "imageSource": "photo/1.png"
}
```

如果是用户上传图片（data URL），接口会返回三要素识别结果，例如：

```json
{
  "valid": true,
  "isCustom": true,
  "allPresent": true,
  "elements": {
    "house": true,
    "tree": true,
    "person": true
  },
  "imageId": "a1b2c3d4e5f6g7h8",
  "message": "图片校验通过，已检测到房子、树、人物三种元素。"
}
```

### 4. 创建拼图局（服务端算法）
```
POST /api/puzzle/games
Content-Type: application/json

{
  "clientId": "web-xxxxxx",
  "imageSource": "photo/1.png",
  "gridSize": 3,
  "modifiers": {
    "rotation": true,
    "hidden": false,
    "trickster": false
  }
}
```

### 5. 获取拼图局状态
```
GET /api/puzzle/games/<gameId>
```

### 6. 执行拼图动作
```
POST /api/puzzle/games/<gameId>/actions
Content-Type: application/json

{
  "clientId": "web-xxxxxx",
  "action": "place_from_tray",
  "payload": {
    "pieceId": "p-0-1",
    "targetIndex": 0
  }
}
```

支持动作：
- `place_from_tray`（托盘放置）
- `move_cell`（格子移动/交换）
- `rotate_piece`（翻转碎片）
- `shuffle`（重新打乱）
- `undo`（回退一步）
- `solve`（自动完成）
- `trigger_trickster`（手动触发捣蛋鬼）

### 7. 行为数据落库与提示词增强

- 每次创建局面、执行动作、生成报告都会更新 `backend/data/behavior_analytics.db`
- 报告生成时会读取该 `clientId` 最近14天行为数据，提炼用时、步数、犹豫比例、难度偏好、回退占比、趋势判断
- 近期摘要作为“补充证据”拼接进 user prompt，与本局数据共同用于生成更稳定、可解释的心理分析报告

## 切换到其他AI API

### 使用通义千问

```python
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("QWEN_API_KEY"),
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
)
```

### 使用智谱AI

```python
from zhipuai import ZhipuAI

client = ZhipuAI(api_key=os.environ.get("ZHIPU_API_KEY"))
response = client.chat.completions.create(
    model="glm-4",
    messages=[...]
)
```

### 使用百度文心一言

```python
import qianfan

chat_comp = qianfan.ChatCompletion()
resp = chat_comp.do(
    model="ERNIE-Bot-4",
    messages=[...]
)
```

## 安全特性

1. **图片来源验证**: 每次请求都会验证图片来源
2. **三要素校验**: 上传图片必须同时包含房子、树、人物，缺一不可
3. **CORS保护**: 配置了跨域资源共享，只允许特定来源访问
4. **错误处理**: 完善的错误处理机制，避免敏感信息泄露

## 注意事项

1. 不要将 `.env` 文件提交到版本控制系统
2. 定期检查API使用量，避免超出免费额度
3. 生产环境建议使用 gunicorn 或 uwsgi 部署
4. 建议配置 nginx 反向代理和 HTTPS

## 生产部署

使用 gunicorn 部署（当前拼图状态存储在进程内存中，必须单 worker，否则会出现“游戏不存在或已过期”）：

```bash
pip install gunicorn
gunicorn -w 1 -k gthread --threads 8 -b 0.0.0.0:5000 app:app
```

## 许可证

MIT License
