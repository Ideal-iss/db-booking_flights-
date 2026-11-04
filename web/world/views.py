import json
from functools import wraps

from django.contrib import messages
from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.urls import reverse
from django.views.decorators.http import require_GET, require_POST

from booking.models import Airport

from . import content, logic
from .forms import RegisterForm
from .models import Achievement, EarnedAchievement, Landmark, ShopItem, Stamp, Trip, Visit


def _body(request):
    try:
        return json.loads(request.body or b"{}")
    except ValueError:
        return {}


def api(view):
    """JSON-API для игры: нужен вход и персонаж; ошибки игры превращаются в {"ok": false}."""

    @wraps(view)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated or not hasattr(request.user, "profile"):
            return JsonResponse({"ok": False, "error": "Войдите в игру."}, status=403)
        try:
            return view(request, request.user.profile, *args, **kwargs)
        except logic.WorldError as e:
            return JsonResponse({"ok": False, "error": str(e)}, status=400)

    return wrapper


def needs_profile(view):
    @wraps(view)
    @login_required
    def wrapper(request, *args, **kwargs):
        if not hasattr(request.user, "profile"):
            messages.info(request, "Создайте персонажа, чтобы играть.")
            return redirect("world:register")
        return view(request, *args, **kwargs)

    return wrapper


# ---------- Страницы ----------

def globe_data(world, current=None):
    """Данные мира → формат глобуса (booking/static/booking/globe.js)."""
    return {
        "airports": [
            {"code": a["code"], "lon": a["lon"], "lat": a["lat"],
             "kind": "current" if a["code"] == current else "visited" if a["visited"] else "unvisited"}
            for a in world["airports"]
        ],
        "arcs": [],
        "planes": [{**p, "mode": "timed", "trail": "short", "size": 16} for p in world["planes"]],
        "clock": {"h": world["now"], "speed": 60},
        "camera": {"mode": "spin"},
    }


def home(request):
    if request.user.is_authenticated and hasattr(request.user, "profile"):
        return redirect("world:play")
    world = logic.world_payload()
    return render(request, "world/home.html", {"globe": globe_data(world), "airports": len(world["airports"])})


def register(request):
    if request.user.is_authenticated and hasattr(request.user, "profile"):
        return redirect("world:play")
    form = RegisterForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        with transaction.atomic():
            user = form.save()
            logic.create_profile(user, form.cleaned_data["nickname"], form.cleaned_data["home"], form.cleaned_data["avatar"])
        login(request, user)
        messages.success(request, "Добро пожаловать в мир SkyBook! Подойдите к выходу на посадку, чтобы улететь.")
        return redirect("world:play")
    return render(request, "world/register.html", {"form": form, "choices": content.AVATAR_CHOICES})


@needs_profile
def cabinet(request):
    p = request.user.profile
    earned = {e.achievement_id: e.earned_at for e in EarnedAchievement.objects.filter(profile=p)}
    achievements = [{"a": a, "earned": earned.get(a.code)} for a in Achievement.objects.all()]
    visits = Visit.objects.filter(profile=p).select_related("airport").order_by("first_at")
    stamps = {s.landmark_id: s.created_at for s in Stamp.objects.filter(profile=p)}
    landmarks = [{"l": l, "at": stamps.get(l.pk)} for l in Landmark.objects.select_related("airport").order_by("airport__location")]
    trips = Trip.objects.filter(profile=p, landed=True).select_related("route__origin", "route__destination")[:12]
    return render(request, "world/cabinet.html", {
        "p": p,
        "achievements": achievements,
        "earned_count": len(earned),
        "visits": visits,
        "airports_total": Airport.objects.exclude(continent="").count(),
        "continents": len({v.airport.continent for v in visits}),
        "landmarks": landmarks,
        "stamps_count": len(stamps),
        "trips": trips,
        "globe": globe_data(logic.world_payload(p), p.airport_id),
        "avatar_json": json.dumps(p.avatar),
        "owned_items": list(ShopItem.objects.filter(code__in=logic.owned_codes(p)).values("code", "name", "slot")),
        "save_url": reverse("world:save_avatar"),
    })


@needs_profile
@require_POST
def save_avatar(request):
    p = request.user.profile
    data = _body(request) if request.content_type == "application/json" else json.loads(request.POST.get("avatar", "{}"))
    p.avatar = logic.clean_avatar(data, logic.owned_codes(p))
    p.save(update_fields=["avatar"])
    return JsonResponse({"ok": True, "avatar": p.avatar, "message": "Персонаж сохранён"})


@needs_profile
def shop(request):
    p = request.user.profile
    owned = logic.owned_codes(p)
    return render(request, "world/shop.html", {
        "p": p, "items": ShopItem.objects.all(), "owned": sorted(owned),
    })


@needs_profile
def play(request):
    p = request.user.profile
    names = ["tick", "map", "world", "departures", "board", "cancel", "coin", "stamp", "say", "emote", "shop", "login"]
    urls = {n: reverse(f"world:{n}") for n in names}
    return render(request, "world/play.html", {"p": p, "emotes": logic.EMOTES, "urls": urls})


# ---------- API ----------

@require_POST
@api
def api_tick(request, profile):
    return JsonResponse(logic.tick(profile, _body(request).get("pos")))


@require_GET
@api
def api_map(request, profile):
    return JsonResponse(logic.map_payload(profile))


@require_GET
@api
def api_world(request, profile):
    return JsonResponse(logic.world_payload(profile))


@require_GET
@api
def api_departures(request, profile):
    return JsonResponse({"ok": True, "departures": logic.departures_board(profile)})


@require_POST
@api
def api_board(request, profile):
    b = _body(request)
    trip = logic.board(profile, b.get("route"), b.get("dep"))
    return JsonResponse({"ok": True, "message": f"Билет {trip.route.number} → {trip.route.destination.city}. Место {trip.seat + 1}."})


@require_POST
@api
def api_cancel(request, profile):
    refund = logic.cancel(profile)
    return JsonResponse({"ok": True, "message": f"Билет сдан, вернули {refund} монет."})


@require_POST
@api
def api_coin(request, profile):
    value, events = logic.collect_coin(profile, int(_body(request).get("i", -1)))
    return JsonResponse({"ok": True, "value": value, "events": events})


@require_POST
@api
def api_stamp(request, profile):
    return JsonResponse({"ok": True, "events": logic.take_stamp(profile)})


@require_POST
@api
def api_say(request, profile):
    return JsonResponse({"ok": True, "events": logic.say(profile, str(_body(request).get("text", "")))})


@require_POST
@api
def api_emote(request, profile):
    logic.set_emote(profile, _body(request).get("emote", ""))
    return JsonResponse({"ok": True})


@require_POST
@api
def api_buy(request, profile):
    item, events = logic.buy(profile, _body(request).get("code", ""))
    profile.refresh_from_db()
    return JsonResponse({"ok": True, "message": f"Куплено: {item.name}", "events": events,
                         "coins": profile.coins, "avatar": profile.avatar})


@require_POST
@api
def api_equip(request, profile):
    b = _body(request)
    logic.equip(profile, b.get("slot", ""), b.get("code") or None)
    return JsonResponse({"ok": True, "avatar": profile.avatar})
