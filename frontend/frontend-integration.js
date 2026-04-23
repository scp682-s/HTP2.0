const API_BASE_URL = (typeof window.API_BASE_URL === "string")
    ? window.API_BASE_URL
    : (
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
            ? "http://localhost:5000"
            : ""
    );

const scriptLoaders = {};

function collectGameData() {
    const game = window.puzzleGame;
    if (!game) {
        console.error("游戏实例不存在");
        return null;
    }

    if (typeof game.getReportData === "function") {
        return game.getReportData();
    }

    const elapsed = game.startTime ? Date.now() - game.startTime : 0;
    const completionTime = `${Math.floor(elapsed / 60000).toString().padStart(2, "0")}:${Math.floor((elapsed % 60000) / 1000).toString().padStart(2, "0")}`;
    return {
        imageSource: game.imageSource || "",
        clientId: game.clientId || localStorage.getItem("puzzle_client_id") || "anonymous",
        gameId: game.gameId || "",
        gameData: {
            completionTime,
            moveCount: game.moveCount || 0,
            difficulty: `${game.gridSize || 3}x${game.gridSize || 3}`,
            gridSize: game.gridSize || 3,
            modifiers: game.modifiers || {},
            pieceOrder: [],
            timeIntervals: [],
            modificationCount: 0,
        },
    };
}

async function validateImage(imageSource) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/validate-image`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageSource, purpose: "report" }),
        });
        const result = await response.json();
        if (!response.ok) {
            return {
                valid: false,
                message: result?.message || result?.error || `校验失败(${response.status})`,
            };
        }
        return result;
    } catch (error) {
        console.error("验证图片失败:", error);
        return { valid: false, message: `验证图片失败：${error.message}` };
    }
}

function escapeHtml(text) {
    return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function sanitizeReportText(text) {
    return String(text || "")
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
        .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u200D\uFE0F]/gu, " ")
        .replace(/[\p{S}]/gu, " ")
        .replace(/[★☆◆◇■□●○▶▷►▪▫※◎◇▲△▽▼·•◦]/g, " ")
        .replace(/[^\p{L}\p{N}\s，。；：、？！,.!?（）()“”‘’《》【】\[\]—\-]/gu, " ")
        .replace(/[<>]/g, " ")
        .replace(/[|]+/g, " ")
        .replace(/([，。；：、？！,.!?])\1+/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeInlineMarkdown(text) {
    return String(text || "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/__(.*?)__/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\[(.*?)\]\((.*?)\)/g, "$1");
}

function parseReportBlocks(markdown) {
    const lines = String(markdown || "").split(/\r?\n/);
    const blocks = [];
    let paragraphBuffer = [];

    function flushParagraph() {
        if (!paragraphBuffer.length) return;
        const joined = sanitizeReportText(normalizeInlineMarkdown(paragraphBuffer.join(" ")));
        if (joined) blocks.push({ type: "p", text: joined });
        paragraphBuffer = [];
    }

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            flushParagraph();
            continue;
        }

        const headingMatch = line.match(/^(#{1,3})\s*(.+)$/);
        if (headingMatch) {
            flushParagraph();
            const level = headingMatch[1].length;
            const headingText = sanitizeReportText(normalizeInlineMarkdown(headingMatch[2]));
            if (headingText) {
                if (level === 1 && /心理.*报告/.test(headingText)) {
                    // 顶部主标题已统一渲染，避免重复
                } else if (level === 1) blocks.push({ type: "h1", text: headingText });
                else if (level === 2) blocks.push({ type: "h2", text: headingText });
                else blocks.push({ type: "h3", text: headingText });
            }
            continue;
        }

        const listMatch = line.match(/^[-*]\s+(.+)$/);
        const orderedMatch = line.match(/^\d+[.)、]\s+(.+)$/);
        if (listMatch || orderedMatch) {
            flushParagraph();
            const itemText = listMatch ? listMatch[1] : orderedMatch[1];
            const item = sanitizeReportText(normalizeInlineMarkdown(itemText));
            if (item) blocks.push({ type: "p", text: item });
            continue;
        }

        const cleaned = sanitizeReportText(normalizeInlineMarkdown(line));
        if (cleaned) paragraphBuffer.push(cleaned);
    }

    flushParagraph();
    if (!blocks.length) {
        blocks.push({ type: "p", text: "暂无可展示的报告内容。" });
    }
    return blocks;
}

function renderReportBlocksHtml(blocks) {
    function stripLeadingIndex(raw) {
        return String(raw || "").replace(/^\s*(?:\d+\s*[.)、]?\s*)+/, "").trim();
    }

    return blocks
        .map((block) => {
            const text = escapeHtml(block.type === "p" ? block.text : stripLeadingIndex(block.text));
            if (block.type === "h1") return `<h1 class="report-title">${text}</h1>`;
            if (block.type === "h2") return `<h2 class="report-section">${text}</h2>`;
            if (block.type === "h3") return `<h3 class="report-subsection">${text}</h3>`;
            return `<p class=\"report-paragraph\">${text}</p>`;
        })
        .join("\n");
}

