"""Правила мира: расписание, посадка, прилёт, награды, присутствие игроков."""

import math
import random
from datetime import datetime, timedelta, timezone as dt_tz

from django.db import IntegrityError, transaction
from django.db.models import Count
from django.utils import timezone

from booking.models import Airport

from . import content
from .models import (
    Achievement, ChatMessage, CoinPickup, EarnedAchievement, Landmark, OwnedItem, Profile, Route,
    ShopItem, Stamp, Trip, Visit,
)

SEATS = 24  # 6 рядов по 4 кресла
BOARDING_WINDOW_S = 6 * 60  # на табло — вылеты ближайших 6 минут
BOARDING_CLOSES_S = 3
ONLINE_S = 15
EMOTE_S = 4
CHAT_KEEP_S = 90
FIRST_VISIT_BONUS = 30
STAMP_BONUS = 50
EMOTES = ["👋", "😄", "😍", "😮", "😢", "👍", "🎉", "❤️"]


class WorldError(Exception):
    """Ошибка, понятная игроку."""


# ---------- География и маршруты ----------

def distance_km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a.latitude, a.longitude, b.latitude, b.longitude))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def world_airports():
    return list(Airport.objects.exclude(latitude=None).exclude(longitude=None).exclude(continent=""))


def build_network(airports, neighbours=6, near_km=2500, max_km=11000):
    """Каждый аэропорт связан с ближайшими соседями и со всеми в радиусе near_km."""
    links = set()
    for a in airports:
        others = sorted((distance_km(a, b), b.code) for b in airports if b.code != a.code)
        for i, (d, code) in enumerate(others):
            if d <= max_km and (i < neighbours or d <= near_km):
                links.add(tuple(sorted((a.code, code))))
    return links


@transaction.atomic
def seed_world():
    rnd = random.Random(2026)
    airports = {a.code: a for a in world_airports()}
    created = 0
    for a_code, b_code in sorted(build_network(list(airports.values()))):
        for o, d in ((a_code, b_code), (b_code, a_code)):
            km = distance_km(airports[o], airports[d])
            period = rnd.choice([120, 150, 180])
            _, was_created = Route.objects.get_or_create(
                origin_id=o, destination_id=d,
                defaults={
                    "number": f"SB{rnd.randint(100, 999)}",
                    "distance_km": round(km),
                    "duration_s": int(min(140, max(45, 40 + km / 120))),
                    "period_s": period,
                    "offset_s": rnd.randrange(period),
                    "price": int(10 + km / 200),
                },
            )
            created += was_created
    for code, (name, kind, fact) in content.LANDMARKS.items():
        if code in airports:
            Landmark.objects.update_or_create(airport_id=code, defaults={"name": name, "kind": kind, "fact": fact})
    for i, (code, icon, title, desc, reward) in enumerate(content.ACHIEVEMENTS):
        Achievement.objects.update_or_create(
            code=code, defaults={"icon": icon, "title": title, "description": desc, "reward": reward, "order": i}
        )
    for i, (code, name, slot, price) in enumerate(content.SHOP):
        ShopItem.objects.update_or_create(code=code, defaults={"name": name, "slot": slot, "price": price, "order": i})
    return created


def _epoch(dt):
    return dt.timestamp()


def _from_epoch(sec):
    return datetime.fromtimestamp(sec, tz=dt_tz.utc)


def departures_of(route, now, horizon_s=BOARDING_WINDOW_S):
    """Времена вылетов маршрута в ближайшие horizon_s секунд."""
    t = _epoch(now)
    k = math.ceil((t - route.offset_s) / route.period_s)
    out = []
    while True:
        dep = route.offset_s + k * route.period_s
        if dep > t + horizon_s:
            return out
        out.append(_from_epoch(dep))
        k += 1


# ---------- Профиль и положение ----------

def create_profile(user, nickname, home, avatar):
    lay = content.layout(home.code)
    profile = Profile.objects.create(
        user=user, nickname=nickname, home=home, airport=home, avatar=clean_avatar(avatar),
        x=lay["spawn"][0], y=lay["spawn"][1],
    )
    Visit.objects.create(profile=profile, airport=home)
    return profile


