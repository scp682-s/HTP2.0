import copy
import random
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple


class PuzzleError(ValueError):
    """业务校验异常。"""


@dataclass(frozen=True)
class Piece:
    piece_id: str
    original_row: int
    original_col: int


@dataclass
class PuzzleMetrics:
    piece_order: List[str] = field(default_factory=list)
    placed_once: Set[str] = field(default_factory=set)
    action_timestamps: List[float] = field(default_factory=list)
    time_intervals: List[float] = field(default_factory=list)
    modification_count: int = 0


@dataclass
class PuzzleGameState:
    game_id: str
    image_source: str
    grid_size: int
    modifiers: Dict[str, bool]
    pieces: Dict[str, Piece]
    board: List[Optional[str]]
    tray: List[str]
    hidden_pool: Set[str]
    rotations: Set[str]
    started_at: float
    game_state: str = "playing"
    move_count: int = 0
    trickster_triggered: bool = False
    history: List[Dict[str, Any]] = field(default_factory=list)
    metrics: PuzzleMetrics = field(default_factory=PuzzleMetrics)
    last_message: str = "点按碎片，再点按格子放置"
    last_active_at: float = field(default_factory=time.time)


class PuzzleEngine:
    """服务端拼图引擎：前端只渲染，状态与规则统一在后端维护。"""

    def __init__(self, max_games: int = 200, ttl_seconds: int = 7200, max_undo: int = 300):
        self.max_games = max_games
        self.ttl_seconds = ttl_seconds
        self.max_undo = max_undo
        self.games: Dict[str, PuzzleGameState] = {}
        self.random = random.SystemRandom()
        self.lock = threading.RLock()

    # -------------------- 对外方法 --------------------
    def create_game(self, image_source: str, grid_size: int, modifiers: Dict[str, Any]) -> Dict[str, Any]:
        with self.lock:
            self._cleanup_expired_games()
            if len(self.games) >= self.max_games:
                self._evict_oldest_game()

            size = self._validate_grid_size(grid_size)
            normalized_modifiers = self._normalize_modifiers(modifiers)

            pieces = self._build_pieces(size)
            piece_ids = list(pieces.keys())
            shuffled = piece_ids[:]
            self.random.shuffle(shuffled)

            rotation_count = 3 if size >= 6 else 1
            # 隐藏碎片数量：4x4隐藏1个，5x5隐藏2-3个，6x6+隐藏4个
            if size == 4:
                hidden_count = 1
            elif size == 5:
                hidden_count = 3
            else:
                hidden_count = 4

            rotations: Set[str] = set()
            hidden_pool: Set[str] = set()

            if normalized_modifiers["rotation"]:
                rotations = set(self._sample(shuffled, min(rotation_count, len(shuffled))))

            if normalized_modifiers["hidden"]:
                candidates = [pid for pid in shuffled if pid not in rotations]
                max_hidden = max(0, len(candidates) - 1)
                hidden_pool = set(self._sample(candidates, min(hidden_count, max_hidden)))

            tray = [pid for pid in shuffled if pid not in hidden_pool]
            board = [None for _ in range(size * size)]

            game_id = uuid.uuid4().hex
            state = PuzzleGameState(
                game_id=game_id,
                image_source=image_source or "",
                grid_size=size,
                modifiers=normalized_modifiers,
                pieces=pieces,
                board=board,
                tray=tray,
                hidden_pool=hidden_pool,
                rotations=rotations,
                started_at=time.time(),
            )

            self._validate_state(state)
            self.games[game_id] = state
            return self._serialize_state(state, message="拼图已生成，开始挑战吧")

    def get_game_state(self, game_id: str) -> Dict[str, Any]:
        with self.lock:
            state = self._get_game(game_id)
            self._touch(state)
            self._validate_state(state)
            return self._serialize_state(state)

    def apply_action(self, game_id: str, action: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self.lock:
            state = self._get_game(game_id)
            self._touch(state)

            dispatch = {
                "place_from_tray": self._action_place_from_tray,
                "move_cell": self._action_move_cell,
                "rotate_piece": self._action_rotate_piece,
                "shuffle": self._action_shuffle,
                "undo": self._action_undo,
                "solve": self._action_solve,
                "trigger_trickster": self._action_trigger_trickster,
            }

            if action not in dispatch:
                raise PuzzleError(f"不支持的动作: {action}")

            result_message = dispatch[action](state, payload)
            self._validate_state(state)
            return self._serialize_state(state, message=result_message)

    # -------------------- 动作实现 --------------------
    def _action_place_from_tray(self, state: PuzzleGameState, payload: Dict[str, Any]) -> str:
        self._ensure_playing(state)
        piece_id = self._require_piece_id(state, payload.get("pieceId"))
        target_index = self._validate_cell_index(state, payload.get("targetIndex"))

        location, _ = self._locate_piece(state, piece_id)
        if location != "tray":
            raise PuzzleError("只能放置托盘中的碎片")

        self._push_history(state)
        target_piece = state.board[target_index]

        state.tray.remove(piece_id)
        if target_piece:
            state.tray.insert(0, target_piece)
            state.metrics.modification_count += 1

        state.board[target_index] = piece_id
        self._record_piece_order(state, piece_id)
        self._record_move(state)

        message = "碎片已放置"
        message = self._post_action_update(state, message)
        return message

    def _action_move_cell(self, state: PuzzleGameState, payload: Dict[str, Any]) -> str:
        self._ensure_playing(state)
        source_index = self._validate_cell_index(state, payload.get("sourceIndex"))
        target_index = self._validate_cell_index(state, payload.get("targetIndex"))

        if source_index == target_index:
            raise PuzzleError("源格子与目标格子不能相同")

        source_piece = state.board[source_index]
        if not source_piece:
            raise PuzzleError("源格子没有可移动碎片")

        self._push_history(state)
        target_piece = state.board[target_index]

        if target_piece:
            state.board[source_index], state.board[target_index] = target_piece, source_piece
            message = "格子碎片已交换"
        else:
            state.board[target_index] = source_piece
            state.board[source_index] = None
            message = "碎片已移动到目标格子"

        state.metrics.modification_count += 1
        self._record_move(state)
        message = self._post_action_update(state, message)
        return message

    def _action_rotate_piece(self, state: PuzzleGameState, payload: Dict[str, Any]) -> str:
        self._ensure_playing(state)
        if not state.modifiers.get("rotation", False):
            raise PuzzleError("当前难度未启用翻转")

        piece_id = self._require_piece_id(state, payload.get("pieceId"))
        location, _ = self._locate_piece(state, piece_id)
        if location not in {"tray", "board"}:
            raise PuzzleError("隐藏碎片不能翻转")

        self._push_history(state)
        if piece_id in state.rotations:
            state.rotations.remove(piece_id)
            message = "碎片已恢复正向"
        else:
            state.rotations.add(piece_id)
            message = "碎片已翻转 180°"

        state.metrics.modification_count += 1
        self._record_move(state)
        message = self._post_action_update(state, message)
        return message

    def _action_shuffle(self, state: PuzzleGameState, payload: Dict[str, Any]) -> str:
        del payload
        self._ensure_playing_or_completed(state)
        self._push_history(state)

        visible_ids = [pid for pid in state.pieces.keys() if pid not in state.hidden_pool]
        self.random.shuffle(visible_ids)
        state.board = [None for _ in state.board]
        state.tray = visible_ids

        state.rotations.clear()
        if state.modifiers.get("rotation"):
            rotation_count = 3 if state.grid_size >= 6 else 1
            state.rotations.update(self._sample(state.tray, min(rotation_count, len(state.tray))))

        state.move_count = 0
        state.started_at = time.time()
        state.game_state = "playing"
        state.trickster_triggered = False
        state.metrics = PuzzleMetrics()
        state.last_message = "碎片已打乱，重新开始吧"
        return state.last_message

    def _action_undo(self, state: PuzzleGameState, payload: Dict[str, Any]) -> str:
        del payload
        if not state.history:
            raise PuzzleError("当前没有可回退的操作")

        snapshot = state.history.pop()
        state.board = snapshot["board"]
        state.tray = snapshot["tray"]
        state.hidden_pool = snapshot["hidden_pool"]
        state.rotations = snapshot["rotations"]
        state.started_at = snapshot["started_at"]
        state.game_state = snapshot["game_state"]
        state.move_count = snapshot["move_count"]
        state.trickster_triggered = snapshot["trickster_triggered"]
        state.metrics = snapshot["metrics"]
        state.last_message = "已回退一步"
        return state.last_message

    def _action_solve(self, state: PuzzleGameState, payload: Dict[str, Any]) -> str:
        del payload
        self._ensure_playing_or_completed(state)
        self._push_history(state)

        solved_board: List[Optional[str]] = []
        for row in range(state.grid_size):
            for col in range(state.grid_size):
                solved_board.append(f"p-{row}-{col}")

        state.board = solved_board
        state.tray = []
        state.hidden_pool.clear()
        state.rotations.clear()
        state.game_state = "completed"
        state.last_message = "已自动完成拼图"
        return state.last_message

    def _action_trigger_trickster(self, state: PuzzleGameState, payload: Dict[str, Any]) -> str:
        del payload
        self._ensure_playing(state)
        if not state.modifiers.get("trickster", False):
            raise PuzzleError("当前难度未启用捣蛋鬼")
        if state.trickster_triggered:
            return "捣蛋鬼已触发过，本局不会再次触发"

        self._push_history(state)
        moved_count = self._trigger_trickster(state)
        if moved_count == 0:
            return "捣蛋鬼没找到可捣乱的目标"

        state.metrics.modification_count += moved_count
        state.last_message = f"😈 捣蛋鬼移动了 {moved_count} 个碎片"
        return state.last_message

    # -------------------- 核心规则 --------------------
    def _post_action_update(self, state: PuzzleGameState, message: str) -> str:
        reveal_message = self._reveal_hidden_pieces_if_needed(state)
        trickster_message = self._maybe_trigger_trickster(state)

        correct_count, total_cells = self._count_correct_cells(state)
        if correct_count == total_cells and not state.tray and not state.hidden_pool:
            state.game_state = "completed"
            return "拼图完成，恭喜通关"

        pieces_in_board = sum(1 for pid in state.board if pid)
        if pieces_in_board == 0 and state.tray:
            base_message = "请先放置一个碎片"
        else:
            base_message = message

        if reveal_message:
            base_message = f"{base_message}，{reveal_message}"
        if trickster_message:
            base_message = f"{base_message}，{trickster_message}"

        state.last_message = base_message
        return base_message

    def _maybe_trigger_trickster(self, state: PuzzleGameState) -> str:
        if not state.modifiers.get("trickster", False):
            return ""
        if state.trickster_triggered:
            return ""
        if state.move_count < 5:
            return ""

        placed_indices = [idx for idx, pid in enumerate(state.board) if pid is not None]
        if len(placed_indices) < 2:
            return ""

        trigger_probability = 0.15
        if self.random.random() > trigger_probability:
            return ""

        moved_count = self._trigger_trickster(state)
        if moved_count <= 0:
            return ""

        state.metrics.modification_count += moved_count
        return f"😈 捣蛋鬼出手，随机移动了 {moved_count} 个碎片"

    def _trigger_trickster(self, state: PuzzleGameState) -> int:
        placed_indices = [idx for idx, pid in enumerate(state.board) if pid is not None]
        if len(placed_indices) < 2:
            return 0

        move_count = 5 if state.grid_size >= 6 else self.random.randint(1, 3)
        move_count = min(move_count, len(placed_indices))
        selected_indices = self._sample(placed_indices, move_count)

        moved = 0
        for source_idx in selected_indices:
            target_candidates = [idx for idx in placed_indices if idx != source_idx]
            if not target_candidates:
                continue
            target_idx = self.random.choice(target_candidates)
            state.board[source_idx], state.board[target_idx] = state.board[target_idx], state.board[source_idx]
            moved += 1

        if moved > 0:
            state.trickster_triggered = True
        return moved

    def _reveal_hidden_pieces_if_needed(self, state: PuzzleGameState) -> str:
        if not state.modifiers.get("hidden", False):
            return ""
        if not state.hidden_pool:
            return ""

        total_cells = state.grid_size * state.grid_size
        visible_cells = total_cells - len(state.hidden_pool)
        correct_count, _ = self._count_correct_cells(state)
        threshold = max(1, visible_cells - 1)

        if correct_count < threshold:
            return ""

        revealed = list(state.hidden_pool)
        self.random.shuffle(revealed)
        state.tray.extend(revealed)
        state.hidden_pool.clear()
        return ""  # 不显示提示消息，让隐藏碎片悄悄出现

    # -------------------- 状态校验 --------------------
    def _validate_state(self, state: PuzzleGameState) -> None:
        total_cells = state.grid_size * state.grid_size
        if len(state.board) != total_cells:
            raise PuzzleError("棋盘尺寸异常")

        all_piece_ids = set(state.pieces.keys())
        board_ids = [pid for pid in state.board if pid is not None]
        tray_ids = list(state.tray)
        hidden_ids = list(state.hidden_pool)

        seen = board_ids + tray_ids + hidden_ids
        if len(seen) != len(set(seen)):
            raise PuzzleError("状态异常：碎片重复出现")

        if set(seen) != all_piece_ids:
            missing = all_piece_ids - set(seen)
            extra = set(seen) - all_piece_ids
            raise PuzzleError(f"状态异常：碎片集合不一致 missing={missing} extra={extra}")

        if not state.rotations.issubset(all_piece_ids):
            raise PuzzleError("状态异常：翻转集合含非法碎片")

        if len(state.history) > self.max_undo:
            raise PuzzleError("状态异常：回退历史超过限制")

    # -------------------- 序列化 --------------------
    def _serialize_state(self, state: PuzzleGameState, message: Optional[str] = None) -> Dict[str, Any]:
        if message:
            state.last_message = message

        correct_count, total_cells = self._count_correct_cells(state)
        elapsed_seconds = max(0, int(time.time() - state.started_at))
        completion_time = self._format_elapsed(elapsed_seconds)

        return {
            "gameId": state.game_id,
            "imageSource": state.image_source,
            "gridSize": state.grid_size,
            "modifiers": state.modifiers,
            "gameState": state.game_state,
            "moveCount": state.move_count,
            "elapsedSeconds": elapsed_seconds,
            "elapsedFormatted": completion_time,
            "canUndo": len(state.history) > 0,
            "hiddenCount": len(state.hidden_pool),
            "message": state.last_message,
            "completion": {
                "correctCount": correct_count,
                "total": total_cells,
                "isCompleted": (
                    state.game_state == "completed"
                    and correct_count == total_cells
                    and not state.tray
                    and not state.hidden_pool
                ),
                "progress": round((correct_count / total_cells) * 100, 2) if total_cells else 0,
            },
            "board": [
                self._serialize_piece(state, piece_id) if piece_id else None
                for piece_id in state.board
            ],
            "tray": [self._serialize_piece(state, piece_id) for piece_id in state.tray],
            "metrics": {
                "pieceOrder": state.metrics.piece_order,
                "timeIntervals": state.metrics.time_intervals,
                "modificationCount": state.metrics.modification_count,
                "completionTime": completion_time if state.game_state == "completed" else None,
            },
        }

    def _serialize_piece(self, state: PuzzleGameState, piece_id: str) -> Dict[str, Any]:
        piece = state.pieces[piece_id]
        return {
            "id": piece.piece_id,
            "originalRow": piece.original_row,
            "originalCol": piece.original_col,
            "rotated": piece_id in state.rotations,
        }

    # -------------------- 工具方法 --------------------
    def _record_piece_order(self, state: PuzzleGameState, piece_id: str) -> None:
        if piece_id not in state.metrics.placed_once:
            state.metrics.placed_once.add(piece_id)
            state.metrics.piece_order.append(piece_id)

    def _record_move(self, state: PuzzleGameState) -> None:
        now = time.time()
        if state.metrics.action_timestamps:
            interval = round(now - state.metrics.action_timestamps[-1], 3)
            state.metrics.time_intervals.append(interval)
        state.metrics.action_timestamps.append(now)
        state.move_count += 1

    def _count_correct_cells(self, state: PuzzleGameState) -> Tuple[int, int]:
        total_cells = state.grid_size * state.grid_size
        correct = 0
        for idx, piece_id in enumerate(state.board):
            if not piece_id:
                continue
            row = idx // state.grid_size
            col = idx % state.grid_size
            piece = state.pieces[piece_id]
            if piece.original_row == row and piece.original_col == col and piece_id not in state.rotations:
                correct += 1
        return correct, total_cells

    def _validate_grid_size(self, grid_size: Any) -> int:
        try:
            size = int(grid_size)
        except (TypeError, ValueError):
            raise PuzzleError("难度必须是数字")

        if size < 2 or size > 6:
            raise PuzzleError("难度只支持 2 到 6")
        return size

    def _build_pieces(self, grid_size: int) -> Dict[str, Piece]:
        pieces: Dict[str, Piece] = {}
        for row in range(grid_size):
            for col in range(grid_size):
                piece_id = f"p-{row}-{col}"
                pieces[piece_id] = Piece(piece_id=piece_id, original_row=row, original_col=col)
        return pieces

    def _normalize_modifiers(self, modifiers: Optional[Dict[str, Any]]) -> Dict[str, bool]:
        raw = modifiers if isinstance(modifiers, dict) else {}
        return {
            "rotation": bool(raw.get("rotation", False)),
            "hidden": bool(raw.get("hidden", False)),
            "trickster": bool(raw.get("trickster", False)),
        }

    def _validate_cell_index(self, state: PuzzleGameState, cell_index: Any) -> int:
        try:
            idx = int(cell_index)
        except (TypeError, ValueError):
            raise PuzzleError("格子索引必须是数字")

        if idx < 0 or idx >= len(state.board):
            raise PuzzleError("格子索引越界")
        return idx

    def _require_piece_id(self, state: PuzzleGameState, piece_id: Any) -> str:
        if not isinstance(piece_id, str) or not piece_id:
            raise PuzzleError("pieceId 不能为空")
        if piece_id not in state.pieces:
            raise PuzzleError("pieceId 不存在")
        return piece_id

    def _locate_piece(self, state: PuzzleGameState, piece_id: str) -> Tuple[str, Optional[int]]:
        if piece_id in state.hidden_pool:
            return "hidden", None
        if piece_id in state.tray:
            return "tray", state.tray.index(piece_id)
        for idx, pid in enumerate(state.board):
            if pid == piece_id:
                return "board", idx
        raise PuzzleError("碎片位置异常，未找到 pieceId")

    def _push_history(self, state: PuzzleGameState) -> None:
        snapshot = {
            "board": list(state.board),
            "tray": list(state.tray),
            "hidden_pool": set(state.hidden_pool),
            "rotations": set(state.rotations),
            "started_at": state.started_at,
            "game_state": state.game_state,
            "move_count": state.move_count,
            "trickster_triggered": state.trickster_triggered,
            "metrics": copy.deepcopy(state.metrics),
        }
        state.history.append(snapshot)
        if len(state.history) > self.max_undo:
            state.history.pop(0)

    def _sample(self, data: List[Any], count: int) -> List[Any]:
        if count <= 0 or not data:
            return []
        if count >= len(data):
            return list(data)
        return self.random.sample(data, count)

    def _ensure_playing(self, state: PuzzleGameState) -> None:
        if state.game_state != "playing":
            raise PuzzleError("当前局面不可操作，请重新开始或回退")

    def _ensure_playing_or_completed(self, state: PuzzleGameState) -> None:
        if state.game_state not in {"playing", "completed"}:
            raise PuzzleError("当前局面不可操作")

    def _format_elapsed(self, elapsed_seconds: int) -> str:
        minutes = elapsed_seconds // 60
        seconds = elapsed_seconds % 60
        return f"{minutes:02d}:{seconds:02d}"

    def _touch(self, state: PuzzleGameState) -> None:
        state.last_active_at = time.time()

    def _cleanup_expired_games(self) -> None:
        now = time.time()
        expired = [
            game_id
            for game_id, state in self.games.items()
            if now - state.last_active_at > self.ttl_seconds
        ]
        for game_id in expired:
            self.games.pop(game_id, None)

    def _evict_oldest_game(self) -> None:
        if not self.games:
            return
        oldest_game = min(self.games.values(), key=lambda s: s.last_active_at)
        self.games.pop(oldest_game.game_id, None)

    def _get_game(self, game_id: str) -> PuzzleGameState:
        self._cleanup_expired_games()
        state = self.games.get(game_id)
        if not state:
            raise PuzzleError("游戏不存在或已过期，请重新生成拼图")
        return state
