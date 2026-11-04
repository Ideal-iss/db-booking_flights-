"""Правила игры «Кругосветка».

Очки:
  +100 за каждый новый аэропорт, куда игрок прилетел;
  +300 за каждый новый континент (кроме стартового);
  +250 бонус «Кругосветка», если к концу игры вернулся в стартовый аэропорт,
        облетев хотя бы 3 других.
При равенстве очков выше тот, у кого осталось больше денег.
"""

import math
import random

from django.db import transaction
from django.db.models import Count, Prefetch
from django.utils import timezone

from booking.models import Airport

from .models import PLAYER_COLORS, GameEvent, GameFlight, GamePlayer, GameRoom, GameTicket

POINTS_AIRPORT = 100
POINTS_CONTINENT = 300
POINTS_HOME = 250
CONNECTION_H = 0.75  # минимальная пересадка, игровых часов
REFUND_SHARE = 0.7  # при отмене возвращается 70% стоимости
DEPARTURES_WINDOW_H = 36
MAX_PLAYERS = len(PLAYER_COLORS)


class GameError(Exception):
    """Ошибка, которую нужно показать игроку."""


# ---------- Сеть маршрутов и расписание ----------

def distance_km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a.latitude, a.longitude, b.latitude, b.longitude))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def game_airports():
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


def generate_timetable(room, rnd=None):
    rnd = rnd or random.Random()
    airports = {a.code: a for a in game_airports()}
    flights = []
    for a_code, b_code in sorted(build_network(list(airports.values()))):
        for origin, dest in ((a_code, b_code), (b_code, a_code)):
            a, b = airports[origin], airports[dest]
            km = distance_km(a, b)
            duration = round((km / 820 + 0.6) * 4) / 4  # шаг 15 минут
            every = rnd.choice([6, 8, 10, 12])
            dep = rnd.uniform(0.5, every)
            number = f"{origin[:2]}{rnd.randint(100, 999)}"
            while dep < room.duration_h:
                flights.append(
                    GameFlight(
                        room=room, number=number, origin=a, destination=b,
                        departure_h=round(dep * 4) / 4,
                        arrival_h=round(dep * 4) / 4 + duration,
                        base_price=round(35 + km * 0.075),
                        seats=room.seats_per_flight,
                    )
                )
                dep += every + rnd.uniform(-1, 1)
    GameFlight.objects.bulk_create(flights, batch_size=500)
    return len(flights)


# ---------- Комнаты и игроки ----------

def log(room, at_h, text):
    GameEvent.objects.create(room=room, at_h=at_h, text=text[:200])


def create_room(host_name, start_airport=None):
    start_airport = start_airport or random.choice(game_airports())
    room = GameRoom.objects.create(start_airport=start_airport)
    player = add_player(room, host_name, is_host=True)
    return room, player


def add_player(room, name, is_host=False):
    name = name.strip()[:24]
    if not name:
        raise GameError("Введите имя.")
    if room.status == GameRoom.Status.FINISHED:
        raise GameError("Эта игра уже закончилась.")
    taken = set(room.players.values_list("color", flat=True))
    if len(taken) >= MAX_PLAYERS:
        raise GameError("В комнате уже максимум игроков.")
    if room.players.filter(name__iexact=name).exists():
        raise GameError("Это имя уже занято в комнате.")
    color = next(c for c in PLAYER_COLORS if c not in taken)
    player = GamePlayer.objects.create(room=room, name=name, color=color, is_host=is_host, money=room.budget)
    log(room, room.clock_h(), f"{name} присоединяется к игре")
    return player


@transaction.atomic
def start_game(room, player):
    room = GameRoom.objects.select_for_update().get(pk=room.pk)
    if not player.is_host:
        raise GameError("Начать игру может только создатель комнаты.")
    if room.status != GameRoom.Status.LOBBY:
        raise GameError("Игра уже началась.")
    n = room.players.count()
    # Мест на рейсе примерно вдвое меньше, чем игроков, — за билеты придётся бороться.
    room.seats_per_flight = max(1, math.ceil(n / 2)) if n > 1 else 2
    room.save(update_fields=["seats_per_flight"])
    generate_timetable(room)
    room.status = GameRoom.Status.RUNNING
    room.started_at = timezone.now()
    room.save(update_fields=["status", "started_at"])
    log(room, 0, f"Старт! Аэропорт {room.start_airport.code} · {room.start_airport.city}")
    return room