def clean_avatar(data, owned=()):
    c = content.AVATAR_CHOICES
    out = {}

    def idx(key, n):
        try:
            v = int(data.get(key, 0))
        except (TypeError, ValueError):
            v = 0
        return v if 0 <= v < n else 0

    out["skin"] = idx("skin", c["skin"])
    out["hair"] = data.get("hair") if data.get("hair") in c["hair"] else "short"
    out["hair_color"] = idx("hair_color", c["hair_color"])
    out["top"] = idx("top", c["top"])
    out["bottom"] = idx("bottom", c["bottom"])
    # Вещи из магазина — только купленные
    for slot in ("hat", "glasses", "outfit", "extra"):
        if data.get(slot) and data.get(slot) in owned:
            out[slot] = data[slot]
    return out


def active_trip(profile):
    return Trip.objects.filter(profile=profile, landed=False).select_related("route__origin", "route__destination").first()


def status_of(trip, now):
    if not trip:
        return "ground"
    if now < trip.departure_at:
        return "boarding"
    if now < trip.arrival_at:
        return "flying"
    return "landed"


# ---------- Достижения ----------

def check_achievements(profile, flags=()):
    """Выдаёт заслуженные достижения и награды. Возвращает список новых."""
    have = set(EarnedAchievement.objects.filter(profile=profile).values_list("achievement_id", flat=True))
    visits = Visit.objects.filter(profile=profile).select_related("airport")
    n_airports = visits.count()
    continents = {v.airport.continent for v in visits}
    stamps = Stamp.objects.filter(profile=profile).count()
    total_airports = Airport.objects.exclude(continent="").count()
    total_landmarks = Landmark.objects.count()
    items = OwnedItem.objects.filter(profile=profile).count()
    rules = {
        "first_flight": profile.flights_count >= 1,
        "airports_5": n_airports >= 5,
        "airports_15": n_airports >= 15,
        "airports_all": n_airports >= total_airports > 0,
        "continents_3": len(continents) >= 3,
        "continents_6": len(continents) >= 6,
        "long_haul": "long_haul" in flags,
        "km_50000": profile.km_flown >= 50000,
        "stamps_5": stamps >= 5,
        "stamps_all": stamps >= total_landmarks > 0,
        "company": "company" in flags,
        "chatter": profile.messages_sent >= 10,
        "collector": profile.coins_collected >= 100,
        "shopper": items >= 3,
    }
    new = []
    for ach in Achievement.objects.filter(code__in=[k for k, ok in rules.items() if ok and k not in have]):
        try:
            with transaction.atomic():
                EarnedAchievement.objects.create(profile=profile, achievement=ach)
        except IntegrityError:
            continue
        profile.coins += ach.reward
        new.append({"type": "achievement", "icon": ach.icon, "title": ach.title, "reward": ach.reward})
    if new:
        profile.save(update_fields=["coins"])
    return new


# ---------- Посадка, прилёт ----------

def process_landing(profile, now=None):
    """Если самолёт игрока приземлился — переносит его в аэропорт прилёта и выдаёт награды."""
    now = now or timezone.now()
    events = []
    with transaction.atomic():
        trip = (
            Trip.objects.select_for_update()
            .filter(profile=profile, landed=False, arrival_at__lte=now)
            .select_related("route__destination")
            .first()
        )
        if not trip:
            return events
        dest = trip.route.destination
        trip.landed = True
        trip.save(update_fields=["landed"])
        lay = content.layout(dest.code)
        profile.airport = dest
        profile.x, profile.y = lay["spawn"][0] + random.randint(-50, 50), lay["spawn"][1] + random.randint(-20, 30)
        profile.flights_count += 1
        profile.km_flown += trip.route.distance_km
        _, first = Visit.objects.get_or_create(profile=profile, airport=dest)
        if first:
            profile.coins += FIRST_VISIT_BONUS
            events.append({"type": "visit", "icon": "📍", "title": f"Новый аэропорт: {dest.city}", "reward": FIRST_VISIT_BONUS})
        profile.save()
        flags = []
        if trip.route.distance_km >= 8000:
            flags.append("long_haul")
        if Trip.objects.filter(route=trip.route, departure_at=trip.departure_at).exclude(profile=profile).exists():
            flags.append("company")
        events += check_achievements(profile, flags)
    return events


