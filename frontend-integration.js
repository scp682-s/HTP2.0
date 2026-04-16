/**
 * 前端集成代码 - 调用后端API生成心理分析报告
 *
 * 使用方法：
 * 1. 将此代码添加到 index.html 的 <script> 标签中
 * 2. 在游戏完成时调用 generatePsychologyReport() 函数
 */

// 后端API地址（自动检测环境）
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000'  // 本地开发环境
    : 'https://htppsychologyjigsaw.xyz';   // 生产环境（你的自定义域名）

/**
 * 收集游戏数据
 */
function collectGameData() {
    const game = window.puzzleGame;

    if (!game) {
        console.error('游戏实例不存在');
        return null;
    }

    // 计算完成时间
    const elapsed = Date.now() - game.startTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const completionTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // 获取图片来源
    const imageSource = game.originalImage ? game.originalImage.src : '';

    // 提取图片路径（去除域名部分）
    let imagePath = imageSource;
    if (imageSource.includes('/')) {
        const parts = imageSource.split('/');
        // 获取 photo/x.png 格式
        if (parts.length >= 2) {
            imagePath = parts.slice(-2).join('/');
        }
    }

    return {
        imageSource: imagePath,
        gameData: {
            completionTime: completionTime,
            moveCount: game.moveCount,
            difficulty: `${game.gridSize}x${game.gridSize}`,
            gridSize: game.gridSize,
            modifiers: {
                rotation: game.modifiers.rotation,
                hidden: game.modifiers.hidden,
                trickster: game.modifiers.trickster
            },
            // 可以添加更多数据
            pieceOrder: '按顺序完成',
            timeIntervals: '平均间隔适中',
            modificationCount: Math.floor(game.moveCount * 0.3) // 估算修改次数
        }
    };
}

/**
 * 验证图片是否可以被分析
 */
async function validateImage(imageSource) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/validate-image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ imageSource })
        });

        const result = await response.json();
        return result.valid;
    } catch (error) {
        console.error('验证图片失败:', error);
        return false;
    }
}

/**
 * 生成心理分析报告
 */
async function generatePsychologyReport() {
    try {
        // 1. 收集游戏数据
        const data = collectGameData();

        if (!data) {
            alert('无法收集游戏数据');
            return;
        }

        // 2. 检查是否为用户上传的图片
        if (data.imageSource.startsWith('data:image') || data.imageSource.startsWith('blob:')) {
            alert('提示：用户上传的图片不会被AI分析。\n\n为保护您的隐私，本系统只能分析游戏提供的标准房树人图像。\n\n如需获得心理分析报告，请选择游戏内置的四张图片之一。');
            return;
        }

        // 3. 显示加载提示
        showLoadingModal('正在生成心理分析报告，请稍候...');

        // 4. 调用后端API
        const response = await fetch(`${API_BASE_URL}/api/generate-report`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        // 5. 隐藏加载提示
        hideLoadingModal();

        // 6. 处理响应
        if (response.ok && result.success) {
            // 显示报告
            showReportModal(result.report);
        } else {
            // 显示错误信息
            if (response.status === 403) {
                alert(`提示：${result.message || '无法分析此图片'}\n\n请选择游戏提供的标准房树人图像。`);
            } else {
                alert(`生成报告失败：${result.message || result.error || '未知错误'}`);
            }
        }

    } catch (error) {
        hideLoadingModal();
        console.error('生成报告时出错:', error);
        alert(`网络错误：${error.message}\n\n请确保后端服务已启动（http://localhost:5000）`);
    }
}

/**
 * 显示加载提示
 */
function showLoadingModal(message) {
    // 创建加载遮罩
    const modal = document.createElement('div');
    modal.id = 'loadingModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        padding: 30px;
        border-radius: 15px;
        text-align: center;
        max-width: 300px;
    `;

    content.innerHTML = `
        <div style="font-size: 40px; margin-bottom: 15px;">⏳</div>
        <p style="color: #333; font-size: 16px;">${message}</p>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);
}

/**
 * 隐藏加载提示
 */
function hideLoadingModal() {
    const modal = document.getElementById('loadingModal');
    if (modal) {
        modal.remove();
    }
}

/**
 * 显示报告弹窗
 */
function showReportModal(reportMarkdown) {
    // 创建报告弹窗
    const modal = document.createElement('div');
    modal.id = 'reportModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.85);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        padding: 20px;
        overflow-y: auto;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        padding: 25px;
        border-radius: 15px;
        max-width: 600px;
        width: 100%;
        max-height: 80vh;
        overflow-y: auto;
        position: relative;
    `;

    // 关闭按钮
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
        position: absolute;
        top: 15px;
        right: 15px;
        background: #f0f0f0;
        border: none;
        width: 35px;
        height: 35px;
        border-radius: 50%;
        font-size: 20px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    closeBtn.onclick = () => modal.remove();

    // 报告内容（简单的Markdown渲染）
    const reportDiv = document.createElement('div');
    reportDiv.style.cssText = `
        color: #333;
        line-height: 1.8;
        font-size: 15px;
    `;
    reportDiv.innerHTML = renderMarkdown(reportMarkdown);

    content.appendChild(closeBtn);
    content.appendChild(reportDiv);
    modal.appendChild(content);
    document.body.appendChild(modal);

    // 点击背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

/**
 * 简单的Markdown渲染
 */
function renderMarkdown(markdown) {
    return markdown
        // 标题
        .replace(/^### (.*$)/gim, '<h3 style="color: #667eea; margin-top: 20px; margin-bottom: 10px;">$1</h3>')
        .replace(/^## (.*$)/gim, '<h2 style="color: #667eea; margin-top: 25px; margin-bottom: 15px;">$1</h2>')
        .replace(/^# (.*$)/gim, '<h1 style="color: #667eea; margin-top: 30px; margin-bottom: 20px;">$1</h1>')
        // 粗体
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // 列表
        .replace(/^\- (.*$)/gim, '<li style="margin-left: 20px;">$1</li>')
        // 段落
        .replace(/\n\n/g, '</p><p style="margin-bottom: 15px;">')
        // 包装在段落中
        .replace(/^(.+)$/gim, '<p style="margin-bottom: 15px;">$1</p>');
}

/**
 * 在完成页面添加"查看分析报告"按钮
 */
function addReportButtonToCompletePage() {
    const completeCard = document.querySelector('.complete-card');
    if (!completeCard) return;

    const completeBtns = completeCard.querySelector('.complete-btns');
    if (!completeBtns) return;

    // 检查是否已添加按钮
    if (document.getElementById('viewReportBtn')) return;

    // 创建按钮
    const reportBtn = document.createElement('button');
    reportBtn.id = 'viewReportBtn';
    reportBtn.className = 'btn btn-primary';
    reportBtn.innerHTML = '📊 查看心理分析报告';
    reportBtn.style.background = 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
    reportBtn.onclick = generatePsychologyReport;

    // 插入到第一个位置
    completeBtns.insertBefore(reportBtn, completeBtns.firstChild);
}

// 监听页面切换，在完成页面添加按钮
const originalShowPage = window.showPage;
if (originalShowPage) {
    window.showPage = function(pageId) {
        originalShowPage(pageId);
        if (pageId === 'pageComplete') {
            setTimeout(addReportButtonToCompletePage, 100);
        }
    };
}

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', () => {
    console.log('心理分析报告功能已加载');
    console.log('后端API地址:', API_BASE_URL);
});