function createReportMeta() {
    const now = new Date();
    const data = collectGameData() || {};
    const gameData = data.gameData || {};

    return {
        generatedAt: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
        difficulty: sanitizeReportText(gameData.difficulty || "未记录"),
        moveCount: sanitizeReportText(String(gameData.moveCount ?? "未记录")),
        completionTime: sanitizeReportText(String(gameData.completionTime ?? "未记录")),
    };
}

function buildReportBodyHtml(reportMarkdown, reportMeta) {
    const blocks = parseReportBlocks(reportMarkdown);
    const bodyHtml = renderReportBlocksHtml(blocks);

    return `
        <div class="report-page">
            <div class="report-doc">
                <div class="report-header">
                    <h1 class="report-main">心理健康分析报告</h1>
                    <p class="report-note">本报告用于心理状态观察与积极引导，不作为医学诊断依据。</p>
                    <div class="report-meta-grid">
                        <div class="meta-item"><span class="meta-label">生成时间</span><span class="meta-value">${escapeHtml(reportMeta.generatedAt)}</span></div>
                        <div class="meta-item"><span class="meta-label">拼图难度</span><span class="meta-value">${escapeHtml(reportMeta.difficulty)}</span></div>
                        <div class="meta-item"><span class="meta-label">完成用时</span><span class="meta-value">${escapeHtml(reportMeta.completionTime)}</span></div>
                        <div class="meta-item"><span class="meta-label">操作步数</span><span class="meta-value">${escapeHtml(reportMeta.moveCount)}</span></div>
                    </div>
                </div>
                <div class="report-divider"></div>
                ${bodyHtml}
            </div>
        </div>
    `;
}

function reportStyles() {
    return `
        .report-page {
            width: 190mm;
            min-height: 277mm;
            margin: 0 auto;
            background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
            padding: 14mm 14mm 16mm;
            box-sizing: border-box;
            border: 1px solid #dbe7f6;
            border-radius: 10px;
        }
        .report-doc {
            font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif;
            color: #111827;
            letter-spacing: 0.2px;
        }
        .report-header {
            margin-bottom: 8px;
            background: linear-gradient(135deg, #eaf3ff 0%, #f2f9ff 48%, #f3faf6 100%);
            border: 1px solid #d8e6f8;
            border-radius: 12px;
            padding: 14px 16px 12px;
        }
        .report-main {
            font-size: 27px;
            line-height: 1.3;
            text-align: center;
            margin: 0 0 10px;
            font-weight: 700;
            color: #173a63;
        }
        .report-note {
            margin: 0;
            text-align: center;
            color: #35516f;
            font-size: 13px;
            line-height: 1.7;
        }
        .report-meta-grid {
            margin-top: 14px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px 12px;
            font-size: 13px;
        }
        .meta-item {
            display: flex;
            align-items: baseline;
            gap: 8px;
            min-width: 0;
            padding: 6px 8px;
            border-radius: 7px;
            background: rgba(255, 255, 255, 0.74);
        }
        .meta-label { color: #48617e; white-space: nowrap; }
        .meta-value {
            color: #1d3552;
            font-weight: 600;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .report-divider {
            margin: 16px 0 18px;
            border-top: none;
            height: 2px;
            background: linear-gradient(90deg, #7aa7d6 0%, #d4e5f8 55%, #d6ebde 100%);
            border-radius: 999px;
        }
        .report-title {
            font-size: 20px;
            margin: 20px 0 10px;
            color: #1b3552;
            font-weight: 700;
        }
        .report-section {
            font-size: 17px;
            margin: 18px 0 10px;
            padding: 8px 10px;
            color: #173a63;
            background: linear-gradient(90deg, #eaf3ff 0%, #f4f8ff 100%);
            border-left: 4px solid #3b82f6;
            border-radius: 0 8px 8px 0;
            font-weight: 700;
        }
        .report-subsection {
            font-size: 15px;
            margin: 14px 0 8px;
            color: #1e4068;
            font-weight: 600;
            padding-left: 8px;
            border-left: 3px solid #93c5fd;
        }
        .report-paragraph {
            margin: 0 0 12px;
            line-height: 2;
            text-align: justify;
            text-indent: 2em;
            font-size: 14px;
            color: #1f2937;
            word-break: break-word;
        }
    `;
}