def departures_board(profile, now=None):
    now = now or timezone.now()
    routes = list(Route.objects.filter(origin=profile.airport).select_related("destination"))
    visited = set(Visit.objects.filter(profile=profile).values_list("airport_id", flat=True))
    slots = []
    for r in routes:
        for dep in departures_of(r, now):
            if (dep - now).total_seconds() > BOARDING_CLOSES_S:
                slots.append((dep, r))
    slots.sort(key=lambda s: s[0])
    slots = slots[:14]
    # Кто уже купил билеты на эти вылеты
    riders = {}
    if slots:
        for t in Trip.objects.filter(route__in=[r for _, r in slots], departure_at__in=[d for d, _ in slots]).select_related("profile"):
            riders.setdefault((t.route_id, t.departure_at), []).append(t.profile.nickname)
    return [
        {
            "route": r.id, "number": r.number, "to": r.destination_id, "city": r.destination.city,
            "continent": r.destination.continent, "dep": _epoch(dep), "duration": r.duration_s,
            "km": r.distance_km, "price": r.price, "new": r.destination_id not in visited,
            "taken": len(riders.get((r.id, dep), [])), "seats": SEATS, "riders": riders.get((r.id, dep), [])[:6],
        }
        for dep, r in slots
    ]


@transaction.atomic
def board(profile, route_id, dep_epoch):
    now = timezone.now()
    profile = Profile.objects.select_for_update().get(pk=profile.pk)
    if active_trip(profile):
        raise WorldError("У вас уже есть билет.")
    try:
        route = Route.objects.select_related("destination").get(pk=route_id, origin=profile.airport)
    except Route.DoesNotExist:
        raise WorldError("Этот рейс вылетает из другого аэропорта.")
    dep = _from_epoch(float(dep_epoch))
    if not any(abs((d - dep).total_seconds()) < 1 for d in departures_of(route, now)):
        raise WorldError("Такого вылета нет в расписании.")
    if (dep - now).total_seconds() <= BOARDING_CLOSES_S:
        raise WorldError("Посадка уже закончилась.")
    lay = content.layout(profile.airport_id)
    if not content.in_rect(profile.x, profile.y, lay["gate"], pad=60):
        raise WorldError("Подойдите к выходу на посадку у терминала.")
    if profile.coins < route.price:
        raise WorldError(f"Не хватает монет: билет стоит {route.price}.")
    taken = set(Trip.objects.filter(route=route, departure_at=dep).values_list("seat", flat=True))
    free = [s for s in range(SEATS) if s not in taken]
    if not free:
        raise WorldError("В самолёте не осталось мест.")
    trip = Trip.objects.create(
        profile=profile, route=route, departure_at=dep,
        arrival_at=dep + timedelta(seconds=route.duration_s), seat=random.choice(free[:8]), price=route.price,
    )
    profile.coins -= route.price
    profile.save(update_fields=["coins"])
    return trip


@transaction.atomic
def cancel(profile):
    profile = Profile.objects.select_for_update().get(pk=profile.pk)
    trip = active_trip(profile)
    if not trip or timezone.now() >= trip.departure_at:
        raise WorldError("Сдать можно только билет на ещё не улетевший рейс.")
    profile.coins += trip.price
    profile.save(update_fields=["coins"])
    trip.delete()
    return trip.price


# ---------- Территория: монеты, штампы, чат, эмоции ----------

