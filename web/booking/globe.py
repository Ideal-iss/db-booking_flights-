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
    return {
        "caption": caption,
        "routes": [{"from": _point(a), "to": _point(b)}],
        "airports": [
            {"code": ap.code, "lon": ap.longitude, "lat": ap.latitude, "main": True} for ap in (a, b)
        ],
        "progress": progress,
    }


def network_globe():
    """Все направления ближайших рейсов — для главной страницы."""
    airports = {ap.code: ap for ap in Airport.objects.exclude(latitude=None).exclude(longitude=None)}
    pairs = (
        Flight.objects.filter(departure__gt=timezone.now())
        .values_list("origin_id", "destination_id")
        .distinct()
        .order_by("origin_id", "destination_id")
    )
    routes = [
        {"from": _point(airports[o]), "to": _point(airports[d])}
        for o, d in pairs
        if o in airports and d in airports
    ]
    if not routes:
        return None
    return {
        "routes": routes,
        "airports": [{"code": ap.code, "lon": ap.longitude, "lat": ap.latitude} for ap in airports.values()],
        "center": [40, 30],
    }