function buildPrintDocument(reportMarkdown, reportMeta) {
    const body = buildReportBodyHtml(reportMarkdown, reportMeta);
    return `
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>心理健康分析报告</title>
<style>
    body { margin: 0; background: #f5f5f5; }
    .paper { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; box-sizing: border-box; }
    ${reportStyles()}
    @page { size: A4; margin: 12mm; }
    @media print {
        body { background: #fff; }
        .paper { width: auto; min-height: auto; margin: 0; }
        .report-page { width: auto; min-height: auto; margin: 0; padding: 0; }
    }
</style>
</head>
<body>
    <div class="paper">${body}</div>
</body>
</html>`;
}

function showLoadingModal(message) {
    hideLoadingModal();

    const modal = document.createElement("div");
    modal.id = "loadingModal";
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

    const content = document.createElement("div");
    content.style.cssText = `
        background: white;
        padding: 30px;
        border-radius: 15px;
        text-align: center;
        max-width: 320px;
    `;
    content.innerHTML = `
        <div style="font-size: 28px; margin-bottom: 12px; color: #374151;">请稍候</div>
        <p style="color: #333; font-size: 16px; margin: 0;">${escapeHtml(message)}</p>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);
}

function hideLoadingModal() {
    const modal = document.getElementById("loadingModal");
    if (modal) modal.remove();
}

function loadExternalScript(src, globalName) {
    if (globalName && window[globalName]) {
        return Promise.resolve();
    }

    if (!scriptLoaders[src]) {
        scriptLoaders[src] = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = src;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`脚本加载失败: ${src}`));
            document.head.appendChild(script);
        });
    }
    return scriptLoaders[src];
}

function buildRowInkProfile(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    const width = canvas.width;
    const height = canvas.height;
    const data = ctx.getImageData(0, 0, width, height).data;
    const rowInk = new Uint32Array(height);

    let ptr = 0;
    for (let y = 0; y < height; y += 1) {
        let ink = 0;
        for (let x = 0; x < width; x += 1) {
            const r = data[ptr];
            const g = data[ptr + 1];
            const b = data[ptr + 2];
            const a = data[ptr + 3];
            // 仅统计明显深色像素，避免浅色背景干扰分页判断
            if (a > 40 && (r + g + b) < 690) ink += 1;
            ptr += 4;
        }
        rowInk[y] = ink;
    }
    return rowInk;
}

function collectBlockRanges(reportElement, canvasHeight) {
    const selector = ".report-header,.report-divider,.report-title,.report-section,.report-subsection,.report-paragraph";
    const blocks = Array.from(reportElement.querySelectorAll(selector));
    if (!blocks.length) return [];

    const reportRect = reportElement.getBoundingClientRect();
    const domHeight = Math.max(1, reportElement.scrollHeight || reportRect.height || 1);
    const scaleY = canvasHeight / domHeight;
    const ranges = [];

    for (const block of blocks) {
        const rect = block.getBoundingClientRect();
        const top = Math.max(0, Math.round((rect.top - reportRect.top) * scaleY));
        const bottom = Math.min(canvasHeight, Math.round((rect.bottom - reportRect.top) * scaleY));
        if (bottom - top >= 4) ranges.push({ top, bottom });
    }

    ranges.sort((a, b) => a.top - b.top);
    return ranges;
}

function chooseSmartPageBreak(blockRanges, rowInk, startY, targetY, maxY, pagePixelHeight, canvasWidth) {
    if (targetY >= maxY) return maxY;
    const minSlice = Math.max(80, Math.floor(pagePixelHeight * 0.62));

    // 优先按段落边界分页，避免切断文本
    if (Array.isArray(blockRanges) && blockRanges.length) {
        let backwardCandidate = -1;
        for (const range of blockRanges) {
            if (range.bottom <= targetY && range.bottom > startY + minSlice) {
                backwardCandidate = Math.max(backwardCandidate, range.bottom);
            }
        }
        if (backwardCandidate > 0) return Math.min(backwardCandidate, maxY);

        const forwardLimit = Math.min(maxY, targetY + Math.floor(pagePixelHeight * 0.18));
        for (const range of blockRanges) {
            if (range.top > targetY && range.top <= forwardLimit && range.top > startY + minSlice) {
                return range.top;
            }
        }
    }

    // 段落边界不可用时，退化为像素密度分页
    if (!rowInk || !rowInk.length) return Math.min(targetY, maxY);
    const searchRadius = Math.max(32, Math.floor(pagePixelHeight * 0.2));
    const from = Math.max(startY + minSlice, targetY - searchRadius);
    const to = Math.min(maxY - 1, targetY + searchRadius);
    if (from >= to) return Math.min(targetY, maxY);

    let bestY = targetY;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let y = from; y <= to; y += 1) {
        let inkScore = 0;
        for (let k = -3; k <= 3; k += 1) {
            const yy = Math.min(maxY - 1, Math.max(0, y + k));
            inkScore += rowInk[yy] || 0;
        }
        const distancePenalty = Math.abs(y - targetY) * 0.28;
        const score = inkScore + distancePenalty;
        if (score < bestScore) {
            bestScore = score;
            bestY = y;
        }
    }

    const denseThreshold = Math.floor(canvasWidth * 0.03) * 7;
    if (bestScore > denseThreshold) return Math.min(targetY, maxY);
    return Math.min(Math.max(bestY, startY + 20), maxY);
}

async function exportReportToPdf(reportMarkdown, reportMeta) {
    const reportElement = document.getElementById("reportDocForExport");
    if (!reportElement) {
        alert("报告内容不存在，无法导出");
        return;
    }

    showLoadingModal("正在导出 PDF，请稍候...");
    try {
        await Promise.all([
            loadExternalScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js", "html2canvas"),
            loadExternalScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js", "jspdf"),
        ]);

        const { jsPDF } = window.jspdf;
        const canvas = await window.html2canvas(reportElement, {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
        });

        const pdf = new jsPDF("p", "mm", "a4");
        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 10;
        const contentWidth = pageWidth - margin * 2;
        const topInset = 10;
        const bottomInset = 12;
        const pagePixelHeight = Math.floor((pageHeight - topInset - bottomInset) * canvas.width / contentWidth);
        const blockRanges = collectBlockRanges(reportElement, canvas.height);
        const rowInk = buildRowInkProfile(canvas);
        const seamOverlap = 2;

        let y = 0;
        let pageIndex = 0;
        while (y < canvas.height) {
            const targetY = Math.min(y + pagePixelHeight, canvas.height);
            let nextY = chooseSmartPageBreak(blockRanges, rowInk, y, targetY, canvas.height, pagePixelHeight, canvas.width);
            if (nextY <= y + 10) nextY = targetY;
            const sliceEnd = Math.min(canvas.height, nextY);
            const sliceHeight = Math.max(1, sliceEnd - y);
            const pageCanvas = document.createElement("canvas");
            pageCanvas.width = canvas.width;
            pageCanvas.height = sliceHeight;

            const ctx = pageCanvas.getContext("2d");
            ctx.drawImage(canvas, 0, y, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

            const imgData = pageCanvas.toDataURL("image/jpeg", 0.95);
            const renderedHeight = sliceHeight * contentWidth / canvas.width;

            if (pageIndex > 0) pdf.addPage();
            pdf.addImage(imgData, "JPEG", margin, topInset, contentWidth, renderedHeight);

            if (sliceEnd >= canvas.height) break;
            y = Math.max(y + 1, sliceEnd - seamOverlap);
            pageIndex += 1;
        }

        const totalPages = pdf.getNumberOfPages();
        const footerStamp = (reportMeta?.generatedAt || "").replace(/[^0-9:-\s]/g, "");
        for (let i = 1; i <= totalPages; i += 1) {
            pdf.setPage(i);
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(9);
            pdf.setTextColor(110, 110, 110);
            pdf.text(`${footerStamp}`, pageWidth / 2, pageHeight - 5.5, { align: "center" });
            pdf.text(`Page ${i}/${totalPages}`, pageWidth - margin, pageHeight - 5.5, { align: "right" });
        }

        const now = new Date();
        const filename = `mental_health_report_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}.pdf`;
        pdf.save(filename);
    } catch (error) {
        console.error("PDF导出失败:", error);
        alert("自动导出失败，将切换到打印导出模式。请在打印窗口选择“另存为 PDF”。");
        exportReportByPrint(reportMarkdown, reportMeta);
    } finally {
        hideLoadingModal();
    }
}

function exportReportByPrint(reportMarkdown, reportMeta) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
        alert("浏览器阻止了弹窗，请允许弹窗后重试。\n也可手动使用浏览器打印为 PDF。\n");
        return;
    }

    const doc = buildPrintDocument(reportMarkdown, reportMeta);
    printWindow.document.open();
    printWindow.document.write(doc);
    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
        printWindow.print();
    }, 300);
}

async function generatePsychologyReport() {
    try {
        const data = collectGameData();
        if (!data) {
            alert("无法收集游戏数据");
            return;
        }

        const imageCheck = await validateImage(data.imageSource);
        if (!imageCheck?.valid) {
            alert(imageCheck?.message || "图片校验失败，请选择包含房子、树、人物三要素的图片。");
            return;
        }

        showLoadingModal("正在生成心理分析报告，请稍候...");
        const response = await fetch(`${API_BASE_URL}/api/generate-report`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        const result = await response.json();
        hideLoadingModal();

        if (response.ok && result.success) {
            showReportModal(result.report);
        } else if (response.status === 403) {
            alert(`提示：${result.message || "无法分析此图片"}\n\n请选择游戏提供的标准房树人图像。`);
        } else {
            alert(`生成报告失败：${result.message || result.error || "未知错误"}`);
        }
    } catch (error) {
        hideLoadingModal();
        console.error("生成报告时出错:", error);
        alert(`网络错误：${error.message}\n\n请确保后端服务已启动（http://localhost:5000）`);
    }
}

