from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from booking.models import Airport

from . import logic
from .models import GameFlight, GameRoom


def set_clock(room, hours):
    """Перематывает игровые часы комнаты на нужное число игровых часов."""
    room.started_at = timezone.now() - timedelta(minutes=hours / room.speed)
    room.save(update_fields=["started_at"])


class GameTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        data = [
            ("AAA", 50, 0, "EU"), ("BBB", 52, 5, "EU"), ("CCC", 40, 30, "AS"),
            ("DDD", 10, 30, "AF"), ("EEE", 0, -50, "SA"),
        ]
        for code, lat, lon, cont in data:
            Airport.objects.create(code=code, name=code, location=f"Город{code}, Страна",
                                   latitude=lat, longitude=lon, continent=cont)

    def setUp(self):
        self.room, self.host = logic.create_room("Аня", Airport.objects.get(code="AAA"))
        self.bob = logic.add_player(self.room, "Боб")

    def start(self):
        self.room = logic.start_game(self.room, self.host)
        # Предсказуемый рейс AAA → BBB через 2 часа после старта.
        self.flight = GameFlight.objects.create(
            room=self.room, number="T1", origin_id="AAA", destination_id="BBB",
            departure_h=2, arrival_h=3.5, base_price=100, seats=1,
        )
        self.host.refresh_from_db()
        self.bob.refresh_from_db()

    def test_only_host_can_start_and_timetable_created(self):
        with self.assertRaises(logic.GameError):
            logic.start_game(self.room, self.bob)
        self.start()
        self.assertEqual(self.room.status, GameRoom.Status.RUNNING)
        self.assertEqual(self.room.seats_per_flight, 1)  # двое игроков — одно место
        self.assertGreater(self.room.flights.count(), 50)

    def test_seat_competition_and_rising_price(self):
        self.start()
        self.flight.seats = 2
        self.flight.save()
        logic.book(self.host, self.flight.id)
        self.host.refresh_from_db()
        self.assertEqual(self.host.money, 3000 - 100)
        logic.book(self.bob, self.flight.id)
        self.bob.refresh_from_db()
        self.assertEqual(self.bob.money, 3000 - 135)  # второй билет дороже на 35%

    def test_sold_out(self):
        self.start()
        logic.book(self.host, self.flight.id)
        with self.assertRaisesMessage(logic.GameError, "Мест"):
            logic.book(self.bob, self.flight.id)

    def test_one_pending_ticket_and_cancel_refund(self):
        self.start()
        logic.book(self.host, self.flight.id)
        other = GameFlight.objects.create(room=self.room, number="T2", origin_id="AAA", destination_id="CCC",
                                          departure_h=4, arrival_h=7, base_price=200, seats=2)
        with self.assertRaisesMessage(logic.GameError, "уже есть билет"):
            logic.book(self.host, other.id)
        refund = logic.cancel(self.host)
        self.host.refresh_from_db()
        self.assertEqual(refund, 70)
        self.assertEqual(self.host.money, 3000 - 100 + 70)
        logic.book(self.host, other.id)

    def test_wrong_airport_departed_and_money(self):
        self.start()
        elsewhere = GameFlight.objects.create(room=self.room, number="T3", origin_id="CCC", destination_id="DDD",
                                              departure_h=5, arrival_h=8, base_price=100, seats=2)
        with self.assertRaisesMessage(logic.GameError, "вылетает не из"):
            logic.book(self.host, elsewhere.id)
        expensive = GameFlight.objects.create(room=self.room, number="T4", origin_id="AAA", destination_id="EEE",
                                              departure_h=5, arrival_h=15, base_price=5000, seats=2)
        with self.assertRaisesMessage(logic.GameError, "Не хватает денег"):
            logic.book(self.host, expensive.id)
        set_clock(self.room, 2.5)
        with self.assertRaisesMessage(logic.GameError, "Посадка"):
            logic.book(self.host, self.flight.id)

    def test_journey_connection_and_score(self):
        self.start()
        logic.book(self.host, self.flight.id)
        hop = GameFlight.objects.create(room=self.room, number="T5", origin_id="BBB", destination_id="CCC",
                                        departure_h=4.5, arrival_h=6, base_price=100, seats=2)
        tight = GameFlight.objects.create(room=self.room, number="T6", origin_id="BBB", destination_id="DDD",
                                          departure_h=3.6, arrival_h=6, base_price=100, seats=2)
        set_clock(self.room, 2.5)  # в воздухе — можно купить пересадку
        with self.assertRaisesMessage(logic.GameError, "пересадку"):
            logic.book(self.host, tight.id)
        logic.book(self.host, hop.id)
        set_clock(self.room, 6.5)
        self.room.refresh_from_db()
        self.host.refresh_from_db()
        j = logic.Journey(self.host, self.room.clock_h())
        self.assertEqual(j.airport.code, "CCC")
        score = j.score()
        self.assertEqual(score["airports"], 2)
        self.assertEqual(score["points"], 2 * 100 + 300)  # BBB, CCC + новый континент Азия

    def test_finish_records_scores(self):
        self.start()
        logic.book(self.host, self.flight.id)
        set_clock(self.room, self.room.duration_h + 1)
        logic.state(self.room)
        self.room.refresh_from_db()
        self.assertEqual(self.room.status, GameRoom.Status.FINISHED)
        self.host.refresh_from_db()
        self.assertEqual(self.host.final_score, 100)
        self.assertEqual(logic.leaderboard()[0].name, "Аня")


class GameViewsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        Airport.objects.create(code="AAA", name="A", location="Альфа, Страна", latitude=50, longitude=0, continent="EU")
        Airport.objects.create(code="BBB", name="B", location="Бета, Страна", latitude=40, longitude=20, continent="EU")

    def test_full_flow_two_browsers(self):
        host, guest = self.client, self.client_class()
        r = host.post(reverse("game:new"), {"name": "Аня", "start": "AAA"})
        room = GameRoom.objects.get()
        self.assertRedirects(r, reverse("game:room", args=[room.code]))
        guest.post(reverse("game:join_by_code"), {"code": room.code.lower(), "name": "Боб"})
        self.assertEqual(room.players.count(), 2)

        self.assertEqual(guest.post(reverse("game:start", args=[room.code])).status_code, 400)
        self.assertTrue(host.post(reverse("game:start", args=[room.code])).json()["ok"])

        state = host.get(reverse("game:state", args=[room.code])).json()
        self.assertEqual(state["status"], "running")
        self.assertEqual(len(state["players"]), 2)
        flight_id = state["departures"][0]["id"]
        self.assertTrue(host.post(reverse("game:book", args=[room.code, flight_id])).json()["ok"])
        # Место было одно — второму игроку уже не достанется.
        r = guest.post(reverse("game:book", args=[room.code, flight_id]))
        self.assertFalse(r.json()["ok"])

        self.assertContains(host.get(reverse("game:room", args=[room.code])), room.code)
        self.assertContains(self.client_class().get(reverse("game:home")), "Кругосветка")
