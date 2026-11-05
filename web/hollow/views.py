"""THE HOLLOW: страница игры и JSON-API (аккаунт, персонажи, лагерь, забеги, кооператив)."""

import base64
import hashlib
import hmac
import json
import random
import re
import time
from functools import wraps

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from . import game
from .models import HollowCharacter, HollowRun

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.@+\-]{3,30}$")
MAX_PICKUPS_PER_RUN = 60


def _body(request):
    try:
        data = json.loads(request.body or b"{}")
        return data if isinstance(data, dict) else {}
    except ValueError:
        return {}


def err(message, status=400):
    return JsonResponse({"ok": False, "error": message}, status=status)


def api(view):
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return err("Войдите в игру.", 403)
        try:
            return view(request, *args, **kwargs)
        except game.GameError as e:
            return err(str(e))

    return wrapper


def char_json(c, with_extra=True):
    d = dict(c.data)
    d.pop("bought", None)
    out = {"id": c.id, "name": c.name, "cls": c.cls, **d}
    if with_extra:
        stock = game.merchant_stock(c.id, d.get("merchantGen", 0), d["level"])
        bought = set(c.data.get("bought", []))
        out["merchant"] = [None if i in bought else it for i, it in enumerate(stock)]
    return out


def get_char(request, cid, lock=False):
    qs = HollowCharacter.objects.filter(user=request.user, pk=cid)
    if lock:
        qs = qs.select_for_update()
    c = qs.first()
    if not c:
        raise game.GameError("Персонаж не найден.")
    data = dict(c.data)
    if game.migrate_cleared(data):
        c.data = data
        c.save(update_fields=["data"])
    return c


def coop_url():
    return getattr(settings, "HOLLOW_COOP_URL", "")


@ensure_csrf_cookie
def index(request):
    return render(request, "hollow/index.html", {"coop_url": coop_url()})


