(function () {
  const API_BASE_URL = (typeof window.API_BASE_URL === 'string')
    ? window.API_BASE_URL
    : ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:5000'
      : '');
  window.API_BASE_URL = API_BASE_URL;

  function showPage(pageId) {
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    const page = document.getElementById(pageId);
    if (page) page.classList.add('active');
  }
  window.showPage = showPage;

  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }

  function getOrCreateClientId() {
    const key = 'puzzle_client_id';
    const existing = localStorage.getItem(key);
    if (existing) return existing;

    let created = '';
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      created = window.crypto.randomUUID();
    } else {
      const seed = Math.random().toString(36).slice(2);
      created = `web-${Date.now()}-${seed}`;
    }
    localStorage.setItem(key, created);
    return created;
  }

  class PuzzleApi {
    constructor(baseUrl) { this.baseUrl = baseUrl; }

    async request(path, options = {}) {
      const res = await fetch(`${this.baseUrl}${path}`, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
      });
      let body = {};
      try { body = await res.json(); } catch (e) { body = {}; }
      if (!res.ok) throw new Error(body.error || body.message || `请求失败(${res.status})`);
      return body;
    }

    createGame(payload) {
      return this.request('/api/puzzle/games', { method: 'POST', body: JSON.stringify(payload) });
    }

    action(gameId, action, payload = {}, meta = {}) {
      return this.request(`/api/puzzle/games/${gameId}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action, payload, ...meta }),
      });
    }
  }

  class PuzzleGame {
    constructor(api) {
      this.api = api;
      this.gameId = null;
      this.serverState = null;
      this.originalImage = null;
      this.imageSource = '';
      this.gridSize = 3;
      this.modifiers = { rotation: false, hidden: false, trickster: false };
      this.gameState = 'waiting';
      this.moveCount = 0;
      this.startTime = null;
      this.lastMetrics = { pieceOrder: [], timeIntervals: [], modificationCount: 0 };
      this.clientId = getOrCreateClientId();

      this.selected = null;
      this.actionInFlight = false;
      this.dragMeta = null;
      this.dragThreshold = 10;
      this.touchCtx = null;
      this.dragGhost = null;
      this.completionHandled = false;

      this.gridContainer = document.getElementById('gridContainer');
      this.piecesContainer = document.getElementById('piecesContainer');
      this.gameHint = document.getElementById('gameHint');
      this.messageEl = document.getElementById('message');
      this.reshuffleBtn = document.getElementById('reshuffleBtn');
      this.undoBtn = document.getElementById('undoBtn');
      this.rotateBtn = document.getElementById('rotateBtn');
      this.solveBtn = document.getElementById('solveBtn');

      this.initEvents();
    }

    initEvents() {
      document.getElementById('generateBtn').addEventListener('click', async () => {
        this.gridSize = parseInt(document.getElementById('gridSize').value, 10);
        await this.generatePuzzle();
        showPage('pageGame');
      });
      this.reshuffleBtn.addEventListener('click', () => this.requestAction('shuffle'));
      this.undoBtn.addEventListener('click', () => this.requestAction('undo'));
      this.solveBtn.addEventListener('click', () => this.requestAction('solve'));
      this.rotateBtn.addEventListener('click', () => this.rotateSelectedPiece());

      document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !this.undoBtn.disabled) {
          e.preventDefault();
          this.requestAction('undo');
        }
      });
    }

    resetGame() {
      this.gameId = null;
      this.serverState = null;
      this.gameState = 'waiting';
      this.moveCount = 0;
      this.startTime = null;
      this.lastMetrics = { pieceOrder: [], timeIntervals: [], modificationCount: 0 };
      this.selected = null;
      this.dragMeta = null;
      this.touchCtx = null;
      this.clearDragVisual();
      this.clearDragOver();

      this.gridContainer.innerHTML = '';
      this.gridContainer.style.display = 'none';
      this.piecesContainer.innerHTML = '<span style="color: #aaa; font-size: 0.85rem;">生成拼图后显示碎片</span>';
      this.gameHint.style.display = 'block';
      this.messageEl.textContent = '点按碎片，再点按格子放置';

      this.reshuffleBtn.disabled = true;
      this.undoBtn.disabled = true;
      this.solveBtn.disabled = true;
      this.rotateBtn.style.display = 'none';
      this.rotateBtn.disabled = true;
      this.completionHandled = false;
    }

    setBusy(busy, tip = '') {
      this.actionInFlight = busy;
      if (tip) this.messageEl.textContent = tip;
      if (this.serverState) this.updateButtons(this.serverState);
    }

    async generatePuzzle() {
      if (!this.originalImage || !this.imageSource) {
        alert('请先选择图片');
        return;
      }
      const modifiers = {
        rotation: document.getElementById('enableRotation')?.checked || false,
        hidden: document.getElementById('enableHidden')?.checked || false,
        trickster: document.getElementById('enableTrickster')?.checked || false,
      };

      this.setBusy(true, '正在生成拼图...');
      try {
        const res = await this.api.createGame({
          imageSource: this.imageSource,
          gridSize: this.gridSize,
          modifiers,
          clientId: this.clientId,
        });
        this.applyState(res.state);
      } catch (error) {
        alert(`生成拼图失败：${error.message}`);
      } finally {
        this.setBusy(false);
      }
    }

    async requestAction(action, payload = {}) {
      if (!this.gameId || this.actionInFlight) return;
      this.setBusy(true);
      try {
        const res = await this.api.action(this.gameId, action, payload, { clientId: this.clientId });
        this.applyState(res.state);
      } catch (error) {
        alert(`操作失败：${error.message}`);
      } finally {
        this.setBusy(false);
      }
    }

    applyState(state) {
      this.serverState = state;
      this.gameId = state.gameId;
      this.gridSize = state.gridSize;
      this.modifiers = state.modifiers || this.modifiers;
      this.gameState = state.gameState;
      this.moveCount = state.moveCount || 0;
      this.startTime = Date.now() - (state.elapsedSeconds || 0) * 1000;
      this.lastMetrics = state.metrics || this.lastMetrics;
      if (state.gameState !== 'completed') this.completionHandled = false;

      this.renderState(state);
      this.clearSelection();
      this.updateButtons(state);
      this.messageEl.textContent = state.message || '点按碎片，再点按格子放置';

      if (state.completion?.isCompleted && !this.completionHandled) this.showComplete(state);
    }

    updateButtons(state) {
      const hasGame = Boolean(this.gameId);
      this.reshuffleBtn.disabled = !hasGame || this.actionInFlight;
      this.undoBtn.disabled = !hasGame || this.actionInFlight || !state.canUndo;
      this.solveBtn.disabled = !hasGame || this.actionInFlight;

      if (state.modifiers?.rotation) {
        this.rotateBtn.style.display = 'inline-block';
        this.rotateBtn.disabled = !this.selected || this.actionInFlight;
      } else {
        this.rotateBtn.style.display = 'none';
        this.rotateBtn.disabled = true;
      }
    }

    renderState(state) {
      if (!this.originalImage) return;
      this.gridContainer.innerHTML = '';
      this.piecesContainer.innerHTML = '';
      this.gameHint.style.display = 'none';
      this.gridContainer.style.display = 'grid';
      this.updateGridDimensions();
      this.gridContainer.style.gridTemplateColumns = `repeat(${this.gridSize}, 1fr)`;
      this.gridContainer.style.gridTemplateRows = `repeat(${this.gridSize}, 1fr)`;

      state.board.forEach((piece, index) => {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.dataset.index = String(index);
        cell.dataset.row = String(Math.floor(index / this.gridSize));
        cell.dataset.col = String(index % this.gridSize);
        cell.addEventListener('click', (e) => { e.stopPropagation(); this.onCellClick(index); });
        cell.addEventListener('dragover', (e) => { if (!this.dragMeta) return; e.preventDefault(); cell.classList.add('drag-over'); });
        cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
        cell.addEventListener('drop', (e) => {
          e.preventDefault();
          cell.classList.remove('drag-over');
          if (this.dragMeta) this.handleDrop(this.dragMeta, index);
        });

        if (piece) cell.appendChild(this.createPieceElement(piece, 'board', index));
        this.gridContainer.appendChild(cell);
      });

      if (state.tray.length === 0) {
        const info = document.createElement('span');
        info.style.color = '#aaa';
        info.style.fontSize = '0.85rem';
        info.textContent = state.completion?.isCompleted ? '全部碎片已放入拼图' : '托盘为空，可继续交换格子';
        this.piecesContainer.appendChild(info);
      } else {
        state.tray.forEach((piece) => this.piecesContainer.appendChild(this.createPieceElement(piece, 'tray', null)));
      }
    }
    updateGridDimensions() {
      const width = this.originalImage.naturalWidth || this.originalImage.width || 1;
      const height = this.originalImage.naturalHeight || this.originalImage.height || 1;
      const ratio = width / height;
      const maxW = Math.min(window.innerWidth - 40, 360);
      const maxH = 400;
      let w;
      let h;
      if (ratio >= 1) {
        w = maxW;
        h = w / ratio;
        if (h > maxH) { h = maxH; w = h * ratio; }
      } else {
        h = maxH;
        w = h * ratio;
        if (w > maxW) { w = maxW; h = w / ratio; }
      }
      this.gridContainer.style.width = `${w}px`;
      this.gridContainer.style.height = `${h}px`;
    }

    createPieceElement(piece, source, cellIndex) {
      const el = document.createElement('div');
      el.className = source === 'board' ? 'puzzle-piece' : 'piece-item';
      el.dataset.pieceId = piece.id;
      el.dataset.source = source;
      if (source === 'board' && cellIndex !== null) el.dataset.cellIndex = String(cellIndex);
      el.dataset.originalRow = String(piece.originalRow);
      el.dataset.originalCol = String(piece.originalCol);
      this.applyPieceStyle(el, piece);
      this.bindPieceInteractions(el, { source, pieceId: piece.id, cellIndex });
      return el;
    }

    applyPieceStyle(el, piece) {
      const denom = Math.max(1, this.gridSize - 1);
      const posX = (piece.originalCol / denom) * 100;
      const posY = (piece.originalRow / denom) * 100;
      el.style.backgroundImage = `url(${this.imageSource})`;
      el.style.backgroundSize = `${this.gridSize * 100}% ${this.gridSize * 100}%`;
      el.style.backgroundPosition = `${posX}% ${posY}%`;
      if (piece.rotated) {
        el.style.transform = 'rotate(180deg)';
        el.dataset.rotated = 'true';
      } else {
        el.style.transform = '';
        el.dataset.rotated = 'false';
      }
    }

    bindPieceInteractions(el, meta) {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.actionInFlight || this.gameState !== 'playing') return;
        this.onPieceClick(meta);
      });

      el.draggable = true;
      el.addEventListener('dragstart', (e) => {
        if (this.actionInFlight || this.gameState !== 'playing') { e.preventDefault(); return; }
        this.dragMeta = meta;
        this.clearSelection();
        this.messageEl.textContent = '拖动到目标格子放置';
        el.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', meta.pieceId);
        }
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        this.dragMeta = null;
        this.clearDragOver();
      });

      el.addEventListener('touchstart', (e) => this.onTouchStart(e, meta, el), { passive: false });
      el.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
      el.addEventListener('touchend', (e) => this.onTouchEnd(e, meta), { passive: false });
    }

    onTouchStart(e, meta, el) {
      if (this.actionInFlight || this.gameState !== 'playing') return;
      const touch = e.touches[0];
      this.touchCtx = { x: touch.clientX, y: touch.clientY, meta, el, dragging: false };
    }

    onTouchMove(e) {
      if (!this.touchCtx || this.actionInFlight || this.gameState !== 'playing') return;
      const touch = e.touches[0];
      const dx = touch.clientX - this.touchCtx.x;
      const dy = touch.clientY - this.touchCtx.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (!this.touchCtx.dragging && dist > this.dragThreshold) {
        this.touchCtx.dragging = true;
        this.startDragVisual(touch, this.touchCtx.el);
      }
      if (this.touchCtx.dragging) {
        e.preventDefault();
        this.updateDragVisual(touch);
      }
    }

    onTouchEnd(e, meta) {
      if (!this.touchCtx) return;
      const touch = e.changedTouches[0];
      if (this.touchCtx.dragging) {
        e.preventDefault();
        const cell = this.getCellAtPosition(touch.clientX, touch.clientY);
        if (cell) this.handleDrop(meta, parseInt(cell.dataset.index, 10));
      } else if (!this.actionInFlight && this.gameState === 'playing') {
        this.onPieceClick(meta);
      }
      this.clearDragVisual();
      this.clearDragOver();
      this.touchCtx = null;
    }

    startDragVisual(touch, el) {
      this.clearSelection();
      this.messageEl.textContent = '拖动到目标格子放置';
      this.dragGhost = document.createElement('div');
      this.dragGhost.className = 'drag-ghost';
      this.dragGhost.style.backgroundImage = el.style.backgroundImage;
      this.dragGhost.style.backgroundSize = el.style.backgroundSize;
      this.dragGhost.style.backgroundPosition = el.style.backgroundPosition;
      this.dragGhost.style.width = '60px';
      this.dragGhost.style.height = '60px';
      this.dragGhost.style.left = `${touch.clientX}px`;
      this.dragGhost.style.top = `${touch.clientY}px`;
      if (el.dataset.rotated === 'true') {
        this.dragGhost.style.transform = 'translate(-50%, -50%) scale(1.1) rotate(180deg)';
      }
      el.classList.add('dragging');
      document.body.appendChild(this.dragGhost);
    }

    updateDragVisual(touch) {
      if (this.dragGhost) {
        this.dragGhost.style.left = `${touch.clientX}px`;
        this.dragGhost.style.top = `${touch.clientY}px`;
      }
      this.clearDragOver();
      const cell = this.getCellAtPosition(touch.clientX, touch.clientY);
      if (cell) cell.classList.add('drag-over');
    }

    clearDragVisual() {
      if (this.touchCtx?.el) this.touchCtx.el.classList.remove('dragging');
      if (this.dragGhost) {
        this.dragGhost.remove();
        this.dragGhost = null;
      }
    }

    clearDragOver() {
      this.gridContainer.querySelectorAll('.grid-cell.drag-over').forEach((cell) => {
        cell.classList.remove('drag-over');
      });
    }

    getCellAtPosition(x, y) {
      const cells = this.gridContainer.querySelectorAll('.grid-cell');
      for (const cell of cells) {
        const rect = cell.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return cell;
      }
      return null;
    }

    onPieceClick(meta) {
      if (meta.source === 'tray') this.selectPiece(meta, '请点按一个格子放置碎片');
      else this.selectPiece(meta, '请点按另一个格子交换位置');
    }

    onCellClick(index) {
      if (this.actionInFlight || this.gameState !== 'playing') return;
      const piece = this.serverState?.board?.[index];
      if (!this.selected) {
        if (piece) this.selectPiece({ source: 'board', pieceId: piece.id, cellIndex: index }, '请点按另一个格子交换位置');
        return;
      }
      if (this.selected.source === 'tray') {
        this.requestAction('place_from_tray', { pieceId: this.selected.pieceId, targetIndex: index });
        return;
      }
      if (this.selected.source === 'board') {
        if (this.selected.cellIndex === index) { this.clearSelection(); return; }
        this.requestAction('move_cell', { sourceIndex: this.selected.cellIndex, targetIndex: index });
      }
    }

    handleDrop(meta, targetIndex) {
      if (this.actionInFlight || this.gameState !== 'playing') return;
      if (meta.source === 'tray') {
        this.requestAction('place_from_tray', { pieceId: meta.pieceId, targetIndex });
      } else if (meta.source === 'board' && meta.cellIndex !== targetIndex) {
        this.requestAction('move_cell', { sourceIndex: meta.cellIndex, targetIndex });
      }
    }

    selectPiece(meta, msg) {
      this.clearSelection();
      this.selected = { ...meta };
      const el = this.findPieceElement(meta);
      if (el) el.classList.add('selected');
      this.messageEl.textContent = msg;
      if (this.serverState) this.updateButtons(this.serverState);
    }

    clearSelection() {
      this.selected = null;
      document.querySelectorAll('.piece-item.selected, .puzzle-piece.selected').forEach((el) => el.classList.remove('selected'));
      if (this.serverState) this.updateButtons(this.serverState);
    }

    findPieceElement(meta) {
      if (meta.source === 'tray') return this.piecesContainer.querySelector(`.piece-item[data-piece-id="${meta.pieceId}"]`);
      return this.gridContainer.querySelector(`.puzzle-piece[data-piece-id="${meta.pieceId}"][data-cell-index="${meta.cellIndex}"]`);
    }

    rotateSelectedPiece() {
      if (!this.selected || !this.modifiers.rotation) return;
      this.requestAction('rotate_piece', { pieceId: this.selected.pieceId });
    }

    showComplete(state) {
      this.completionHandled = true;
      document.getElementById('completeTime').textContent = state.metrics?.completionTime || state.elapsedFormatted || '00:00';
      document.getElementById('completeSteps').textContent = String(state.moveCount || 0);

      // Save game data for report generation
      const reportData = this.getReportData();
      localStorage.setItem('lastCompletedGame', JSON.stringify(reportData));
      window.puzzleGame = this;
      window.currentPuzzleGameData = reportData.gameData;
      window.currentPuzzleImageSource = reportData.imageSource;
      window.currentPuzzleGameId = reportData.gameId;

      // 触发拼图完成事件，通知重置报告生成按钮
      window.dispatchEvent(new CustomEvent('puzzleCompleted'));

      setTimeout(() => {
        showPage('pageComplete');
        if (!localStorage.getItem('surveyShown')) {
          localStorage.setItem('surveyShown', 'true');
          setTimeout(() => document.getElementById('surveyModal').classList.add('active'), 800);
        }
      }, 400);
    }

    getReportData() {
      const metrics = this.serverState?.metrics || this.lastMetrics || {};
      return {
        imageSource: this.imageSource,
        clientId: this.clientId,
        gameId: this.gameId,
        gameData: {
          completionTime: metrics.completionTime || formatTime(this.serverState?.elapsedSeconds || 0),
          moveCount: this.serverState?.moveCount || this.moveCount || 0,
          difficulty: `${this.gridSize}x${this.gridSize}`,
          gridSize: this.gridSize,
          modifiers: this.modifiers,
          pieceOrder: metrics.pieceOrder || [],
          timeIntervals: metrics.timeIntervals || [],
          modificationCount: metrics.modificationCount || 0,
        },
      };
    }
  }
  function updateDifficultyModifiers() {
    const gridSize = parseInt(document.getElementById('gridSize').value, 10);
    const container = document.getElementById('difficultyModifiers');
    const rotationMod = document.getElementById('modifierRotation');
    const hiddenMod = document.getElementById('modifierHidden');
    const tricksterMod = document.getElementById('modifierTrickster');

    if (gridSize < 3) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'flex';
    rotationMod.style.display = gridSize >= 3 ? 'flex' : 'none';
    hiddenMod.style.display = gridSize >= 4 ? 'flex' : 'none';
    tricksterMod.style.display = gridSize >= 5 ? 'flex' : 'none';
    tricksterMod.title = `在随机时段随机移动${gridSize >= 6 ? 5 : '1~3'}个拼图碎片`;
  }

  function initNavigation(game) {
    document.getElementById('startBtn').addEventListener('click', () => showPage('pageControl'));
    document.getElementById('backToHome').addEventListener('click', () => showPage('pageHome'));
    document.getElementById('backToControl').addEventListener('click', () => showPage('pageControl'));
    document.getElementById('playAgainBtn').addEventListener('click', () => {
      showPage('pageControl');
      game.resetGame();
    });
    document.getElementById('backHomeBtn').addEventListener('click', () => showPage('pageHome'));
  }

  function initSurveyModal() {
    const surveyModal = document.getElementById('surveyModal');
    document.getElementById('surveyBtn').addEventListener('click', () => surveyModal.classList.add('active'));
    document.getElementById('closeSurvey').addEventListener('click', () => surveyModal.classList.remove('active'));
    surveyModal.addEventListener('click', (e) => {
      if (e.target === surveyModal) surveyModal.classList.remove('active');
    });
  }

  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.readAsDataURL(file);
    });
  }

  function initImageSelector(game) {
    const imageList = [
      { name: '图片1', file: 'photo/1.png' },
      { name: '图片2', file: 'photo/2.png' },
      { name: '图片3', file: 'photo/3.jpg' },
      { name: '图片4', file: 'photo/4.jpg' },
    ];

    const imageModal = document.getElementById('imageModal');
    const imageGrid = document.getElementById('imageGrid');
    const selectImageBtn = document.getElementById('selectImageBtn');
    const imageSelector = document.getElementById('imageSelector');
    const closeModal = document.getElementById('closeModal');
    const customImageBtn = document.getElementById('customImageBtn');
    const customImageInput = document.getElementById('customImageInput');
    const previewImage = document.getElementById('previewImage');
    const placeholderContent = document.getElementById('placeholderContent');
    const generateBtn = document.getElementById('generateBtn');

    function applySelectedImage(src) {
      imageModal.classList.remove('active');
      const img = new Image();
      img.onload = () => {
        game.originalImage = img;
        game.imageSource = src;
        previewImage.src = src;
        previewImage.style.display = 'block';
        placeholderContent.style.display = 'none';
        imageSelector.classList.add('has-image');
        selectImageBtn.textContent = '🔄 重新选择';
        generateBtn.disabled = false;
      };
      img.onerror = () => alert('图片加载失败，请重新选择');
      img.src = src;
    }

    async function validateCustomImage(src) {
      const res = await fetch(`${API_BASE_URL}/api/validate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageSource: src, purpose: 'upload' }),
      });
      let body = {};
      try { body = await res.json(); } catch (e) { body = {}; }
      if (!res.ok) {
        throw new Error(body.error || body.message || `图片校验失败(${res.status})`);
      }
      return body;
    }

    imageList.forEach((img) => {
      const option = document.createElement('div');
      option.className = 'image-option';
      option.innerHTML = `<img src="${img.file}" alt="${img.name}">`;
      option.addEventListener('click', () => applySelectedImage(img.file));
      imageGrid.appendChild(option);
    });

    async function handleFile(file) {
      if (!file) return;
      if (file.type && !file.type.startsWith('image/')) {
        alert('仅支持上传图片文件');
        return;
      }
      try {
        customImageBtn.disabled = true;
        customImageBtn.textContent = '⏳ 校验中...';
        const src = await readImageFile(file);
        if (typeof src !== 'string' || !src.startsWith('data:image/')) {
          alert('文件不是可识别的图片格式');
          return;
        }
        const check = await validateCustomImage(src);
        if (!check?.valid) {
          alert(check?.message || '上传图片未通过校验，请确保同时包含房子、树、人物三种元素。');
          return;
        }
        applySelectedImage(src);
      } catch (error) {
        alert(error.message || '读取图片失败');
      } finally {
        customImageBtn.disabled = false;
        customImageBtn.textContent = '📷 自定义图片';
      }
    }

    function bindDrop(area) {
      area.addEventListener('dragover', (e) => e.preventDefault());
      area.addEventListener('drop', async (e) => {
        e.preventDefault();
        const file = e.dataTransfer?.files?.[0];
        await handleFile(file);
      });
    }

    bindDrop(imageSelector);
    const modalContent = document.querySelector('.image-modal-content');
    if (modalContent) bindDrop(modalContent);

    selectImageBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      imageModal.classList.add('active');
    });
    imageSelector.addEventListener('click', () => imageModal.classList.add('active'));
    closeModal.addEventListener('click', () => imageModal.classList.remove('active'));
    imageModal.addEventListener('click', (e) => {
      if (e.target === imageModal) imageModal.classList.remove('active');
    });

    customImageBtn.addEventListener('click', () => customImageInput.click());
    customImageInput.addEventListener('change', async (e) => {
      await handleFile(e.target.files?.[0]);
    });
  }

  class Tutorial {
    constructor() {
      this.overlay = document.getElementById('tutorialOverlay');
      this.tipBox = document.getElementById('tutorialTip');
      this.tipText = document.getElementById('tutorialText');
      this.isActive = false;
      document.getElementById('tutorialBtn').addEventListener('click', () => this.start());
    }

    start() {
      if (this.isActive) return;
      this.isActive = true;
      this.overlay.classList.add('active');
      this.tipText.textContent = '点按碎片选中再点按格子放置，或直接拖动碎片到格子。支持回退按钮和 Ctrl/Cmd + Z。';
      this.tipBox.style.top = '50%';
      this.tipBox.style.left = '50%';
      this.tipBox.style.transform = 'translate(-50%, -50%)';
      this.overlay.addEventListener('click', () => this.end(), { once: true });
    }

    end() {
      this.isActive = false;
      this.overlay.classList.remove('active');
    }
  }

  class MusicPlayer {
    constructor() {
      this.btn = document.getElementById('musicBtn');
      this.panel = document.getElementById('musicPanel');
      this.overlay = document.getElementById('musicOverlay');
      this.isOpen = false;
      this.btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle();
      });
      this.overlay.addEventListener('click', () => this.close());
    }

    toggle() { this.isOpen ? this.close() : this.open(); }
    open() {
      this.isOpen = true;
      this.panel.classList.add('active');
      this.overlay.classList.add('active');
      this.btn.classList.add('active');
    }
    close() {
      this.isOpen = false;
      this.panel.classList.remove('active');
      this.overlay.classList.remove('active');
      this.btn.classList.remove('active');
    }
  }

  function initPreviewModal(game) {
    const previewBtn = document.getElementById('previewOriginalBtn');
    const previewModal = document.getElementById('previewModal');
    const previewImg = document.getElementById('previewModalImage');
    const closeBtn = document.getElementById('closePreview');

    previewBtn.addEventListener('click', () => {
      if (game.originalImage && game.imageSource) {
        previewImg.src = game.imageSource;
        previewModal.classList.add('active');
      } else {
        alert('请先选择图片');
      }
    });

    closeBtn.addEventListener('click', () => previewModal.classList.remove('active'));
    previewModal.addEventListener('click', (e) => {
      if (e.target === previewModal) previewModal.classList.remove('active');
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    const game = new PuzzleGame(new PuzzleApi(API_BASE_URL));
    window.puzzleGame = game;

    initNavigation(game);
    initSurveyModal();
    initImageSelector(game);
    initPreviewModal(game);
    window.tutorial = new Tutorial();
    window.musicPlayer = new MusicPlayer();

    document.getElementById('gridSize').addEventListener('change', updateDifficultyModifiers);
    updateDifficultyModifiers();
    game.resetGame();
  });
})();
