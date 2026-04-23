import json
import os
import re
import sqlite3
import statistics
import threading
import time
from typing import Any, Dict, List, Optional, Tuple


def normalize_client_id(raw_client_id: Any) -> str:
    """归一化 client_id，确保可用于统计分组。"""
    if not isinstance(raw_client_id, str):
        return "anonymous"
    cleaned = raw_client_id.strip()
    if not cleaned:
        return "anonymous"
    cleaned = re.sub(r"[^a-zA-Z0-9._:-]", "_", cleaned)
    if len(cleaned) > 128:
        cleaned = cleaned[:128]
    return cleaned or "anonymous"


def parse_completion_time_to_seconds(value: Any) -> Optional[int]:
    if isinstance(value, int):
        return max(0, value)
    if isinstance(value, float):
        return max(0, int(value))
    if not isinstance(value, str):
        return None

    txt = value.strip()
    if not txt:
        return None

    # 支持 mm:ss 或 hh:mm:ss
    parts = txt.split(":")
    if not all(p.isdigit() for p in parts):
        return None
    if len(parts) == 2:
        mm, ss = [int(p) for p in parts]
        return max(0, mm * 60 + ss)
    if len(parts) == 3:
        hh, mm, ss = [int(p) for p in parts]
        return max(0, hh * 3600 + mm * 60 + ss)
    return None


def _safe_json_dumps(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False)
    except Exception:
        return "null"


def _safe_json_loads(value: Any, fallback: Any) -> Any:
    if not isinstance(value, str):
        return fallback
    try:
        return json.loads(value)
    except Exception:
        return fallback