# ---------- Положение игрока и очки ----------

class Journey:
    """Где игрок сейчас и где он уже побывал — по его билетам."""

    def __init__(self, player, clock, tickets=None):
        self.player = player
        self.clock = clock
        room = player.room
        tickets = tickets if tickets is not None else list(
            player.tickets.select_related("flight__origin", "flight__destination")
        )
        tickets.sort(key=lambda t: t.flight.departure_h)
        self.landed = [t for t in tickets if t.flight.arrival_h <= clock]
        self.in_air = next((t for t in tickets if t.flight.departure_h <= clock < t.flight.arrival_h), None)
        self.pending = next((t for t in tickets if t.flight.departure_h > clock), None)
        self.airport = self.landed[-1].flight.destination if self.landed else room.start_airport

    @property
    def visited(self):
        """Аэропорты, где игрок побывал, по порядку (стартовый — первый)."""
        seen = [self.player.room.start_airport]
        for t in self.landed:
            if t.flight.destination not in seen:
                seen.append(t.flight.destination)
        return seen

    def next_departure_point(self):
        """Откуда и не раньше какого часа игрок может улететь следующим рейсом."""
        if self.pending:
            return None, None
        if self.in_air:
            return self.in_air.flight.destination, self.in_air.flight.arrival_h + CONNECTION_H
        return self.airport, self.clock

    def score(self):
        start = self.player.room.start_airport
        visited = self.visited
        new_airports = len(visited) - 1
        continents = {a.continent for a in visited} - {start.continent}
        home = self.airport == start and new_airports >= 3 and not self.in_air
        points = new_airports * POINTS_AIRPORT + len(continents) * POINTS_CONTINENT + (POINTS_HOME if home else 0)
        return {
            "points": points,
            "airports": new_airports,
            "continents": len(continents) + 1,
            "home_bonus": home,
        }


def finalize(room):
    """Фиксирует итоговые очки игроков (один раз, когда партия закончилась)."""
    players = list(room.players.filter(final_score=None))
    for p in players:
        s = Journey(p, room.duration_h).score()
        p.final_score = s["points"]
        p.final_airports = s["airports"]
        p.save(update_fields=["final_score", "final_airports"])


def refresh(room):
    was = room.status
    if room.refresh_status() == GameRoom.Status.FINISHED and was != GameRoom.Status.FINISHED:
        log(room, room.duration_h, "Время вышло! Игра окончена.")
        finalize(room)
    elif room.status == GameRoom.Status.FINISHED:
        finalize(room)


# ---------- Действия ----------

@transaction.atomic
def book(player, flight_id):
    room = GameRoom.objects.select_for_update().get(pk=player.room_id)
    refresh(room)
    if room.status != GameRoom.Status.RUNNING:
        raise GameError("Сейчас нельзя покупать билеты.")
    clock = room.clock_h()
    player = GamePlayer.objects.select_for_update().get(pk=player.pk)
    player.room = room
    try:
        flight = GameFlight.objects.select_for_update().select_related("origin", "destination").get(
            pk=flight_id, room=room
        )
    except GameFlight.DoesNotExist:
        raise GameError("Такого рейса нет.")

    journey = Journey(player, clock)
    airport, not_before = journey.next_departure_point()
    if airport is None:
        raise GameError("У вас уже есть билет. Сначала слетайте или отмените его.")
    if flight.origin_id != airport.code:
        raise GameError(f"Этот рейс вылетает не из аэропорта {airport.code}.")
    if flight.departure_h <= clock:
        raise GameError("Посадка на этот рейс уже закончилась.")
    if flight.departure_h < not_before:
        raise GameError("Не успеете на пересадку — нужно минимум 45 минут.")

    sold = flight.tickets.count()
    if sold >= flight.seats:
        raise GameError("Мест на этот рейс не осталось.")
    price = flight.price_for(sold)
    if player.money < price:
        raise GameError(f"Не хватает денег: билет стоит ${price}, у вас ${player.money}.")

    GameTicket.objects.create(player=player, flight=flight, price=price, bought_at_h=clock)
    player.money -= price
    player.save(update_fields=["money"])
    log(room, clock, f"{player.name}: билет {flight.origin_id} → {flight.destination_id} за ${price}")
    if sold + 1 >= flight.seats:
        log(room, clock, f"Рейс {flight.number} → {flight.destination.city} распродан")
    return flight


