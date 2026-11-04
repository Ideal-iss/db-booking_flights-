"""Данные для интерактивного глобуса (booking/static/booking/globe.js)."""

from django.utils import timezone

from .models import Airport, Flight


def _point(airport):
    return [airport.longitude, airport.latitude]


def flight_globe(flight):
    """Один маршрут: самолёт летит от вылета к прилёту."""
    a, b = flight.origin, flight.destination
    if None in (a.latitude, a.longitude, b.latitude, b.longitude):
        return None
    progress = flight.progress_at(timezone.now())
    km = f"{flight.distance_km:,}".replace(",", "\u00a0")
    if progress is not None:
        caption = f"Сейчас в полёте · пройдено {round(progress * 100)}% из {km} км"
    else:
        caption = f"{km} км по дуге большого круга"
    plane = {"from": _point(a), "to": _point(b), "trail": "full", "size": 26, "follow": True}
    if progress is not None:
        plane.update(mode="fixed", progress=progress)
    else:
        plane.update(mode="loop")
    return {
        "caption": caption,
        "arcs": [{"from": _point(a), "to": _point(b), "kind": "route"}],
        "planes": [plane],
        "airports": [{"code": ap.code, "lon": ap.longitude, "lat": ap.latitude, "kind": "main"} for ap in (a, b)],
        "camera": {"mode": "follow"},
    }


def network_globe():
    """Все направления ближайших рейсов — для главной страницы."""
    airports = {ap.code: ap for ap in Airport.objects.exclude(latitude=None).exclude(longitude=None)}
    pairs = list(
        Flight.objects.filter(departure__gt=timezone.now())
        .values_list("origin_id", "destination_id")
        .distinct()
        .order_by("origin_id", "destination_id")
    )
    routes = [(airports[o], airports[d]) for o, d in pairs if o in airports and d in airports]
    if not routes:
        return None
    used = {code for pair in pairs for code in pair}
    return {
        "arcs": [{"from": _point(o), "to": _point(d), "kind": "route"} for o, d in routes],
        "planes": [
            {"from": _point(o), "to": _point(d), "mode": "loop", "trail": "short", "size": 17}
            for o, d in routes
        ],
        "airports": [
            {"code": ap.code, "lon": ap.longitude, "lat": ap.latitude, "kind": "main"}
            for code, ap in airports.items()
            if code in used
        ],
        "camera": {"mode": "spin", "center": [40, 30]},
    }