class AnalyticsStore:
    """SQLite 行为分析存储。"""

    def __init__(self, db_path: str):
        self.db_path = db_path
        self.lock = threading.RLock()
        self._ensure_parent_dir()
        self._init_db()

    def _ensure_parent_dir(self) -> None:
        parent = os.path.dirname(self.db_path)
        if parent:
            os.makedirs(parent, exist_ok=True)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self.lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS users (
                        client_id TEXT PRIMARY KEY,
                        first_seen REAL NOT NULL,
                        last_seen REAL NOT NULL
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS game_sessions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        game_id TEXT NOT NULL UNIQUE,
                        client_id TEXT NOT NULL,
                        image_source TEXT,
                        grid_size INTEGER,
                        modifiers_json TEXT,
                        started_at REAL,
                        ended_at REAL,
                        game_state TEXT,
                        move_count INTEGER DEFAULT 0,
                        progress REAL DEFAULT 0,
                        completion_time_seconds INTEGER,
                        piece_order_json TEXT,
                        time_intervals_json TEXT,
                        modification_count INTEGER DEFAULT 0,
                        created_at REAL NOT NULL,
                        updated_at REAL NOT NULL
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_game_sessions_client_updated
                    ON game_sessions(client_id, updated_at DESC)
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS action_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        game_id TEXT NOT NULL,
                        client_id TEXT NOT NULL,
                        action TEXT NOT NULL,
                        payload_json TEXT,
                        move_count INTEGER,
                        progress REAL,
                        game_state TEXT,
                        elapsed_seconds INTEGER,
                        created_at REAL NOT NULL
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_action_logs_client_time
                    ON action_logs(client_id, created_at DESC)
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS report_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        client_id TEXT NOT NULL,
                        game_id TEXT,
                        image_source TEXT,
                        prompt_text TEXT,
                        report_text TEXT,
                        created_at REAL NOT NULL
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_report_logs_client_time
                    ON report_logs(client_id, created_at DESC)
                    """
                )
                # 心理疗愈对话表
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS healing_sessions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT NOT NULL UNIQUE,
                        client_id TEXT NOT NULL,
                        report_id INTEGER,
                        report_content TEXT,
                        user_name TEXT,
                        user_student_id TEXT,
                        is_anonymous INTEGER DEFAULT 1,
                        question_count INTEGER DEFAULT 0,
                        is_deleted INTEGER DEFAULT 0,
                        created_at REAL NOT NULL,
                        updated_at REAL NOT NULL
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_healing_sessions_client
                    ON healing_sessions(client_id, created_at DESC)
                    """
                )
                # 对话消息表
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS healing_messages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT NOT NULL,
                        role TEXT NOT NULL,
                        content TEXT NOT NULL,
                        created_at REAL NOT NULL
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_healing_messages_session
                    ON healing_messages(session_id, created_at ASC)
                    """
                )

                # 数据库迁移：为已存在的healing_sessions表添加is_deleted列
                try:
                    # 检查is_deleted列是否存在
                    cursor = conn.execute("PRAGMA table_info(healing_sessions)")
                    columns = [row[1] for row in cursor.fetchall()]
                    if 'is_deleted' not in columns:
                        conn.execute("ALTER TABLE healing_sessions ADD COLUMN is_deleted INTEGER DEFAULT 0")
                except Exception:
                    pass  # 列已存在或表不存在

    def _touch_user(self, conn: sqlite3.Connection, client_id: str) -> None:
        now = time.time()
        conn.execute(
            """
            INSERT INTO users (client_id, first_seen, last_seen)
            VALUES (?, ?, ?)
            ON CONFLICT(client_id) DO UPDATE SET
                last_seen = excluded.last_seen
            """,
            (client_id, now, now),
        )

    def upsert_game_session(
        self,
        client_id: str,
        state: Dict[str, Any],
        image_source: Optional[str] = None,
    ) -> None:
        client_id = normalize_client_id(client_id)
        game_id = str(state.get("gameId") or "").strip()
        if not game_id:
            return

        now = time.time()
        completion = state.get("completion", {}) if isinstance(state.get("completion"), dict) else {}
        metrics = state.get("metrics", {}) if isinstance(state.get("metrics"), dict) else {}

        started_at = now - max(0, int(state.get("elapsedSeconds", 0) or 0))
        game_state = str(state.get("gameState") or "playing")
        ended_at = now if game_state == "completed" else None

        move_count = int(state.get("moveCount", 0) or 0)
        progress = float(completion.get("progress", 0) or 0)
        completion_time_seconds = int(state.get("elapsedSeconds", 0) or 0) if game_state == "completed" else None

        with self.lock:
            with self._connect() as conn:
                self._touch_user(conn, client_id)
                conn.execute(
                    """
                    INSERT INTO game_sessions (
                        game_id, client_id, image_source, grid_size, modifiers_json,
                        started_at, ended_at, game_state, move_count, progress,
                        completion_time_seconds, piece_order_json, time_intervals_json,
                        modification_count, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(game_id) DO UPDATE SET
                        client_id = excluded.client_id,
                        image_source = excluded.image_source,
                        grid_size = excluded.grid_size,
                        modifiers_json = excluded.modifiers_json,
                        started_at = excluded.started_at,
                        ended_at = excluded.ended_at,
                        game_state = excluded.game_state,
                        move_count = excluded.move_count,
                        progress = excluded.progress,
                        completion_time_seconds = excluded.completion_time_seconds,
                        piece_order_json = excluded.piece_order_json,
                        time_intervals_json = excluded.time_intervals_json,
                        modification_count = excluded.modification_count,
                        updated_at = excluded.updated_at
                    """,
                    (
                        game_id,
                        client_id,
                        image_source or state.get("imageSource") or "",
                        int(state.get("gridSize", 0) or 0),
                        _safe_json_dumps(state.get("modifiers", {})),
                        started_at,
                        ended_at,
                        game_state,
                        move_count,
                        progress,
                        completion_time_seconds,
                        _safe_json_dumps(metrics.get("pieceOrder", [])),
                        _safe_json_dumps(metrics.get("timeIntervals", [])),
                        int(metrics.get("modificationCount", 0) or 0),
                        now,
                        now,
                    ),
                )

    def log_action(
        self,
        client_id: str,
        game_id: str,
        action: str,
        payload: Dict[str, Any],
        state: Dict[str, Any],
    ) -> None:
        client_id = normalize_client_id(client_id)
        game_id = (game_id or "").strip()
        if not game_id:
            return

        now = time.time()
        completion = state.get("completion", {}) if isinstance(state.get("completion"), dict) else {}
        with self.lock:
            with self._connect() as conn:
                self._touch_user(conn, client_id)
                conn.execute(
                    """
                    INSERT INTO action_logs (
                        game_id, client_id, action, payload_json, move_count,
                        progress, game_state, elapsed_seconds, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        game_id,
                        client_id,
                        action,
                        _safe_json_dumps(payload or {}),
                        int(state.get("moveCount", 0) or 0),
                        float(completion.get("progress", 0) or 0),
                        str(state.get("gameState") or "playing"),
                        int(state.get("elapsedSeconds", 0) or 0),
                        now,
                    ),
                )

    def update_from_report_payload(
        self,
        client_id: str,
        game_id: Optional[str],
        image_source: str,
        game_data: Dict[str, Any],
    ) -> None:
        if not isinstance(game_data, dict):
            return

        client_id = normalize_client_id(client_id)
        now = time.time()
        game_id = (game_id or "").strip()

        completion_seconds = parse_completion_time_to_seconds(game_data.get("completionTime"))
        move_count = int(game_data.get("moveCount", 0) or 0)
        piece_order = game_data.get("pieceOrder", [])
        time_intervals = game_data.get("timeIntervals", [])
        modification_count = int(game_data.get("modificationCount", 0) or 0)
        difficulty = game_data.get("difficulty", "")
        grid_size = int(game_data.get("gridSize", 0) or 0)
        if not grid_size and isinstance(difficulty, str) and "x" in difficulty:
            try:
                grid_size = int(difficulty.split("x")[0])
            except Exception:
                grid_size = 0

        if not game_id:
            # 没有 game_id 时仍记录一条汇总会话，避免近期画像丢失
            game_id = f"report-{int(now * 1000)}-{client_id[:12]}"

        with self.lock:
            with self._connect() as conn:
                self._touch_user(conn, client_id)
                conn.execute(
                    """
                    INSERT INTO game_sessions (
                        game_id, client_id, image_source, grid_size, modifiers_json,
                        started_at, ended_at, game_state, move_count, progress,
                        completion_time_seconds, piece_order_json, time_intervals_json,
                        modification_count, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(game_id) DO UPDATE SET
                        client_id = excluded.client_id,
                        image_source = excluded.image_source,
                        grid_size = CASE WHEN excluded.grid_size > 0 THEN excluded.grid_size ELSE game_sessions.grid_size END,
                        move_count = CASE WHEN excluded.move_count > 0 THEN excluded.move_count ELSE game_sessions.move_count END,
                        completion_time_seconds = CASE
                            WHEN excluded.completion_time_seconds IS NOT NULL THEN excluded.completion_time_seconds
                            ELSE game_sessions.completion_time_seconds
                        END,
                        piece_order_json = CASE
                            WHEN length(excluded.piece_order_json) > 2 THEN excluded.piece_order_json
                            ELSE game_sessions.piece_order_json
                        END,
                        time_intervals_json = CASE
                            WHEN length(excluded.time_intervals_json) > 2 THEN excluded.time_intervals_json
                            ELSE game_sessions.time_intervals_json
                        END,
                        modification_count = CASE
                            WHEN excluded.modification_count > 0 THEN excluded.modification_count
                            ELSE game_sessions.modification_count
                        END,
                        ended_at = excluded.ended_at,
                        game_state = excluded.game_state,
                        progress = excluded.progress,
                        updated_at = excluded.updated_at
                    """,
                    (
                        game_id,
                        client_id,
                        image_source or "",
                        grid_size,
                        _safe_json_dumps(game_data.get("modifiers", {})),
                        now - (completion_seconds or 0),
                        now,
                        "completed",
                        move_count,
                        100.0,
                        completion_seconds,
                        _safe_json_dumps(piece_order),
                        _safe_json_dumps(time_intervals),
                        modification_count,
                        now,
                        now,
                    ),
                )

    def save_report(self, client_id: str, game_id: Optional[str], image_source: str, prompt_text: str, report_text: str) -> None:
        client_id = normalize_client_id(client_id)
        now = time.time()
        with self.lock:
            with self._connect() as conn:
                self._touch_user(conn, client_id)
                conn.execute(
                    """
                    INSERT INTO report_logs (client_id, game_id, image_source, prompt_text, report_text, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (client_id, (game_id or "").strip(), image_source or "", prompt_text, report_text, now),
                )

    def build_recent_behavior_prompt(self, client_id: str, lookback_days: int = 14, max_sessions: int = 12) -> str:
        client_id = normalize_client_id(client_id)
        now = time.time()
        since_ts = now - max(1, lookback_days) * 86400

        with self.lock:
            with self._connect() as conn:
                rows = conn.execute(
                    """
                    SELECT *
                    FROM game_sessions
                    WHERE client_id = ? AND updated_at >= ?
                    ORDER BY updated_at DESC
                    LIMIT ?
                    """,
                    (client_id, since_ts, max_sessions),
                ).fetchall()

                action_rows = conn.execute(
                    """
                    SELECT action, COUNT(*) AS cnt
                    FROM action_logs
                    WHERE client_id = ? AND created_at >= ?
                    GROUP BY action
                    """,
                    (client_id, since_ts),
                ).fetchall()

        if not rows:
            return "近期行为数据：暂无历史记录，仅基于本次拼图行为做观察。"

        sessions = [dict(r) for r in rows]
        total_sessions = len(sessions)
        completed_sessions = sum(1 for s in sessions if s.get("game_state") == "completed")

        completion_seconds_list = [
            int(s["completion_time_seconds"])
            for s in sessions
            if s.get("completion_time_seconds") is not None
        ]
        move_counts = [int(s.get("move_count", 0) or 0) for s in sessions]
        modification_counts = [int(s.get("modification_count", 0) or 0) for s in sessions]

        avg_time = round(sum(completion_seconds_list) / len(completion_seconds_list), 1) if completion_seconds_list else None
        median_time = round(statistics.median(completion_seconds_list), 1) if completion_seconds_list else None
        avg_moves = round(sum(move_counts) / len(move_counts), 1) if move_counts else None
        avg_modifications = round(sum(modification_counts) / len(modification_counts), 1) if modification_counts else None

        avg_interval_values: List[float] = []
        hesitation_values: List[float] = []
        piece_order_lengths: List[int] = []
        image_counter: Dict[str, int] = {}
        grid_counter: Dict[str, int] = {}

        for s in sessions:
            intervals = _safe_json_loads(s.get("time_intervals_json"), [])
            if isinstance(intervals, list) and intervals:
                numeric = [float(x) for x in intervals if isinstance(x, (int, float))]
                if numeric:
                    avg_interval_values.append(sum(numeric) / len(numeric))
                    hesitation = sum(1 for x in numeric if x >= 4.0) / len(numeric)
                    hesitation_values.append(hesitation)

            piece_order = _safe_json_loads(s.get("piece_order_json"), [])
            if isinstance(piece_order, list):
                piece_order_lengths.append(len(piece_order))

            img = str(s.get("image_source") or "").strip()
            if img:
                image_counter[img] = image_counter.get(img, 0) + 1

            gsize = int(s.get("grid_size", 0) or 0)
            if gsize > 0:
                key = f"{gsize}x{gsize}"
                grid_counter[key] = grid_counter.get(key, 0) + 1

        avg_interval = round(sum(avg_interval_values) / len(avg_interval_values), 2) if avg_interval_values else None
        avg_hesitation_ratio = round(sum(hesitation_values) / len(hesitation_values), 3) if hesitation_values else None
        avg_piece_order_length = round(sum(piece_order_lengths) / len(piece_order_lengths), 1) if piece_order_lengths else None

        trend_line = self._build_trend_line(sessions)
        favorite_image = max(image_counter.items(), key=lambda kv: kv[1])[0] if image_counter else "无明显偏好"
        common_difficulty = max(grid_counter.items(), key=lambda kv: kv[1])[0] if grid_counter else "无明显偏好"

        action_counter = {str(r["action"]): int(r["cnt"]) for r in action_rows}
        undo_rate = self._ratio(action_counter.get("undo", 0), sum(action_counter.values()))
        rotate_rate = self._ratio(action_counter.get("rotate_piece", 0), sum(action_counter.values()))

        lines = [
            f"近期行为数据（最近{lookback_days}天，{total_sessions}局）：",
            f"- 完成局数：{completed_sessions}/{total_sessions}",
            f"- 平均用时：{avg_time if avg_time is not None else '数据不足'} 秒；中位用时：{median_time if median_time is not None else '数据不足'} 秒",
            f"- 平均步数：{avg_moves if avg_moves is not None else '数据不足'}；平均修改次数：{avg_modifications if avg_modifications is not None else '数据不足'}",
            f"- 平均操作间隔：{avg_interval if avg_interval is not None else '数据不足'} 秒；高犹豫动作占比：{avg_hesitation_ratio if avg_hesitation_ratio is not None else '数据不足'}",
            f"- 首次放置覆盖量均值：{avg_piece_order_length if avg_piece_order_length is not None else '数据不足'} 块",
            f"- 常用难度：{common_difficulty}；常用图片：{favorite_image}",
            f"- 回退动作占比：{undo_rate}；翻转动作占比：{rotate_rate}",
            f"- 趋势判断：{trend_line}",
            "解释要求：近期数据只作为补充证据；若与本局行为冲突，优先依据本局；样本较少时用“可能、倾向”表达，不做绝对判断。",
        ]
        return "\n".join(lines)

    def _build_trend_line(self, sessions: List[Dict[str, Any]]) -> str:
        completed = [
            s for s in sorted(sessions, key=lambda x: x.get("updated_at", 0))
            if s.get("completion_time_seconds") is not None and s.get("move_count") is not None
        ]
        if len(completed) < 4:
            return "样本不足，暂不判断明显趋势"

        split = len(completed) // 2
        old_group = completed[:split]
        new_group = completed[split:]

        old_time = sum(int(x["completion_time_seconds"]) for x in old_group) / len(old_group)
        new_time = sum(int(x["completion_time_seconds"]) for x in new_group) / len(new_group)
        old_move = sum(int(x["move_count"]) for x in old_group) / len(old_group)
        new_move = sum(int(x["move_count"]) for x in new_group) / len(new_group)

        time_delta = self._pct_change(old_time, new_time)
        move_delta = self._pct_change(old_move, new_move)

        time_desc = "用时下降" if time_delta < -0.05 else "用时上升" if time_delta > 0.05 else "用时基本稳定"
        move_desc = "步数下降" if move_delta < -0.05 else "步数上升" if move_delta > 0.05 else "步数基本稳定"
        return f"{time_desc}（{time_delta * 100:.1f}%），{move_desc}（{move_delta * 100:.1f}%）"

    @staticmethod
    def _pct_change(old_value: float, new_value: float) -> float:
        if old_value <= 0:
            return 0.0
        return (new_value - old_value) / old_value

    @staticmethod
    def _ratio(num: int, den: int) -> str:
        if den <= 0:
            return "0%"
        return f"{(num / den) * 100:.1f}%"

    def get_reports_by_client(self, client_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """获取用户的报告列表"""
        client_id = normalize_client_id(client_id)
        with self.lock:
            with self._connect() as conn:
                rows = conn.execute(
                    """
                    SELECT id, game_id, image_source, report_text, created_at
                    FROM report_logs
                    WHERE client_id = ?
                    ORDER BY created_at DESC
                    LIMIT ?
                    """,
                    (client_id, limit),
                ).fetchall()
                return [dict(r) for r in rows]

    def create_healing_session(self, session_id: str, client_id: str, report_id: int, report_content: str) -> None:
        """创建心理疗愈会话"""
        client_id = normalize_client_id(client_id)
        now = time.time()
        with self.lock:
            with self._connect() as conn:
                self._touch_user(conn, client_id)
                conn.execute(
                    """
                    INSERT INTO healing_sessions (
                        session_id, client_id, report_id, report_content,
                        question_count, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (session_id, client_id, report_id, report_content, 0, now, now),
                )

    def add_healing_message(self, session_id: str, role: str, content: str) -> None:
        """添加对话消息"""
        now = time.time()
        with self.lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT INTO healing_messages (session_id, role, content, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (session_id, role, content, now),
                )

    def increment_question_count(self, session_id: str) -> int:
        """增加问题计数并返回当前计数"""
        now = time.time()
        with self.lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    UPDATE healing_sessions
                    SET question_count = question_count + 1, updated_at = ?
                    WHERE session_id = ?
                    """,
                    (now, session_id),
                )
                row = conn.execute(
                    """
                    SELECT question_count FROM healing_sessions WHERE session_id = ?
                    """,
                    (session_id,),
                ).fetchone()
                return int(row["question_count"]) if row else 0

    def get_question_count(self, session_id: str) -> int:
        """获取当前问题计数"""
        with self.lock:
            with self._connect() as conn:
                row = conn.execute(
                    """
                    SELECT question_count FROM healing_sessions WHERE session_id = ?
                    """,
                    (session_id,),
                ).fetchone()
                return int(row["question_count"]) if row else 0

    def update_healing_user_info(self, session_id: str, user_name: str, user_student_id: str, is_anonymous: bool) -> None:
        """更新疗愈会话的用户信息"""
        now = time.time()
        with self.lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    UPDATE healing_sessions
                    SET user_name = ?, user_student_id = ?, is_anonymous = ?, updated_at = ?
                    WHERE session_id = ?
                    """,
                    (user_name or "", user_student_id or "", 1 if is_anonymous else 0, now, session_id),
                )

    def get_healing_messages(self, session_id: str) -> List[Dict[str, Any]]:
        """获取对话历史"""
        with self.lock:
            with self._connect() as conn:
                rows = conn.execute(
                    """
                    SELECT role, content, created_at
                    FROM healing_messages
                    WHERE session_id = ?
                    ORDER BY created_at ASC
                    """,
                    (session_id,),
                ).fetchall()
                return [dict(r) for r in rows]

    def get_healing_sessions_by_report(self, report_id: int) -> List[Dict[str, Any]]:
        """获取某个报告的所有疗愈会话"""
        with self.lock:
            with self._connect() as conn:
                rows = conn.execute(
                    """
                    SELECT session_id, question_count, is_deleted, created_at, updated_at
                    FROM healing_sessions
                    WHERE report_id = ?
                    ORDER BY created_at DESC
                    """,
                    (report_id,),
                ).fetchall()
                return [dict(r) for r in rows]

    def get_healing_session_by_id(self, session_id: str) -> Optional[Dict[str, Any]]:
        """根据session_id获取会话信息"""
        with self.lock:
            with self._connect() as conn:
                row = conn.execute(
                    """
                    SELECT session_id, client_id, report_id, report_content, question_count, created_at, updated_at
                    FROM healing_sessions
                    WHERE session_id = ?
                    """,
                    (session_id,),
                ).fetchone()
                return dict(row) if row else None

    def get_all_healing_data(self) -> List[Dict[str, Any]]:
        """获取所有疗愈数据用于管理员导出（只包含已完成且已提交信息的会话）"""
        with self.lock:
            with self._connect() as conn:
                rows = conn.execute(
                    """
                    SELECT
                        hs.client_id,
                        hs.user_name,
                        hs.user_student_id,
                        hs.is_anonymous,
                        hs.report_content,
                        hs.session_id,
                        hs.created_at,
                        hs.question_count
                    FROM healing_sessions hs
                    WHERE hs.question_count >= 3
                    AND (hs.user_name IS NOT NULL OR hs.is_anonymous = 1)
                    ORDER BY hs.created_at DESC
                    """,
                ).fetchall()

                result = []
                for row in rows:
                    session_data = dict(row)
                    messages = conn.execute(
                        """
                        SELECT role, content FROM healing_messages
                        WHERE session_id = ? AND role = 'user'
                        ORDER BY created_at ASC
                        """,
                        (session_data["session_id"],),
                    ).fetchall()
                    session_data["questions"] = [dict(m)["content"] for m in messages]
                    result.append(session_data)

                return result

    def soft_delete_healing_session(self, session_id: str) -> None:
        """软删除疗愈会话（不影响管理员导出）"""
        now = time.time()
        with self.lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    UPDATE healing_sessions
                    SET is_deleted = 1, updated_at = ?
                    WHERE session_id = ?
                    """,
                    (now, session_id),
                )

    def delete_report_and_sessions(self, report_id: int) -> None:
        """删除报告及其所有关联的疗愈会话"""
        with self.lock:
            with self._connect() as conn:
                # 获取该报告的所有会话ID
                session_ids = conn.execute(
                    """
                    SELECT session_id FROM healing_sessions
                    WHERE report_id = ?
                    """,
                    (report_id,),
                ).fetchall()

                # 删除所有会话的消息
                for row in session_ids:
                    conn.execute(
                        """
                        DELETE FROM healing_messages
                        WHERE session_id = ?
                        """,
                        (row[0],),
                    )

                # 删除所有会话
                conn.execute(
                    """
                    DELETE FROM healing_sessions
                    WHERE report_id = ?
                    """,
                    (report_id,),
                )

                # 删除报告
                conn.execute(
                    """
                    DELETE FROM report_logs
                    WHERE id = ?
                    """,
                    (report_id,),
                )

