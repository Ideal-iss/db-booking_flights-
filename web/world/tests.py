import json
from datetime import timedelta
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from booking.models import Airport

from . import content, logic
from .models import ChatMessage, CoinPickup, EarnedAchievement, Profile, Route, Stamp, Trip, Visit


class WorldTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        for code, lat, lon, cont in [("CDG", 49, 2.5, "EU"), ("LHR", 51.5, -0.45, "EU"), ("CAI", 30, 31.4, "AF"), ("JFK", 40.6, -73.8, "NA")]:
            Airport.objects.create(code=code, name=code, location=f"Город{code}, Страна", latitude=lat, longitude=lon, continent=cont)
        logic.seed_world()

    def make(self, name, home="CDG"):
        user = User.objects.create_user(name, password="pass12345!")
        return logic.create_profile(user, name.title(), Airport.objects.get(code=home), {"skin": 2, "hair": "bun", "hat": "crown"})

    def at_gate(self, p):
        g = content.layout(p.airport_id)["gate"]
        p.x, p.y = g[0] + g[2] / 2, g[1] + g[3] / 2
        p.save()

    def next_dep(self, route):
        return logic.departures_of(route, timezone.now() + timedelta(seconds=5))[0]


class SeedAndProfileTests(WorldTestCase):
    def test_seed_and_profile(self):
        self.assertGreater(Route.objects.count(), 0)
        self.assertEqual(Route.objects.filter(origin_id="CDG", destination_id="LHR").count(), 1)
        p = self.make("anna")
        self.assertEqual(p.coins, 200)
        self.assertNotIn("hat", p.avatar)  # корону ещё не купили
        self.assertTrue(Visit.objects.filter(profile=p, airport_id="CDG").exists())

    def test_departures_follow_period(self):
        r = Route.objects.first()
        deps = logic.departures_of(r, timezone.now(), horizon_s=r.period_s * 3)
        gaps = {(b - a).total_seconds() for a, b in zip(deps, deps[1:])}
        self.assertEqual(gaps, {r.period_s})


class FlightTests(WorldTestCase):
    def setUp(self):
        self.anna, self.bob = self.make("anna"), self.make("bob")
        self.route = Route.objects.get(origin_id="CDG", destination_id="LHR")
        self.dep = self.next_dep(self.route)

    def test_must_be_at_gate(self):
        with self.assertRaisesMessage(logic.WorldError, "выходу на посадку"):
            logic.board(self.anna, self.route.id, self.dep.timestamp())

    def test_two_players_share_plane_and_land(self):
        self.at_gate(self.anna); self.at_gate(self.bob)
        t1 = logic.board(self.anna, self.route.id, self.dep.timestamp())
        t2 = logic.board(self.bob, self.route.id, self.dep.timestamp())
        self.assertNotEqual(t1.seat, t2.seat)
        self.anna.refresh_from_db()
        self.assertEqual(self.anna.coins, 200 - self.route.price)
        with self.assertRaisesMessage(logic.WorldError, "уже есть билет"):
            logic.board(self.anna, self.route.id, self.dep.timestamp())

        # В полёте: оба в одном салоне
        with mock.patch("django.utils.timezone.now", return_value=self.dep + timedelta(seconds=5)):
            state = logic.tick(self.anna)
        self.assertEqual(state["status"], "flying")
        self.assertEqual({c["nick"] for c in state["cabin"]}, {"Anna", "Bob"})

        # Прилёт: новый аэропорт, награды, достижения
        with mock.patch("django.utils.timezone.now", return_value=t1.arrival_at + timedelta(seconds=1)):
            state = logic.tick(self.anna)
        self.anna.refresh_from_db()
        self.assertEqual(state["status"], "ground")
        self.assertEqual(self.anna.airport_id, "LHR")
        self.assertEqual(self.anna.flights_count, 1)
        titles = {e["title"] for e in state["events"]}
        self.assertIn("Первый полёт", titles)
        self.assertIn("В хорошей компании", titles)
        self.assertTrue(Visit.objects.filter(profile=self.anna, airport_id="LHR").exists())

    def test_cancel_refunds(self):
        self.at_gate(self.anna)
        logic.board(self.anna, self.route.id, self.dep.timestamp())
        self.assertEqual(logic.cancel(self.anna), self.route.price)
        self.anna.refresh_from_db()
        self.assertEqual(self.anna.coins, 200)
        self.assertFalse(Trip.objects.exists())

    def test_not_enough_coins(self):
        self.at_gate(self.anna)
        Profile.objects.filter(pk=self.anna.pk).update(coins=1)
        self.anna.refresh_from_db()
        with self.assertRaisesMessage(logic.WorldError, "Не хватает"):
            logic.board(self.anna, self.route.id, self.dep.timestamp())

    def test_fake_departure_rejected(self):
        self.at_gate(self.anna)
        with self.assertRaisesMessage(logic.WorldError, "расписании"):
            logic.board(self.anna, self.route.id, self.dep.timestamp() + 7)