@transaction.atomic
def cancel(player):
    room = GameRoom.objects.select_for_update().get(pk=player.room_id)
    refresh(room)
    if room.status != GameRoom.Status.RUNNING:
        raise GameError("Сейчас нельзя отменять билеты.")
    clock = room.clock_h()
    player = GamePlayer.objects.select_for_update().get(pk=player.pk)
    player.room = room
    pending = Journey(player, clock).pending
    if not pending:
        raise GameError("Нет билета, который можно отменить.")
    refund = round(pending.price * REFUND_SHARE)
    pending.delete()
    player.money += refund
    player.save(update_fields=["money"])
    log(room, clock, f"{player.name} сдаёт билет → {pending.flight.destination.city} (возврат ${refund})")
    return refund


# ---------- Состояние для экрана игры ----------

def _ap(a):
    return {"code": a.code, "city": a.city, "lon": a.longitude, "lat": a.latitude, "continent": a.continent}


def _flight(f):
    return {
        "id": f.id, "number": f.number, "from": f.origin_id, "to": f.destination_id,
        "dep": f.departure_h, "arr": f.arrival_h,
    }


def state(room, me=None):
    refresh(room)
    clock = room.clock_h()
    players = list(
        room.players.prefetch_related(
            Prefetch("tickets", queryset=GameTicket.objects.select_related("flight__origin", "flight__destination"))
        )
    )
    color_of = {p.id: p.color for p in players}

    people = []
    my_journey = None
    for p in players:
        p.room = room
        j = Journey(p, clock, list(p.tickets.all()))
        s = j.score()
        if me and p.id == me.id:
            my_journey = j
        people.append({
            "id": p.id, "name": p.name, "color": p.color, "host": p.is_host, "money": p.money,
            "score": s["points"], "airports": s["airports"], "continents": s["continents"],
            "home_bonus": s["home_bonus"],
            "at": j.airport.code,
            "flight": _flight(j.in_air.flight) if j.in_air else None,
            "path": [_flight(t.flight) for t in j.landed],
            "visited": [a.code for a in j.visited],
        })
    people.sort(key=lambda x: (-x["score"], -x["money"]))

    data = {
        "code": room.code,
        "status": room.status,
        "clock": clock,
        "duration": room.duration_h,
        "speed": room.speed,  # игровых часов в реальную минуту
        "seats": room.seats_per_flight,
        "budget": room.budget,
        "start": room.start_airport_id,
        "players": people,
        "events": [{"h": e.at_h, "text": e.text} for e in room.events.all()[:12]],
        "me": None,
        "departures": [],
    }

    if me and my_journey:
        airport, not_before = my_journey.next_departure_point()
        pend = my_journey.pending
        data["me"] = {
            "id": me.id,
            "host": me.is_host,
            "pending": {**_flight(pend.flight), "price": pend.price,
                        "refund": round(pend.price * REFUND_SHARE)} if pend else None,
            "from": airport.code if airport else None,
            "not_before": not_before,
        }
        if room.status == GameRoom.Status.RUNNING and airport:
            earliest = max(not_before, clock)
            flights = (
                GameFlight.objects.filter(
                    room=room, origin=airport,
                    departure_h__gt=earliest, departure_h__lte=earliest + DEPARTURES_WINDOW_H,
                )
                .select_related("destination")
                .annotate(sold=Count("tickets"))
                .order_by("departure_h")[:40]
            )
            riders = {}
            for t in GameTicket.objects.filter(flight__in=[f.id for f in flights]).values("flight_id", "player_id"):
                riders.setdefault(t["flight_id"], []).append(color_of.get(t["player_id"]))
            visited = set(next(p["visited"] for p in people if p["id"] == me.id))
            for f in flights:
                data["departures"].append({
                    **_flight(f),
                    "city": f.destination.city,
                    "continent": f.destination.continent,
                    "new": f.destination_id not in visited,
                    "price": f.price_for(f.sold),
                    "seats_left": max(0, f.seats - f.sold),
                    "seats": f.seats,
                    "riders": riders.get(f.id, []),
                })
    return data


def airports_payload():
    return [_ap(a) for a in game_airports()]


def leaderboard(limit=10):
    return list(
        GamePlayer.objects.exclude(final_score=None)
        .select_related("room__start_airport")
        .order_by("-final_score", "-money")[:limit]
    )
