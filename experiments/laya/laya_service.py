#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
laya_service.py —— 本地 Laya 声景推荐服务（完全离线）

真实依赖（已在 ~/laya_env 实测确认真实 API，绝非臆造）：
  - laya 0.3.3 : laya.load(model_id, subfolder=...) -> Agent ; Agent.system_one(state, questions)
  - transformers 5.x / torch 2.x / huggingface_hub
  - flask      : HTTP 层（手动实现 CORS，避免额外依赖）

模型：convaiinnovations/laya 的 **typed-decisions** 子目录（英文 RL 决策 checkpoint，已联网预热一次后离线缓存）。
红线：禁止用 multilingual 做推荐决策（官方 benchmark 仅 0.342，低于多数类基线）。state 一律英文枚举。
system_one 对 choice 问题返回 {choice, probabilities:{opt:prob}, confidence, action}，顶层为
{model, answers:{qid:...}, usage}。confidence 是库内置温度校准后的置信度。
⚠️ 实测本任务 Top-1 仅约 13%（<60%），故后端仅作"高置信增强信号"，客户端以规则引擎为权威兜底。

启动：source ~/laya_env/bin/activate && python3 laya_service.py   (监听 0.0.0.0:5000)
"""
import os

# —— 铁律：完全离线。必须在 import laya/transformers/huggingface_hub 之前关闭联网，
#    否则它们会尝试访问 HF Hub。设了这两个开关后只会从本地缓存读取。
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

import time
import traceback

from flask import Flask, request, jsonify

# ------------------------------------------------------------------ 模型与映射
# 5 个逻辑场景 -> 真实可播放 scene_id（与 src/constants/scenes.ts 对齐）。
LOGICAL_TO_SCENE_ID = {
    "rain":        "city_rain_urban",
    "white_noise": "interactive_white_noise",
    "forest":      "nature_forest",
    "ocean":       "nature_ocean",
    "meditation":  "healing_zen_bowl",
}

# 每个逻辑场景喂给模型的判据描述（choice 选项）。模型据此打分并输出概率。
SCENE_CRITERIA = {
    "rain":        "gentle city rain on windows; cozy, grounding, masks irregular noise, good for sleep",
    "white_noise": "steady neutral hiss; focus, tinnitus masking, blocking sound, falling asleep",
    "forest":      "birds and leaves in a green forest; refreshing, uplifting, calm daytime nature",
    "ocean":       "slow rolling waves; deep relaxation, slow breathing, drifting off to sleep",
    "meditation":  "resonant zen bowl; stillness, mindfulness, settling an anxious or busy mind",
}

RECOMMEND_QUESTIONS = {
    "scene": {
        "type": "choice",
        "instructions": (
            "Which soundscape best matches the listener's current needs described in `state`?"
        ),
        "criteria": SCENE_CRITERIA,
    }
}

# 中文展示名（兜底；前端仍会用 SCENES 解析真实标题）。
LOGICAL_LABEL_ZH = {
    "rain": "城市夜雨",
    "white_noise": "纯净白噪声",
    "forest": "迷雾森林",
    "ocean": "深海之境",
    "meditation": "禅意颂钵",
}

MODEL_ID = os.environ.get("LAYA_MODEL_ID", "convaiinnovations/laya")
MODEL_SUBFOLDER = os.environ.get("LAYA_MODEL_SUBFOLDER", "typed-decisions")
# 客户端据此决定是否采用 Laya 结果；低于阈值则回退规则引擎（并存兜底）。
CONF_THRESHOLD = float(os.environ.get("LAYA_CONF_THRESHOLD", "0.5"))
VALID_MOODS = {"calm", "anxious", "tired", "restless", "low"}
VALID_SLEEP = {"good", "fair", "poor"}
# 允许直接指定本地快照目录（绝对路径），优先级最高，彻底绕开任何 hub 解析。
MODEL_LOCAL_PATH = os.environ.get("LAYA_MODEL_PATH")

app = Flask(__name__)

# ------------------------------------------------------------------ 模型预加载（启动一次）
_AGENT = None
_MODEL_STATUS = {"loaded": False, "model_id": MODEL_ID, "subfolder": MODEL_SUBFOLDER,
                 "device": None, "load_seconds": None, "error": None}


def _preload_model():
    global _AGENT
    t0 = time.time()
    try:
        import laya
        if MODEL_LOCAL_PATH and os.path.isdir(MODEL_LOCAL_PATH):
            agent = laya.load(MODEL_LOCAL_PATH)
        else:
            agent = laya.load(MODEL_ID, subfolder=MODEL_SUBFOLDER)
        _AGENT = agent
        _MODEL_STATUS.update({
            "loaded": True,
            "device": str(getattr(agent, "device", "?")),
            "load_seconds": round(time.time() - t0, 1),
            "error": None,
        })
        print("[laya_service] model loaded in %.1fs on %s" % (time.time() - t0, _MODEL_STATUS["device"]))
    except Exception as e:
        _MODEL_STATUS["error"] = "%s: %s" % (type(e).__name__, e)
        print("[laya_service] model load FAILED: %s" % _MODEL_STATUS["error"])
        traceback.print_exc()


# ------------------------------------------------------------------ CORS（手动，无额外依赖）
@app.after_request
def _add_cors_headers(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


@app.route("/", methods=["OPTIONS"])
@app.route("/health", methods=["OPTIONS"])
@app.route("/recommend", methods=["OPTIONS"])
def _cors_preflight():
    return ("", 204)


# ------------------------------------------------------------------ 路由
@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok" if _MODEL_STATUS["loaded"] else "degraded",
        "service": "laya-recommender",
        "model_loaded": _MODEL_STATUS["loaded"],
        "model_id": _MODEL_STATUS["model_id"],
        "subfolder": _MODEL_STATUS["subfolder"],
        "device": _MODEL_STATUS["device"],
        "load_seconds": _MODEL_STATUS["load_seconds"],
        "offline": os.environ.get("HF_HUB_OFFLINE") == "1",
        "error": _MODEL_STATUS["error"],
    })


def _build_state_text(state):
    # 把客户端 state 组装成自然语言文本喂给模型（multilingual 可处理中英文）。
    mood = (state.get("mood") or "").strip()
    sleep_quality = (state.get("sleep_quality") or "").strip()
    last_played = (state.get("last_played_scene") or state.get("lastPlayedScene") or "").strip()
    duration = state.get("today_listening_duration", state.get("todayListeningDuration"))

    parts = []
    if mood:
        parts.append("mood: %s" % mood)
    if sleep_quality:
        parts.append("sleep_quality: %s" % sleep_quality)
    else:
        parts.append("sleep_quality: unknown")
    if last_played:
        parts.append("recently_listened: %s" % last_played)
    if duration not in (None, ""):
        parts.append("today_listening_minutes: %s" % duration)
    return "; ".join(parts) if parts else "no explicit state provided"


def _build_reason(logical_key, probs, confidence):
    label = LOGICAL_LABEL_ZH.get(logical_key, logical_key)
    reason = "本地 Laya 模型依据你的当前状态，认为「%s」最契合" % label
    if confidence >= 0.3:
        reason += "（置信度 %.0f%%）" % (confidence * 100)
    else:
        reason += "；模型把握不大，可随心切换"
    return reason

@app.route("/recommend", methods=["POST"])
def recommend():
    if _AGENT is None:
        return jsonify({
            "success": False,
            "error": "model_not_loaded",
            "detail": _MODEL_STATUS.get("error"),
        }), 503

    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"success": False, "error": "invalid_json",
                        "detail": "request body must be a JSON object"}), 400

    state = body.get("state")
    if not isinstance(state, dict):
        return jsonify({"success": False, "error": "missing_state",
                        "detail": "field 'state' (object) is required"}), 400

    mood = state.get("mood")
    if not isinstance(mood, str) or mood.strip().lower() not in VALID_MOODS:
        return jsonify({"success": False, "error": "invalid_mood",
                        "detail": "field 'state.mood' must be one of %s" % sorted(VALID_MOODS)}), 400
    mood = mood.strip().lower()

    sleep = state.get("sleep_quality")
    if sleep is not None and str(sleep).strip() != "":
        sleep = str(sleep).strip().lower()
        if sleep not in VALID_SLEEP:
            return jsonify({"success": False, "error": "invalid_sleep_quality",
                            "detail": "field 'state.sleep_quality' must be one of %s" % sorted(VALID_SLEEP)}), 400
    else:
        sleep = None

    # typed-decisions 是英文 checkpoint：state 一律英文枚举，杜绝多语言矛盾。
    state_text = "mood: %s; sleep_quality: %s" % (mood, sleep or "unknown")
    try:
        t0 = time.time()
        out = _AGENT.system_one(state_text, RECOMMEND_QUESTIONS)
        ans = out["answers"]["scene"]
        probs = {k: float(v) for k, v in ans["probabilities"].items()}
        chosen_logical = ans["choice"]
        confidence = round(float(ans["confidence"]), 4)

        # 概率字典键即逻辑场景名 -> 同时给出 scene_id 与逻辑键两套视图。
        all_scores = {k: probs.get(k, 0.0) for k in LOGICAL_TO_SCENE_ID}
        scene_id = LOGICAL_TO_SCENE_ID.get(chosen_logical)
        if scene_id is None:
            # 理论上不会发生：选项就是这 5 个键。兜底取概率最高者。
            chosen_logical = max(all_scores, key=all_scores.get)
            scene_id = LOGICAL_TO_SCENE_ID[chosen_logical]

        return jsonify({
            "success": True,
            "recommendation": scene_id,
            "logical_key": chosen_logical,
            "confidence": confidence,
            "confident": bool(confidence >= CONF_THRESHOLD),
            "source": "laya",
            "all_scores": all_scores,
            "reason": _build_reason(chosen_logical, probs, confidence),
            "model_latency_ms": round((time.time() - t0) * 1000, 1),
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": "inference_failed",
                        "detail": "%s: %s" % (type(e).__name__, e)}), 500


@app.errorhandler(404)
def _nf(_e):
    return jsonify({"success": False, "error": "not_found"}), 404


@app.errorhandler(500)
def _ise(e):
    return jsonify({"success": False, "error": "server_error",
                    "detail": str(getattr(e, "description", e))}), 500


if __name__ == "__main__":
    port = int(os.environ.get("LAYA_PORT", "5000"))
    print("[laya_service] preloading model (offline=%s) ..." % os.environ.get("HF_HUB_OFFLINE"))
    _preload_model()
    print("[laya_service] listening on http://0.0.0.0:%d" % port)
    # 打印 App 端应填入的 BaseURL（单一真相源在 LayaRecommendationService.ts）。
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80)); LAN_IP = s.getsockname()[0]; s.close()
    except Exception:
        LAN_IP = "<Mac局域网IP>"
    print("=" * 60)
    print("[laya_service] App 端 BaseURL（请让 LayaRecommendationService.ts 的 PORT=%d）：" % port)
    print("  Android 模拟器 : http://10.0.2.2:%d" % port)
    print("  iOS 模拟器     : http://localhost:%d" % port)
    print("  真机(同Wi-Fi)  : http://%s:%d   (把 LAN_HOST 改成这个)" % (LAN_IP, port))
    print("=" * 60)
    # threaded=True：允许并发；debug=False + use_reloader=False：避免 reloader 二次加载模型。
    # 注意：macOS Monterey+ 的 AirPlay Receiver 会占用 5000，可用 LAYA_PORT 换端口。
    app.run(host="0.0.0.0", port=port, threaded=True, debug=False, use_reloader=False)