def coin_window(now=None):
    return int(_epoch(now or timezone.now()) // content.COIN_WINDOW_S)


def visible_coins(profile, now=None):
    window = coin_window(now)
    picked = set(CoinPickup.objects.filter(profile=profile, airport=profile.airport, window=window).values_list("index", flat=True))
    return [{"i": i, "x": x, "y": y, "v": v} for i, x, y, v in content.coins(profile.airport_id, window) if i not in picked]


@transaction.atomic
def collect_coin(profile, index):
    profile = Profile.objects.select_for_update().get(pk=profile.pk)
    if status_of(active_trip(profile), timezone.now()) == "flying":
        raise WorldError("Вы в самолёте.")
    window = coin_window()
    coin = next((c for c in content.coins(profile.airport_id, window) if c[0] == index), None)
    if not coin:
        raise WorldError("Монета уже исчезла.")
    _, x, y, value = coin
    if math.hypot(profile.x - x, profile.y - y) > content.PICK_RADIUS + 40:
        raise WorldError("Слишком далеко.")
    try:
        with transaction.atomic():
            CoinPickup.objects.create(profile=profile, airport=profile.airport, window=window, index=index)
    except IntegrityError:
        raise WorldError("Эту монету вы уже подобрали.")
    profile.coins += value
    profile.coins_collected += value
    profile.save(update_fields=["coins", "coins_collected"])
    return value, check_achievements(profile)


@transaction.atomic
def take_stamp(profile):
    profile = Profile.objects.select_for_update().get(pk=profile.pk)
    landmark = Landmark.objects.filter(airport=profile.airport).first()
    if not landmark:
        raise WorldError("Здесь нет достопримечательности.")
    lay = content.layout(profile.airport_id)
    lm = lay["landmark"]
    if math.hypot(profile.x - lm["x"], profile.y - lm["y"]) > content.STAMP_RADIUS + 40:
        raise WorldError("Подойдите ближе к достопримечательности.")
    _, created = Stamp.objects.get_or_create(profile=profile, landmark=landmark)
    if not created:
        raise WorldError("Этот штамп уже есть в вашем паспорте.")
    profile.coins += STAMP_BONUS
    profile.save(update_fields=["coins"])
    events = [{"type": "stamp", "icon": "📸", "title": f"Штамп: {landmark.name}", "reward": STAMP_BONUS, "fact": landmark.fact}]
    return events + check_achievements(profile)


def place_of(profile, trip, now):
    st = status_of(trip, now)
    if st == "flying":
        return f"FL:{trip.route_id}:{int(_epoch(trip.departure_at))}"
    return f"AP:{profile.airport_id}"


def say(profile, text):
    text = " ".join(text.split())[:120]
    if not text:
        raise WorldError("Пустое сообщение.")
    now = timezone.now()
    recent = ChatMessage.objects.filter(profile=profile, created_at__gte=now - timedelta(seconds=10)).count()
    if recent >= 5:
        raise WorldError("Не так быстро!")
    trip = active_trip(profile)
    ChatMessage.objects.create(profile=profile, place=place_of(profile, trip, now), text=text)
    Profile.objects.filter(pk=profile.pk).update(messages_sent=profile.messages_sent + 1)
    profile.messages_sent += 1
    # Чистим старые сообщения, чтобы таблица не росла бесконечно.
    ChatMessage.objects.filter(created_at__lt=now - timedelta(hours=6)).delete()
    return check_achievements(profile)


def set_emote(profile, emote):
    if emote not in EMOTES:
        raise WorldError("Нет такой эмоции.")
    Profile.objects.filter(pk=profile.pk).update(emote=emote, emote_at=timezone.now())


# ---------- Магазин ----------

@transaction.atomic
def buy(profile, code):
    profile = Profile.objects.select_for_update().get(pk=profile.pk)
    item = ShopItem.objects.filter(code=code).first()
    if not item:
        raise WorldError("Такой вещи нет.")
    if OwnedItem.objects.filter(profile=profile, item=item).exists():
        raise WorldError("Эта вещь уже ваша.")
    if profile.coins < item.price:
        raise WorldError(f"Не хватает монет: нужно {item.price}.")
    OwnedItem.objects.create(profile=profile, item=item)
    profile.coins -= item.price
    profile.avatar = {**profile.avatar, item.slot: item.code}  # сразу надеваем
    profile.save(update_fields=["coins", "avatar"])
    return item, check_achievements(profile)


def owned_codes(profile):
    return set(OwnedItem.objects.filter(profile=profile).values_list("item_id", flat=True))


def equip(profile, slot, code):
    if slot not in ("hat", "glasses", "outfit", "extra"):
        raise WorldError("Нет такого слота.")
    avatar = dict(profile.avatar)
    if code:
        item = ShopItem.objects.filter(code=code, slot=slot).first()
        if not item or code not in owned_codes(profile):
            raise WorldError("Сначала купите эту вещь.")
        avatar[slot] = code
    else:
        avatar.pop(slot, None)
    profile.avatar = avatar
    profile.save(update_fields=["avatar"])


# ---------- Общее состояние для игрового экрана ----------

def _player(p, now):
    emote = p.emote if p.emote_at and (now - p.emote_at).total_seconds() < EMOTE_S else ""
    return {"id": p.id, "nick": p.nickname, "avatar": p.avatar, "x": round(p.x), "y": round(p.y),
            "facing": p.facing, "moving": p.moving, "emote": emote}


def tick(profile, pos=None):
    """Главный запрос игры: сохраняет моё положение и возвращает всё, что видно вокруг."""
    now = timezone.now()
    events = process_landing(profile, now)
    if events:
        profile.refresh_from_db()
    trip = active_trip(profile)
    st = status_of(trip, now)

    fields = {"last_seen": now}
    if pos and st != "flying":
        lay = content.layout(profile.airport_id)
        fields.update(
            x=min(max(float(pos.get("x", profile.x)), 0), lay["w"]),
            y=min(max(float(pos.get("y", profile.y)), 0), lay["h"]),
            facing=1 if pos.get("facing", 1) >= 0 else -1,
            moving=bool(pos.get("moving")),
        )
    Profile.objects.filter(pk=profile.pk).update(**fields)
    for k, v in fields.items():
        setattr(profile, k, v)

    place = place_of(profile, trip, now)
    online_since = now - timedelta(seconds=ONLINE_S)
    data = {
        "now": _epoch(now),
        "status": st,
        "events": events,
        "me": {
            "id": profile.id, "nick": profile.nickname, "coins": profile.coins, "avatar": profile.avatar,
            "airport": profile.airport_id, "city": profile.airport.city,
            "x": round(profile.x), "y": round(profile.y),
        },
        "trip": None,
        "others": [],
        "cabin": [],
        "chat": [
            {"id": m.id, "nick": m.profile.nickname, "pid": m.profile_id, "text": m.text, "at": _epoch(m.created_at)}
            for m in ChatMessage.objects.filter(place=place, created_at__gte=now - timedelta(seconds=CHAT_KEEP_S))
            .select_related("profile")[:20]
        ][::-1],
        "online": Profile.objects.filter(last_seen__gte=online_since).count(),
    }
    if trip:
        r = trip.route
        data["trip"] = {
            "route": r.id, "number": r.number, "from": r.origin_id, "to": r.destination_id,
            "from_city": r.origin.city, "to_city": r.destination.city,
            "dep": _epoch(trip.departure_at), "arr": _epoch(trip.arrival_at), "seat": trip.seat,
            "km": r.distance_km, "price": trip.price,
            "from_pt": [r.origin.longitude, r.origin.latitude], "to_pt": [r.destination.longitude, r.destination.latitude],
        }
    if st == "flying":
        mates = Trip.objects.filter(route=trip.route, departure_at=trip.departure_at).select_related("profile")
        data["cabin"] = [{**_player(t.profile, now), "seat": t.seat} for t in mates]
    else:
        flying_ids = set(
            Trip.objects.filter(landed=False, departure_at__lte=now, profile__airport=profile.airport)
            .values_list("profile_id", flat=True)
        )
        data["others"] = [
            _player(p, now)
            for p in Profile.objects.filter(airport=profile.airport, last_seen__gte=online_since)
            .exclude(pk=profile.pk).exclude(pk__in=flying_ids)[:40]
        ]
        data["coins"] = visible_coins(profile, now)
    return data


def map_payload(profile):
    """Карта территории текущего аэропорта (отправляется при входе в аэропорт)."""
    lay = content.layout(profile.airport_id)
    lm = Landmark.objects.filter(airport=profile.airport).first()
    stamped = bool(lm and Stamp.objects.filter(profile=profile, landmark=lm).exists())
    a = profile.airport
    return {
        **lay,
        "code": a.code, "city": a.city, "airport_name": a.name,
        "landmark": {**lay["landmark"], "name": lm.name if lm else "", "kind": lm.kind if lm else "",
                     "fact": lm.fact if lm else "", "stamped": stamped},
    }


def world_payload(profile=None):
    """Глобус мира: все аэропорты, посещённые отмечены, самолёты в воздухе прямо сейчас."""
    now = timezone.now()
    visited = set(Visit.objects.filter(profile=profile).values_list("airport_id", flat=True)) if profile else set()
    airports = [
        {"code": a.code, "city": a.city, "lon": a.longitude, "lat": a.latitude, "continent": a.continent,
         "visited": a.code in visited}
        for a in world_airports()
    ]
    flights = (
        Trip.objects.filter(departure_at__lte=now, arrival_at__gt=now)
        .values("route__origin__longitude", "route__origin__latitude", "route__destination__longitude",
                "route__destination__latitude", "departure_at", "arrival_at", "route_id")
        .annotate(n=Count("id"))
    )
    planes = [
        {"from": [f["route__origin__longitude"], f["route__origin__latitude"]],
         "to": [f["route__destination__longitude"], f["route__destination__latitude"]],
         "dep": _epoch(f["departure_at"]), "arr": _epoch(f["arrival_at"]), "n": f["n"]}
        for f in flights
    ]
    return {"airports": airports, "planes": planes, "now": _epoch(now)}