# ---------------------------------------------------------------- аккаунт
@require_GET
def me(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": True, "user": None, "coop": bool(coop_url())})
    chars = [char_json(c, False) for c in request.user.hollow_characters.all()]
    return JsonResponse({"ok": True, "user": request.user.username, "characters": chars, "coop": bool(coop_url())})


@require_POST
def api_login(request):
    b = _body(request)
    user = authenticate(request, username=b.get("username", ""), password=b.get("password", ""))
    if not user:
        return err("Неверный логин или пароль.")
    login(request, user)
    return JsonResponse({"ok": True})


@require_POST
def api_register(request):
    b = _body(request)
    username, password = str(b.get("username", "")).strip(), str(b.get("password", ""))
    if not USERNAME_RE.match(username):
        return err("Логин: 3–30 символов, латиница, цифры и _.@+-")
    if User.objects.filter(username__iexact=username).exists():
        return err("Этот логин уже занят.")
    user = User(username=username)
    try:
        validate_password(password, user)
    except ValidationError as e:
        return err(" ".join(e.messages))
    user.set_password(password)
    user.save()
    login(request, user)
    return JsonResponse({"ok": True})


@require_POST
def api_logout(request):
    logout(request)
    return JsonResponse({"ok": True})


# ---------------------------------------------------------------- персонажи
@require_POST
@api
def create_character(request):
    b = _body(request)
    name = " ".join(str(b.get("name", "")).split())
    cls = b.get("cls")
    if cls not in game.CLASSES:
        return err("Выберите класс.")
    if not game.NAME_RE.match(name):
        return err("Имя: 3–20 букв, цифр, пробелов или дефисов.")
    if request.user.hollow_characters.count() >= game.MAX_CHARACTERS:
        return err(f"Не больше {game.MAX_CHARACTERS} персонажей.")
    if HollowCharacter.objects.filter(name_key=name.casefold()).exists():
        return err("Это имя уже занято.")
    data = game.new_character_data(cls, game.clean_appearance(b.get("appearance")))
    try:
        c = HollowCharacter.objects.create(user=request.user, name=name, cls=cls, data=data)
    except IntegrityError:
        return err("Это имя уже занято.")
    return JsonResponse({"ok": True, "character": char_json(c)})


@api
def character(request, cid):
    if request.method == "DELETE":
        get_char(request, cid).delete()
        return JsonResponse({"ok": True})
    return JsonResponse({"ok": True, "character": char_json(get_char(request, cid))})


@require_POST
@api
def character_op(request, cid):
    with transaction.atomic():
        c = get_char(request, cid, lock=True)
        data = dict(c.data)
        data["cls"] = c.cls
        msg = game.apply_op(c.id, data, _body(request))
        data.pop("cls", None)
        c.data = data
        c.save()
    return JsonResponse({"ok": True, "message": msg, "character": char_json(c)})


# ---------------------------------------------------------------- забеги
@require_POST
@api
def run_start(request, cid):
    b = _body(request)
    dungeon = b.get("dungeon")
    with transaction.atomic():
        c = get_char(request, cid, lock=True)
        p = game.parse_stage(dungeon)
        if not p:
            return err("Неизвестное подземелье.")
        if not game.stage_unlocked(dungeon, c.data.get("cleared", [])):
            if p[1]:
                return err("Кошмар откроется после победы над Полым Сердцем.")
            return err(f"Сначала пройдите: {game.stage_name(p[0]['unlock'])}.")
        # незавершённые забеги считаются проваленными
        c.runs.filter(finished__isnull=True, coop=False).update(finished=timezone.now(), success=False)
        run = HollowRun.objects.create(
            character=c, dungeon=dungeon, seed=random.randrange(1, 2**31 - 1), level=game.run_level(dungeon, c.data["level"]),
        )
    return JsonResponse({"ok": True, "run": {"id": str(run.id), "dungeon": dungeon, "seed": run.seed, "level": run.level}})


def _pickup(run, c, item):
    if run.finished:
        raise game.GameError("Забег уже завершён.")
    if run.picked >= MAX_PICKUPS_PER_RUN:
        raise game.GameError("Слишком много добычи за один забег.")
    clean = game.validate_item(item, run.level + 2)
    data = dict(c.data)
    pos = game.free_pos(data["inventory"], game.INVENTORY_SIZE)
    if pos is None:
        raise game.GameError("Сумка полна.")
    clean["pos"] = pos
    data["inventory"] = data["inventory"] + [clean]
    c.data = data
    c.save()
    run.picked += 1
    run.save(update_fields=["picked"])
    return clean


@require_POST
@api
def run_pickup(request, cid, rid):
    with transaction.atomic():
        c = get_char(request, cid, lock=True)
        run = HollowRun.objects.select_for_update().filter(pk=rid, character=c, coop=False).first()
        if not run:
            return err("Забег не найден.")
        item = _pickup(run, c, _body(request).get("item"))
    return JsonResponse({"ok": True, "item": item})


def _finish(run, c, success, res):
    if run.finished:
        raise game.GameError("Забег уже завершён.")
    data = dict(c.data)
    game.migrate_cleared(data)
    boss = game.stage_boss(run.dungeon)
    summary = game.apply_run_result(data, run.level, success, res, boss)
    # этап засчитан, только если убит его страж и герой вышел через портал
    killed_boss = bool(boss) and boss in (res.get("bosses") or [])
    summary["cleared"] = bool(success and killed_boss)
    if success and killed_boss and run.dungeon not in data["cleared"]:
        data["cleared"] = data["cleared"] + [run.dungeon]
        summary["unlocked"] = game.unlocked_by(run.dungeon)
        summary["firstClear"] = True
    c.data = data
    c.save()
    run.finished = timezone.now()
    run.success = bool(success)
    run.result = summary
    run.save()
    return summary


@require_POST
@api
def run_finish(request, cid, rid):
    b = _body(request)
    with transaction.atomic():
        c = get_char(request, cid, lock=True)
        run = HollowRun.objects.select_for_update().filter(pk=rid, character=c, coop=False).first()
        if not run:
            return err("Забег не найден.")
        summary = _finish(run, c, bool(b.get("success")), b.get("result") or {})
    return JsonResponse({"ok": True, "summary": summary, "character": char_json(c)})


# ---------------------------------------------------------------- кооператив
def _secret():
    return getattr(settings, "HOLLOW_COOP_SECRET", "").encode()


def _sign(raw: bytes) -> str:
    return hmac.new(_secret(), raw, hashlib.sha256).hexdigest()


@require_POST
@api
def coop_token(request, cid):
    """Подписанный снимок персонажа для сервера кооператива."""
    if not _secret() or not coop_url():
        return err("Кооператив пока не подключён на этом сервере.")
    c = get_char(request, cid)
    payload = {"char": c.id, "name": c.name, "user": request.user.username, "data": char_json(c, False), "exp": int(time.time()) + 600}
    raw = base64.urlsafe_b64encode(json.dumps(payload, ensure_ascii=False).encode())
    return JsonResponse({"ok": True, "token": f"{raw.decode()}.{_sign(raw)}", "url": coop_url()})


@csrf_exempt
@require_POST
def coop_report(request):
    """Вызывается только сервером кооператива: тело подписано общим секретом."""
    if not _secret():
        return err("disabled", 404)
    sig = request.headers.get("X-Hollow-Sig", "")
    if not hmac.compare_digest(sig, _sign(request.body)):
        return err("bad signature", 403)
    b = _body(request)
    if abs(time.time() - b.get("ts", 0)) > 120:
        return err("stale", 403)
    kind = b.get("kind")
    try:
        with transaction.atomic():
            if kind == "start":
                dungeon = b.get("dungeon")
                if not game.parse_stage(dungeon):
                    return err("bad dungeon")
                chars = list(HollowCharacter.objects.select_for_update().filter(pk__in=b.get("chars", [])))
                level = max(game.run_level(dungeon, c.data["level"]) for c in chars) if chars else 1
                runs = {}
                for c in chars:
                    r = HollowRun.objects.create(character=c, dungeon=dungeon, seed=int(b.get("seed", 1)), level=level, coop=True)
                    runs[c.id] = str(r.id)
                return JsonResponse({"ok": True, "level": level, "runs": runs})
            run = HollowRun.objects.select_for_update().filter(pk=b.get("run"), coop=True).first()
            if not run:
                return err("run not found", 404)
            c = HollowCharacter.objects.select_for_update().get(pk=run.character_id)
            if kind == "pickup":
                item = _pickup(run, c, b.get("item"))
                return JsonResponse({"ok": True, "item": item})
            if kind == "finish":
                summary = _finish(run, c, bool(b.get("success")), b.get("result") or {})
                return JsonResponse({"ok": True, "summary": summary})
    except game.GameError as e:
        return err(str(e))
    return err("unknown kind")
