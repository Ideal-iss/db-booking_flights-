from django.contrib import messages
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_GET, require_POST

from booking.models import Airport

from . import logic
from .models import GamePlayer, GameRoom

SESSION_KEY = "game_players"  # {код комнаты: id игрока} — кто ты в каждой комнате


def _get_room(code):
    return get_object_or_404(GameRoom.objects.select_related("start_airport"), code=code.upper())


def _me(request, room):
    player_id = request.session.get(SESSION_KEY, {}).get(room.code)
    if not player_id:
        return None
    return GamePlayer.objects.filter(pk=player_id, room=room).first()


def _remember(request, room, player):
    players = request.session.get(SESSION_KEY, {})
    players[room.code] = player.id
    request.session[SESSION_KEY] = players


def home(request):
    return render(
        request,
        "game/home.html",
        {
            "airports": Airport.objects.exclude(continent="").order_by("location"),
            "leaders": logic.leaderboard(),
            "last_name": request.session.get("game_name", ""),
        },
    )


@require_POST
def new_room(request):
    name = request.POST.get("name", "")
    start = Airport.objects.filter(code=request.POST.get("start", ""), continent__gt="").first()
    try:
        room, player = logic.create_room(name, start)
    except logic.GameError as e:
        messages.error(request, str(e))
        return redirect("game:home")
    _remember(request, room, player)
    request.session["game_name"] = player.name
    return redirect("game:room", code=room.code)


@require_POST
def join_by_code(request):
    code = request.POST.get("code", "").strip().upper()
    room = GameRoom.objects.filter(code=code).first()
    if not room:
        messages.error(request, f"Комната {code or '—'} не найдена.")
        return redirect("game:home")
    return join(request, room.code)


@require_POST
def join(request, code):
    room = _get_room(code)
    if _me(request, room):
        return redirect("game:room", code=room.code)
    try:
        player = logic.add_player(room, request.POST.get("name", ""))
    except logic.GameError as e:
        messages.error(request, str(e))
        return redirect("game:room", code=room.code)
    _remember(request, room, player)
    request.session["game_name"] = player.name
    return redirect("game:room", code=room.code)


def room(request, code):
    room = _get_room(code)
    me = _me(request, room)
    return render(
        request,
        "game/room.html",
        {
            "room": room,
            "me": me,
            "airports": logic.airports_payload(),
            "last_name": request.session.get("game_name", ""),
            "share_url": request.build_absolute_uri(),
        },
    )


@require_POST
def start(request, code):
    room = _get_room(code)
    me = _me(request, room)
    if not me:
        return JsonResponse({"ok": False, "error": "Вы не в этой комнате."}, status=403)
    try:
        logic.start_game(room, me)
    except logic.GameError as e:
        return JsonResponse({"ok": False, "error": str(e)}, status=400)
    return JsonResponse({"ok": True})


@require_GET
def room_state(request, code):
    room = _get_room(code)
    return JsonResponse(logic.state(room, _me(request, room)))


@require_POST
def book_flight(request, code, flight_id):
    room = _get_room(code)
    me = _me(request, room)
    if not me:
        return JsonResponse({"ok": False, "error": "Сначала присоединитесь к игре."}, status=403)
    try:
        flight = logic.book(me, flight_id)
    except logic.GameError as e:
        return JsonResponse({"ok": False, "error": str(e)}, status=400)
    return JsonResponse({"ok": True, "message": f"Билет куплен: {flight.origin_id} → {flight.destination.city}"})


@require_POST
def cancel_ticket(request, code):
    room = _get_room(code)
    me = _me(request, room)
    if not me:
        return JsonResponse({"ok": False, "error": "Сначала присоединитесь к игре."}, status=403)
    try:
        refund = logic.cancel(me)
    except logic.GameError as e:
        return JsonResponse({"ok": False, "error": str(e)}, status=400)
    return JsonResponse({"ok": True, "message": f"Билет сдан, вернули ${refund}."})
