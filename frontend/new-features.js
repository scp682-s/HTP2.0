// 新功能JavaScript代码
window.addEventListener('load', function() {
    console.log('新功能模块开始加载...');
    const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:5000' : '';
    let currentSessionId = null;
    let currentReportId = null;
    let currentReportContent = null;
    let questionCount = 0;
    let hasGeneratedReport = false;
    let currentTaskId = localStorage.getItem('reportTaskId');
    let isGenerating = false;
    let isSendingMessage = false;

    function getClientId() {
        let clientId = localStorage.getItem('clientId');
        if (!clientId) {
            clientId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('clientId', clientId);
        }
        return clientId;
    }

    // 监听拼图完成事件，重置报告生成按钮
    window.addEventListener('puzzleCompleted', () => {
        console.log('拼图完成，重置报告生成状态');
        hasGeneratedReport = false;
        localStorage.removeItem('reportTaskId');
        currentTaskId = null;
        isGenerating = false;
    });

    const adminBtn = document.getElementById('adminBtn');
    if (adminBtn) {
        console.log('管理员按钮找到');
        adminBtn.addEventListener('click', () => {
            console.log('管理员按钮被点击');
            document.getElementById('adminLoginModal').classList.add('active');
        });
    }

    const closeAdminLogin = document.getElementById('closeAdminLogin');
    if (closeAdminLogin) {
        closeAdminLogin.addEventListener('click', () => {
            document.getElementById('adminLoginModal').classList.remove('active');
        });
    }

    const adminLoginBtn = document.getElementById('adminLoginBtn');
    if (adminLoginBtn) {
        adminLoginBtn.addEventListener('click', async () => {
            const password = document.getElementById('adminPassword').value;
            try {
                const response = await fetch(API_BASE_URL + '/api/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });
                const data = await response.json();
                if (data.success) {
                    document.getElementById('adminLoginModal').classList.remove('active');
                    document.getElementById('adminPanelModal').classList.add('active');
                    document.getElementById('adminPassword').value = '';
                } else {
                    alert('密码错误');
                }
            } catch (error) {
                console.error('登录失败:', error);
                alert('登录失败，请稍后重试');
            }
        });
    }

    const closeAdminPanel = document.getElementById('closeAdminPanel');
    if (closeAdminPanel) {
        closeAdminPanel.addEventListener('click', () => {
            document.getElementById('adminPanelModal').classList.remove('active');
        });
    }

    const exportDataBtn = document.getElementById('exportDataBtn');
    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', () => {
            window.location.href = API_BASE_URL + '/api/admin/export-data';
        });
    }

    const originalViewReportBtn = document.getElementById('viewReportBtn');
    if (originalViewReportBtn) {
        console.log('查看报告按钮找到');
        const newViewReportBtn = originalViewReportBtn.cloneNode(true);
        originalViewReportBtn.parentNode.replaceChild(newViewReportBtn, originalViewReportBtn);
        newViewReportBtn.addEventListener('click', async () => {
            console.log('查看报告按钮被点击');
            document.getElementById('reportListModal').classList.add('active');
            await loadReportList();
        });
    }

    async function loadReportList() {
        const clientId = getClientId();
        const contentDiv = document.getElementById('reportListContent');

        if (currentTaskId && !isGenerating) {
            await checkTaskStatus(currentTaskId);
        }

        let buttonText = '➕ 生成报告';
        let buttonDisabled = false;
        if (isGenerating) {
            buttonText = '⏳ 生成中...';
            buttonDisabled = true;
        } else if (hasGeneratedReport) {
            buttonText = '✅ 已生成';
            buttonDisabled = true;
        }

        let headerHtml = '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #f0f0f0;"><h4 style="margin: 0; color: #333;">我的报告</h4><button class="btn btn-primary" id="generateNewReportBtn" ' + (buttonDisabled ? 'disabled' : '') + ' style="padding: 8px 16px; font-size: 0.9rem;">' + buttonText + '</button></div>';
        contentDiv.innerHTML = headerHtml + '<div class="loading"><div class="loading-spinner"></div><p>加载中...</p></div>';
        try {
            const response = await fetch(API_BASE_URL + '/api/reports/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId })
            });
            const data = await response.json();
            if (data.success && data.reports.length > 0) {
                let html = '<ul class="report-list">';
                data.reports.forEach(report => {
                    const preview = report.reportText.substring(0, 50) + '...';
                    html += '<li class="report-item"><div class="report-item-header"><strong>报告 #' + report.id + '</strong><div style="display: flex; gap: 5px; align-items: center;"><span class="report-item-time" style="margin-right: 5px;">' + report.createdAtFormatted + '</span><button class="btn btn-danger report-delete-btn" data-report-id="' + report.id + '" style="padding: 4px 8px; font-size: 0.8rem;">🗑️</button></div></div><div class="report-item-preview report-item-clickable" data-report-id="' + report.id + '" data-report-content="' + encodeURIComponent(report.reportText) + '">' + preview + '</div></li>';
                });
                html += '</ul>';
                contentDiv.innerHTML = headerHtml + html;
                document.querySelectorAll('.report-item-clickable').forEach(item => {
                    item.addEventListener('click', () => {
                        const reportId = item.getAttribute('data-report-id');
                        const reportContent = decodeURIComponent(item.getAttribute('data-report-content'));
                        showReportDetail(reportId, reportContent);
                    });
                });
                document.querySelectorAll('.report-delete-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const reportId = btn.getAttribute('data-report-id');
                        if (confirm('确定要删除这个报告及其所有对话吗？此操作不可恢复！')) {
                            await deleteReport(reportId);
                            await loadReportList();
                        }
                    });
                });
            } else if (data.success && data.reports.length === 0) {
                contentDiv.innerHTML = headerHtml + '<p style="text-align: center; color: #999; padding: 20px;">暂无报告</p>';
            } else {
                contentDiv.innerHTML = headerHtml + '<p style="text-align: center; color: #f44336;">加载失败</p>';
            }
            const generateBtn = document.getElementById('generateNewReportBtn');
            if (generateBtn && !isGenerating && !hasGeneratedReport) {
                generateBtn.addEventListener('click', generateCurrentReport);
            }
        } catch (error) {
            console.error('加载报告列表失败:', error);
            contentDiv.innerHTML = headerHtml + '<p style="text-align: center; color: #f44336;">加载失败，请稍后重试</p>';
        }
    }

    async function checkTaskStatus(taskId) {
        try {
            const response = await fetch(API_BASE_URL + '/api/reports/task-status/' + taskId);
            const data = await response.json();
            if (data.status === 'processing') {
                isGenerating = true;
                setTimeout(() => checkTaskStatus(taskId), 2000);
            } else if (data.status === 'completed') {
                isGenerating = false;
                hasGeneratedReport = true;
                localStorage.removeItem('reportTaskId');
                currentTaskId = null;
            } else if (data.status === 'failed') {
                isGenerating = false;
                localStorage.removeItem('reportTaskId');
                currentTaskId = null;
            }
        } catch (error) {
            console.error('检查任务状态失败:', error);
        }
    }

    async function generateCurrentReport() {
        const generateBtn = document.getElementById('generateNewReportBtn');
        if (!generateBtn || isGenerating) return;

        isGenerating = true;
        generateBtn.disabled = true;
        generateBtn.textContent = '⏳ 生成中...';

        try {
            let gameData = window.currentPuzzleGameData || {};
            let imageSource = window.currentPuzzleImageSource || '';
            let gameId = window.currentPuzzleGameId || '';

            if (!gameData.completionTime && window.puzzleGame) {
                const payload = window.puzzleGame.buildReportPayload();
                if (payload) {
                    gameData = payload.gameData;
                    imageSource = payload.imageSource;
                    gameId = payload.gameId;
                }
            }

            if (!gameData.completionTime) {
                const lastGame = localStorage.getItem('lastCompletedGame');
                if (lastGame) {
                    try {
                        const parsed = JSON.parse(lastGame);
                        gameData = parsed.gameData || {};
                        imageSource = parsed.imageSource || '';
                        gameId = parsed.gameId || '';
                    } catch (e) {
                        console.error('解析最近游戏数据失败:', e);
                    }
                }
            }

            if (!gameData.completionTime && !gameData.moveCount) {
                alert('无法获取游戏数据，请重新完成一次拼图');
                isGenerating = false;
                generateBtn.disabled = false;
                generateBtn.textContent = '➕ 生成报告';
                return;
            }

            const response = await fetch(API_BASE_URL + '/api/reports/generate-async', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: getClientId(),
                    gameId: gameId,
                    imageSource: imageSource,
                    gameData: gameData
                })
            });
            const data = await response.json();
            if (data.success && data.taskId) {
                currentTaskId = data.taskId;
                localStorage.setItem('reportTaskId', data.taskId);
                checkTaskStatus(data.taskId);
            } else {
                alert('生成失败：' + (data.message || data.error));
                isGenerating = false;
                generateBtn.disabled = false;
                generateBtn.textContent = '➕ 生成报告';
            }
        } catch (error) {
            console.error('生成报告失败:', error);
            alert('生成报告失败，请稍后重试');
            isGenerating = false;
            generateBtn.disabled = false;
            generateBtn.textContent = '➕ 生成报告';
        }
    }

    function showReportDetail(reportId, reportContent) {
        currentReportId = reportId;
        currentReportContent = reportContent;
        document.getElementById('reportListModal').classList.remove('active');
        document.getElementById('reportDetailModal').classList.add('active');
        const contentDiv = document.getElementById('reportDetailContent');

        // 移除markdown标识符并添加样式
        let formattedContent = reportContent
            .replace(/^##\s+(.+)$/gm, '<h2 style="color: #4a90e2; margin-top: 20px; margin-bottom: 10px; font-size: 1.3em; border-bottom: 2px solid #4a90e2; padding-bottom: 5px;">$1</h2>')
            .replace(/^###\s+(.+)$/gm, '<h3 style="color: #5a9fd4; margin-top: 15px; margin-bottom: 8px; font-size: 1.1em;">$1</h3>')
            .replace(/^\*\*(.+?)\*\*$/gm, '<strong>$1</strong>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/^#\s+(.+)$/gm, '<h1 style="color: #4a90e2; margin-bottom: 15px; font-size: 1.5em;">$1</h1>')
            .replace(/\n/g, '<br>');

        contentDiv.innerHTML = '<div style="line-height: 1.8; font-size: 1em;">' + formattedContent + '</div>';
    }

    const closeReportList = document.getElementById('closeReportList');
    if (closeReportList) {
        closeReportList.addEventListener('click', () => {
            document.getElementById('reportListModal').classList.remove('active');
        });
    }

    const closeReportDetail = document.getElementById('closeReportDetail');
    if (closeReportDetail) {
        closeReportDetail.addEventListener('click', () => {
            document.getElementById('reportDetailModal').classList.remove('active');
        });
    }

    const healingFromDetailBtn = document.getElementById('healingFromDetailBtn');
    if (healingFromDetailBtn) {
        healingFromDetailBtn.addEventListener('click', () => {
            document.getElementById('reportDetailModal').classList.remove('active');
            startHealing(currentReportId, currentReportContent);
        });
    }

    const healingBtn = document.getElementById('healingBtn');
    if (healingBtn) {
        console.log('心理疗愈按钮找到');
        healingBtn.addEventListener('click', async () => {
            console.log('心理疗愈按钮被点击');
            document.getElementById('healingListModal').classList.add('active');
            await loadHealingList();
        });
    }

    async function loadHealingList() {
        const clientId = getClientId();
        const contentDiv = document.getElementById('healingListContent');
        contentDiv.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>加载中...</p></div>';
        try {
            const response = await fetch(API_BASE_URL + '/api/reports/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId })
            });
            const data = await response.json();
            if (data.success && data.reports.length > 0) {
                let html = '<ul class="report-list">';
                for (const report of data.reports) {
                    const preview = report.reportText.substring(0, 50) + '...';

                    try {
                        const sessionsResp = await fetch(API_BASE_URL + '/api/healing/sessions/' + report.id);
                        const sessionsData = await sessionsResp.json();
                        const sessions = sessionsData.success ? sessionsData.sessions : [];

                        // 过滤掉已删除的会话
                        const activeSessions = sessions.filter(s => !s.isDeleted);

                        let buttonHtml = '<div style="display: flex; gap: 5px; align-items: center;">';

                        // 确定主按钮类型
                        if (activeSessions.length === 0) {
                            // 没有会话，显示"对话"按钮
                            buttonHtml += '<button class="btn btn-success healing-new-btn" data-report-id="' + report.id + '" data-report-content="' + encodeURIComponent(report.reportText) + '" style="padding: 6px 12px; font-size: 0.85rem;">💬 对话</button>';
                        } else {
                            // 有会话，取最新的一个
                            const latestSession = activeSessions[0];
                            if (latestSession.isCompleted) {
                                // 已完成，显示"查看"按钮
                                buttonHtml += '<button class="btn btn-info healing-view-btn" data-session-id="' + latestSession.sessionId + '" style="padding: 6px 12px; font-size: 0.85rem;">👁️ 查看</button>';
                            } else {
                                // 未完成，显示"继续"按钮
                                buttonHtml += '<button class="btn btn-warning healing-view-btn" data-session-id="' + latestSession.sessionId + '" style="padding: 6px 12px; font-size: 0.85rem;">💬 继续</button>';
                            }
                        }

                        // 删除按钮始终显示
                        buttonHtml += '<button class="btn btn-danger healing-delete-btn" data-report-id="' + report.id + '" style="padding: 6px 12px; font-size: 0.85rem;">🗑️ 删除</button>';
                        buttonHtml += '</div>';

                        html += '<li class="report-item"><div class="report-item-header"><strong>报告 #' + report.id + '</strong>' + buttonHtml + '</div><div class="report-item-preview">' + preview + '</div><div class="report-item-time">' + report.createdAtFormatted + '</div></li>';
                    } catch (sessionError) {
                        console.error('加载报告 #' + report.id + ' 的会话失败:', sessionError);
                        // 如果加载会话失败，仍然显示报告，但只显示"对话"按钮
                        let buttonHtml = '<div style="display: flex; gap: 5px; align-items: center;">';
                        buttonHtml += '<button class="btn btn-success healing-new-btn" data-report-id="' + report.id + '" data-report-content="' + encodeURIComponent(report.reportText) + '" style="padding: 6px 12px; font-size: 0.85rem;">💬 对话</button>';
                        buttonHtml += '</div>';
                        html += '<li class="report-item"><div class="report-item-header"><strong>报告 #' + report.id + '</strong>' + buttonHtml + '</div><div class="report-item-preview">' + preview + '</div><div class="report-item-time">' + report.createdAtFormatted + '</div></li>';
                    }
                }
                html += '</ul>';
                contentDiv.innerHTML = html;

                document.querySelectorAll('.healing-new-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const reportId = btn.getAttribute('data-report-id');
                        const reportContent = decodeURIComponent(btn.getAttribute('data-report-content'));
                        document.getElementById('healingListModal').classList.remove('active');
                        startHealing(reportId, reportContent);
                    });
                });

                document.querySelectorAll('.healing-view-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const sessionId = btn.getAttribute('data-session-id');
                        document.getElementById('healingListModal').classList.remove('active');
                        viewHealingSession(sessionId);
                    });
                });

                document.querySelectorAll('.healing-delete-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const reportId = btn.getAttribute('data-report-id');
                        if (confirm('确定要删除这个报告及其所有对话吗？此操作不可恢复！')) {
                            await deleteReport(reportId);
                        }
                    });
                });
            } else if (data.success && data.reports.length === 0) {
                contentDiv.innerHTML = '<p style="text-align: center; color: #999;">暂无报告，请先完成拼图游戏</p>';
            } else {
                contentDiv.innerHTML = '<p style="text-align: center; color: #f44336;">加载失败</p>';
            }
        } catch (error) {
            console.error('加载疗愈列表失败:', error);
            contentDiv.innerHTML = '<p style="text-align: center; color: #f44336;">加载失败，请稍后重试</p>';
        }
    }

    const closeHealingList = document.getElementById('closeHealingList');
    if (closeHealingList) {
        closeHealingList.addEventListener('click', () => {
            document.getElementById('healingListModal').classList.remove('active');
        });
    }

    async function viewHealingSession(sessionId) {
        try {
            const response = await fetch(API_BASE_URL + '/api/healing/session/' + sessionId);
            const data = await response.json();
            if (data.success) {
                currentSessionId = sessionId;
                questionCount = data.session.questionCount;
                const isCompleted = data.session.isCompleted;

                document.getElementById('healingChatModal').classList.add('active');
                const chatMessages = document.getElementById('chatMessages');
                chatMessages.innerHTML = '';

                data.messages.forEach(msg => {
                    const msgClass = msg.role === 'user' ? 'user' : msg.role === 'system' ? 'system' : 'assistant';
                    chatMessages.innerHTML += '<div class="chat-message ' + msgClass + '">' + msg.content + '</div>';
                });

                updateQuestionCounter();

                if (isCompleted) {
                    document.getElementById('chatInput').disabled = true;
                    document.getElementById('chatSendBtn').disabled = true;
                    chatMessages.innerHTML += '<div class="chat-message system">对话已完成，感谢您的参与！</div>';
                } else {
                    document.getElementById('chatInput').disabled = false;
                    document.getElementById('chatSendBtn').disabled = false;
                }

                chatMessages.scrollTop = chatMessages.scrollHeight;
            } else {
                alert('加载会话失败');
            }
        } catch (error) {
            console.error('加载会话失败:', error);
            alert('加载会话失败，请稍后重试');
        }
    }

    async function deleteHealingSession(sessionId) {
        try {
            const response = await fetch(API_BASE_URL + '/api/healing/delete-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId })
            });
            const data = await response.json();
            if (data.success) {
                alert('删除成功');
                await loadHealingList();
            } else {
                alert('删除失败：' + (data.message || data.error));
            }
        } catch (error) {
            console.error('删除会话失败:', error);
            alert('删除失败，请稍后重试');
        }
    }

    async function deleteReport(reportId) {
        try {
            const response = await fetch(API_BASE_URL + '/api/reports/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reportId })
            });
            const data = await response.json();
            if (data.success) {
                alert('删除成功');
                await loadHealingList();
            } else {
                alert('删除失败：' + (data.message || data.error));
            }
        } catch (error) {
            console.error('删除报告失败:', error);
            alert('删除失败，请稍后重试');
        }
    }

    async function startHealing(reportId, reportContent) {
        const clientId = getClientId();
        try {
            const response = await fetch(API_BASE_URL + '/api/healing/create-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId,
                    reportId: parseInt(reportId),
                    reportContent
                })
            });
            const data = await response.json();
            if (data.success) {
                currentSessionId = data.sessionId;
                currentReportContent = reportContent;
                questionCount = 0;
                document.getElementById('healingChatModal').classList.add('active');
                const chatMessages = document.getElementById('chatMessages');
                chatMessages.innerHTML = '<div class="chat-message system">✅ 已上传您的心理报告<br>您可以提出3个问题，我会基于您的报告提供心理支持和建议。</div>';
                updateQuestionCounter();

                // 启用输入框和发送按钮
                document.getElementById('chatInput').disabled = false;
                document.getElementById('chatSendBtn').disabled = false;
                document.getElementById('chatInput').focus();
            } else {
                alert('创建疗愈会话失败');
            }
        } catch (error) {
            console.error('创建疗愈会话失败:', error);
            alert('创建疗愈会话失败，请稍后重试');
        }
    }

    const closeHealingChat = document.getElementById('closeHealingChat');
    if (closeHealingChat) {
        closeHealingChat.addEventListener('click', () => {
            document.getElementById('healingChatModal').classList.remove('active');
        });
    }

    const chatSendBtn = document.getElementById('chatSendBtn');
    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', sendMessage);
    }

    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }

    async function sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        if (!message || isSendingMessage) return;
        if (questionCount >= 3) {
            alert('已达到提问次数上限');
            return;
        }

        isSendingMessage = true;
        const chatSendBtn = document.getElementById('chatSendBtn');
        chatSendBtn.disabled = true;
        input.disabled = true;

        const chatMessages = document.getElementById('chatMessages');
        chatMessages.innerHTML += '<div class="chat-message user">' + message + '</div>';
        input.value = '';
        chatMessages.scrollTop = chatMessages.scrollHeight;
        chatMessages.innerHTML += '<div class="chat-message assistant loading-msg">正在思考...</div>';
        chatMessages.scrollTop = chatMessages.scrollHeight;
        try {
            const response = await fetch(API_BASE_URL + '/api/healing/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: currentSessionId,
                    message
                })
            });
            const data = await response.json();
            const loadingMsg = document.querySelector('.loading-msg');
            if (loadingMsg) loadingMsg.remove();
            if (data.success) {
                const assistantMsg = document.createElement('div');
                assistantMsg.className = 'chat-message assistant';
                chatMessages.appendChild(assistantMsg);

                // 打字机效果
                let index = 0;
                const text = data.message;
                const typeInterval = setInterval(() => {
                    if (index < text.length) {
                        assistantMsg.textContent += text[index];
                        index++;
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    } else {
                        clearInterval(typeInterval);
                        isSendingMessage = false;
                        input.disabled = false;
                        chatSendBtn.disabled = false;
                    }
                }, 30);

                questionCount = data.questionCount;
                updateQuestionCounter();
                if (questionCount >= 3) {
                    setTimeout(() => {
                        chatMessages.innerHTML += '<div class="chat-message system">对话已结束，感谢您的参与！请填写您的信息。</div>';
                        document.getElementById('chatInput').disabled = true;
                        document.getElementById('chatSendBtn').disabled = true;
                        setTimeout(() => {
                            document.getElementById('healingChatModal').classList.remove('active');
                            document.getElementById('userInfoModal').classList.add('active');
                        }, 1500);
                    }, text.length * 30 + 500);
                }
            } else {
                chatMessages.innerHTML += '<div class="chat-message system">❌ ' + data.error + '</div>';
                isSendingMessage = false;
                input.disabled = false;
                chatSendBtn.disabled = false;
            }
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } catch (error) {
            console.error('发送消息失败:', error);
            const loadingMsg = document.querySelector('.loading-msg');
            if (loadingMsg) loadingMsg.remove();
            chatMessages.innerHTML += '<div class="chat-message system">❌ 发送失败，请稍后重试</div>';
            chatMessages.scrollTop = chatMessages.scrollHeight;
            isSendingMessage = false;
            input.disabled = false;
            chatSendBtn.disabled = false;
        }
    }

    function updateQuestionCounter() {
        const remaining = 3 - questionCount;
        const counter = document.getElementById('questionCounter');
        if (counter) {
            counter.textContent = '剩余提问次数: ' + remaining;
        }
    }

    const closeUserInfo = document.getElementById('closeUserInfo');
    if (closeUserInfo) {
        closeUserInfo.addEventListener('click', () => {
            document.getElementById('userInfoModal').classList.remove('active');
        });
    }

    const submitUserInfoBtn = document.getElementById('submitUserInfoBtn');
    if (submitUserInfoBtn) {
        submitUserInfoBtn.addEventListener('click', async () => {
            const userName = document.getElementById('userName').value.trim();
            const userStudentId = document.getElementById('userStudentId').value.trim();
            const isAnonymous = document.getElementById('isAnonymous').checked;
            try {
                const response = await fetch(API_BASE_URL + '/api/healing/submit-info', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: currentSessionId,
                        userName,
                        userStudentId,
                        isAnonymous
                    })
                });
                const data = await response.json();
                if (data.success) {
                    alert('提交成功，感谢您的参与！');
                    document.getElementById('userInfoModal').classList.remove('active');
                    document.getElementById('userName').value = '';
                    document.getElementById('userStudentId').value = '';
                    document.getElementById('isAnonymous').checked = true;
                    document.getElementById('chatInput').disabled = false;
                    document.getElementById('chatSendBtn').disabled = false;
                } else {
                    alert('提交失败，请稍后重试');
                }
            } catch (error) {
                console.error('提交用户信息失败:', error);
                alert('提交失败，请稍后重试');
            }
        });
    }

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });

    console.log('新功能模块已加载完成');
});