class TerritoryTests(WorldTestCase):
    def setUp(self):
        self.anna = self.make("anna")

    def test_coins_need_proximity_and_once(self):
        i, x, y, v = content.coins("CDG", logic.coin_window())[0]
        with self.assertRaisesMessage(logic.WorldError, "далеко"):
            logic.collect_coin(self.anna, i)
        self.anna.x, self.anna.y = x, y
        self.anna.save()
        value, _ = logic.collect_coin(self.anna, i)
        self.assertEqual(value, v)
        with self.assertRaises(logic.WorldError):
            logic.collect_coin(self.anna, i)
        self.assertEqual(CoinPickup.objects.count(), 1)
        self.assertNotIn(i, [c["i"] for c in logic.visible_coins(self.anna)])

    def test_stamp(self):
        lm = content.layout("CDG")["landmark"]
        self.anna.x, self.anna.y = lm["x"], lm["y"] + 40
        self.anna.save()
        events = logic.take_stamp(self.anna)
        self.assertEqual(Stamp.objects.count(), 1)
        self.assertEqual(events[0]["reward"], logic.STAMP_BONUS)
        with self.assertRaisesMessage(logic.WorldError, "уже есть"):
            logic.take_stamp(self.anna)

    def test_chat_and_others_visible(self):
        bob = self.make("bob")
        logic.tick(bob, {"x": 900, "y": 600, "facing": -1, "moving": True})
        logic.say(bob, "  Привет   всем ")
        state = logic.tick(self.anna)
        self.assertEqual(state["others"][0]["nick"], "Bob")
        self.assertEqual(state["others"][0]["x"], 900)
        self.assertEqual(state["chat"][0]["text"], "Привет всем")
        self.assertEqual(ChatMessage.objects.get().place, "AP:CDG")

    def test_shop_buy_and_equip(self):
        item, _ = logic.buy(self.anna, "cap")
        self.anna.refresh_from_db()
        self.assertEqual(self.anna.avatar["hat"], "cap")
        self.assertEqual(self.anna.coins, 200 - item.price)
        logic.equip(self.anna, "hat", None)
        self.assertNotIn("hat", self.anna.avatar)
        with self.assertRaisesMessage(logic.WorldError, "купите"):
            logic.equip(self.anna, "hat", "crown")
        with self.assertRaisesMessage(logic.WorldError, "Не хватает"):
            logic.buy(self.anna, "crown")


class ViewsTests(WorldTestCase):
    def test_register_play_and_api(self):
        r = self.client.post(reverse("world:register"), {
            "username": "vova", "password1": "SkyPass!2026", "password2": "SkyPass!2026",
            "nickname": "Вова", "home": "CDG", "avatar": json.dumps({"skin": 3, "hair": "spiky"}),
        })
        self.assertRedirects(r, reverse("world:play"))
        p = Profile.objects.get(nickname="Вова")
        self.assertEqual(p.avatar["hair"], "spiky")
        self.assertContains(self.client.get(reverse("world:play")), "Вова")
        self.assertContains(self.client.get(reverse("world:cabinet")), "Паспорт путешественника")
        self.assertContains(self.client.get(reverse("world:shop")), "Корона")

        tick = self.client.post(reverse("world:tick"), {"pos": {"x": 800, "y": 520}}, content_type="application/json").json()
        self.assertEqual(tick["status"], "ground")
        self.assertEqual(tick["me"]["airport"], "CDG")
        self.assertEqual(self.client.get(reverse("world:map")).json()["code"], "CDG")
        deps = self.client.get(reverse("world:departures")).json()["departures"]
        self.assertTrue(deps)
        r = self.client.post(reverse("world:board"), {"route": deps[0]["route"], "dep": deps[0]["dep"]}, content_type="application/json")
        self.assertEqual(r.status_code, 400)  # не у гейта
        self.assertIn("посадку", r.json()["error"])

    def test_api_requires_login(self):
        self.assertEqual(self.client.post(reverse("world:tick")).status_code, 403)
        self.assertRedirects(self.client.get(reverse("world:play")), f"{reverse('world:login')}?next={reverse('world:play')}")