function showReportModal(reportMarkdown) {
    const reportMeta = createReportMeta();

    const modal = document.createElement("div");
    modal.id = "reportModal";
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

    const content = document.createElement("div");
    content.style.cssText = `
        background: #f3f4f6;
        padding: 20px;
        border-radius: 16px;
        max-width: 860px;
        width: 100%;
        max-height: 86vh;
        overflow-y: auto;
        position: relative;
    `;

    const toolbar = document.createElement("div");
    toolbar.style.cssText = `
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 10px;
        margin-bottom: 14px;
        position: sticky;
        top: 0;
        z-index: 1;
        background: #f3f4f6;
        padding: 4px 0 8px;
    `;

    const exportBtn = document.createElement("button");
    exportBtn.textContent = "导出 PDF";
    exportBtn.style.cssText = `
        border: none;
        background: #1d4ed8;
        color: white;
        padding: 9px 16px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
    `;
    exportBtn.onclick = () => exportReportToPdf(reportMarkdown, reportMeta);

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "关闭";
    closeBtn.style.cssText = `
        border: none;
        background: #e5e7eb;
        color: #111827;
        padding: 8px 14px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
    `;
    closeBtn.onclick = () => modal.remove();

    const reportDiv = document.createElement("div");
    reportDiv.id = "reportDocForExport";
    reportDiv.style.cssText = `
        padding: 12px;
        background: #e5e7eb;
        border-radius: 12px;
    `;

    const styleTag = document.createElement("style");
    styleTag.textContent = reportStyles();
    reportDiv.innerHTML = buildReportBodyHtml(reportMarkdown, reportMeta);

    toolbar.appendChild(exportBtn);
    toolbar.appendChild(closeBtn);
    content.appendChild(toolbar);
    content.appendChild(styleTag);
    content.appendChild(reportDiv);
    modal.appendChild(content);
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.remove();
    });
}

window.addEventListener("DOMContentLoaded", () => {
    const reportBtn = document.getElementById("viewReportBtn");
    if (reportBtn) {
        reportBtn.onclick = generatePsychologyReport;
    }
    console.log("心理分析报告功能已加载");
    console.log("后端API地址:", API_BASE_URL);
});
