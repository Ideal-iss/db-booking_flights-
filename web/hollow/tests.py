import base64
import hashlib
import hmac
import json
import time

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.urls import reverse

from . import game
from .models import HollowCharacter, HollowRun


def post(client, name, body=None, **kw):
    return client.post(reverse(f"hollow:{name}", kwargs=kw), data=json.dumps(body or {}), content_type="application/json")


class HollowApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("tester", password="Hollow-pass-123")
        self.client.login(username="tester", password="Hollow-pass-123")

    def make(self, cls="warrior", name="Тестовый Герой"):
        r = post(self.client, "create", {"name": name, "cls": cls, "appearance": {"skin": 1, "hair": "long"}})
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()["character"]

    def test_index_renders(self):
        r = self.client.get(reverse("hollow:index"))
        self.assertContains(r, "THE HOLLOW")
        self.assertContains(r, "hollow/app.js")

    def test_register_and_login(self):
        self.client.logout()
        r = post(self.client, "register", {"username": "newbie", "password": "Very-strong-9"})
        self.assertTrue(r.json()["ok"])
        r = self.client.get(reverse("hollow:me"))
        self.assertEqual(r.json()["user"], "newbie")
        self.client.logout()
        r = post(self.client, "login", {"username": "newbie", "password": "wrong"})
        self.assertEqual(r.status_code, 400)

    def test_create_character_with_starter_gear(self):
        c = self.make("knight")
        self.assertEqual(c["level"], 1)
        self.assertEqual(c["equipment"]["offhand"]["base"], "buckler")
        self.assertEqual(c["hotbar"][0], "shield_bash")
        self.assertEqual(len(c["merchant"]), 10)
        # имя уникально
        r = post(self.client, "create", {"name": "тестовый герой", "cls": "mage"})
        self.assertEqual(r.status_code, 400)

    def test_cannot_touch_foreign_character(self):
        c = self.make()
        other = User.objects.create_user("other", password="Hollow-pass-123")
        self.client.logout()
        self.client.force_login(other)
        r = self.client.get(reverse("hollow:character", kwargs={"cid": c["id"]}))
        self.assertEqual(r.status_code, 400)

    def test_run_pickup_validation(self):
        c = self.make()
        run = post(self.client, "run_start", {"dungeon": "a1s1"}, cid=c["id"]).json()["run"]
        good = {"uid": "x", "base": "short_sword", "rarity": "uncommon", "ilvl": 1, "affixes": [{"id": "str", "v": 2}], "name": "Короткий меч силы"}
        r = post(self.client, "run_pickup", {"item": good}, cid=c["id"], rid=run["id"])
        self.assertTrue(r.json()["ok"], r.content)
        # завышенное свойство отклоняется
        bad = dict(good, affixes=[{"id": "str", "v": 99}])
        r = post(self.client, "run_pickup", {"item": bad}, cid=c["id"], rid=run["id"])
        self.assertEqual(r.status_code, 400)
        # слишком высокий уровень предмета
        bad = dict(good, ilvl=30)
        self.assertEqual(post(self.client, "run_pickup", {"item": bad}, cid=c["id"], rid=run["id"]).status_code, 400)
        # заточенный «находка» не принимается
        bad = dict(good, upgrade=3)
        self.assertEqual(post(self.client, "run_pickup", {"item": bad}, cid=c["id"], rid=run["id"]).status_code, 400)
        ch = HollowCharacter.objects.get(pk=c["id"])
        self.assertEqual(len(ch.data["inventory"]), 1)

    def test_locked_dungeon(self):
        c = self.make()
        r = post(self.client, "run_start", {"dungeon": "a1s2"}, cid=c["id"])
        self.assertEqual(r.status_code, 400)
        # Кошмар закрыт до победы над финальным боссом
        self.assertEqual(post(self.client, "run_start", {"dungeon": "n:a1s1"}, cid=c["id"]).status_code, 400)
        self.assertEqual(post(self.client, "run_start", {"dungeon": "crypt"}, cid=c["id"]).status_code, 400)

    def test_finish_caps_and_unlocks(self):
        c = self.make()
        run = post(self.client, "run_start", {"dungeon": "a1s1"}, cid=c["id"]).json()["run"]
        res = {"xp": 10**9, "gold": 10**9, "kills": {"skeleton": 4}, "bosses": ["skeleton"], "potionsUsed": {"health": 1, "mana": 0}, "potionsFound": {"health": 2, "mana": 0}}
        r = post(self.client, "run_finish", {"success": True, "result": res}, cid=c["id"], rid=run["id"]).json()
        self.assertTrue(r["ok"])
        self.assertEqual(r["summary"]["xp"], game.xp_cap(run["level"]))
        ch = r["character"]
        self.assertIn("a1s1", ch["cleared"])
        self.assertEqual(r["summary"]["unlocked"], ["a1s2"])
        self.assertTrue(r["summary"]["firstClear"])
        self.assertEqual(ch["potions"]["health"], 4)
        # второй раз тот же забег не засчитать
        r = post(self.client, "run_finish", {"success": True, "result": res}, cid=c["id"], rid=run["id"])
        self.assertEqual(r.status_code, 400)
        # теперь открыт следующий этап
        self.assertEqual(post(self.client, "run_start", {"dungeon": "a1s2"}, cid=c["id"]).status_code, 200)

    def test_exit_without_guard_not_cleared(self):
        c = self.make()
        run = post(self.client, "run_start", {"dungeon": "a1s1"}, cid=c["id"]).json()["run"]
        r = post(self.client, "run_finish", {"success": True, "result": {"xp": 10, "bosses": []}}, cid=c["id"], rid=run["id"]).json()
        self.assertFalse(r["summary"]["cleared"])
        self.assertNotIn("a1s1", r["character"]["cleared"])

    def test_legacy_cleared_migrates_and_nightmare(self):
        c = self.make()
        ch = HollowCharacter.objects.get(pk=c["id"])
        ch.data = dict(ch.data, cleared=["crypt", "catacombs"])
        ch.save()
        r = self.client.get(reverse("hollow:character", kwargs={"cid": c["id"]})).json()
        self.assertEqual(r["character"]["cleared"], ["a1s1", "a1s2", "a1s3", "a2s1", "a2s2", "a2s3"])
        self.assertEqual(post(self.client, "run_start", {"dungeon": "a3s1"}, cid=c["id"]).status_code, 200)
        # финальный босс открывает Кошмар с уровнем +20
        ch = HollowCharacter.objects.get(pk=c["id"])
        ch.data = dict(ch.data, cleared=ch.data["cleared"] + ["a5s3"])
        ch.save()
        run = post(self.client, "run_start", {"dungeon": "n:a1s1"}, cid=c["id"]).json()["run"]
        self.assertEqual(run["level"], 21)
        r = post(self.client, "run_finish", {"success": True, "result": {"bosses": ["skeleton"]}}, cid=c["id"], rid=run["id"]).json()
        self.assertEqual(r["summary"]["unlocked"], ["n:a1s2"])

    def test_skill_tree_hotbar_and_respec(self):
        c = self.make("mage")
        ch = HollowCharacter.objects.get(pk=c["id"])
        # старое сохранение: 3 ячейки, 1 очко за уровень
        ch.data = dict(ch.data, level=10, skillPoints=0, hotbar=["fireball", None, None], gold=5000)
        ch.data.pop("sp2", None)
        ch.save()
        r = self.client.get(reverse("hollow:character", kwargs={"cid": c["id"]})).json()["character"]
        self.assertEqual(len(r["hotbar"]), 6)
        self.assertEqual(r["skillPoints"], 9)
        for sid in ["ice_bolt", "charged_bolt", "chain_lightning"]:
            self.assertTrue(post(self.client, "op", {"op": "skill", "id": sid}, cid=c["id"]).json()["ok"])
        # ряд 3 требует 12 уровня
        self.assertEqual(post(self.client, "op", {"op": "skill", "id": "teleport"}, cid=c["id"]).status_code, 400)
        r = post(self.client, "op", {"op": "hotbar", "slot": 5, "id": "chain_lightning"}, cid=c["id"]).json()["character"]
        self.assertEqual(r["hotbar"][5], "chain_lightning")
        self.assertEqual(post(self.client, "op", {"op": "hotbar", "slot": 6, "id": "ice_bolt"}, cid=c["id"]).status_code, 400)
        r = post(self.client, "op", {"op": "respec"}, cid=c["id"]).json()["character"]
        self.assertEqual(r["skills"], {})
        self.assertEqual(r["skillPoints"], 10)
        self.assertEqual(r["gold"], 5000 - game.respec_cost(10))

    def test_death_halves_xp(self):
        c = self.make()
        run = post(self.client, "run_start", {"dungeon": "a1s1"}, cid=c["id"]).json()["run"]
        r = post(self.client, "run_finish", {"success": False, "result": {"xp": 100, "gold": 5}}, cid=c["id"], rid=run["id"]).json()
        self.assertEqual(r["summary"]["xp"], 50)
        self.assertEqual(r["character"]["stats"]["deaths"], 1)

    def test_inventory_ops(self):
        c = self.make("warrior")
        cid = c["id"]
        ch = HollowCharacter.objects.get(pk=cid)
        sword = game.starter_item("short_sword")
        sword["pos"] = 0
        ch.data["inventory"] = [sword]
        ch.data["gold"] = 5000
        ch.save()
        op = lambda **o: post(self.client, "op", o, cid=cid)
        r = op(op="equip", uid=sword["uid"]).json()
        self.assertEqual(r["character"]["equipment"]["weapon"]["base"], "short_sword")
        self.assertEqual(r["character"]["inventory"][0]["base"], "hand_axe")  # старое оружие встало на место нового
        axe_uid = r["character"]["inventory"][0]["uid"]
        r = op(op="move", **{"from": "inventory", "to": "stash", "uid": axe_uid, "pos": 5}).json()
        self.assertEqual(r["character"]["stash"][0]["pos"], 5)
        r = op(op="upgrade", uid=sword["uid"]).json()
        self.assertEqual(r["character"]["equipment"]["weapon"]["upgrade"], 1)
        r = op(op="buy_potion", kind="health", n=5).json()
        self.assertEqual(r["character"]["potions"]["health"], 8)
        gold = r["character"]["gold"]
        stock = r["character"]["merchant"]
        r = op(op="buy", index=0).json()
        self.assertEqual(r["character"]["gold"], gold - stock[0]["price"])
        self.assertIsNone(r["character"]["merchant"][0])
        self.assertEqual(op(op="buy", index=0).status_code, 400)
        bought = r["character"]["inventory"][-1]
        r = op(op="sell", uid=bought["uid"]).json()
        self.assertTrue(r["ok"])
        # класс не может взять чужое оружие
        ch = HollowCharacter.objects.get(pk=cid)
        wand = game.starter_item("bone_wand")
        wand["pos"] = 1
        ch.data["inventory"].append(wand)
        ch.save()
        self.assertEqual(op(op="equip", uid=wand["uid"]).status_code, 400)

    def test_skills_and_attrs(self):
        c = self.make("mage")
        ch = HollowCharacter.objects.get(pk=c["id"])
        ch.data["skillPoints"] = 4
        ch.data["attrPoints"] = 1
        ch.data["level"] = 4
        ch.save()
        op = lambda **o: post(self.client, "op", o, cid=c["id"])
        self.assertEqual(op(op="skill", id="meteor").status_code, 400)  # нужен 12 уровень
        self.assertEqual(op(op="skill", id="frost_nova").status_code, 400)  # нужна ледяная стрела
        op(op="skill", id="ice_bolt")
        r = op(op="skill", id="frost_nova").json()
        self.assertEqual(r["character"]["skills"]["frost_nova"], 1)
        self.assertIn("frost_nova", r["character"]["hotbar"])
        self.assertEqual(op(op="skill", id="cleave").status_code, 400)  # чужой класс
        r = op(op="attr", attr="int").json()
        self.assertEqual(r["character"]["attrs"]["int"], CLASSES_INT["mage"] + 1)
        self.assertEqual(op(op="attr", attr="int").status_code, 400)


CLASSES_INT = {k: v["attrs"]["int"] for k, v in game.CLASSES.items()}


@override_settings(HOLLOW_COOP_URL="ws://localhost:2567", HOLLOW_COOP_SECRET="s3cret")
class CoopTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("coop", password="Hollow-pass-123")
        self.client.force_login(self.user)
        self.char = post(self.client, "create", {"name": "Отрядный", "cls": "cleric"}).json()["character"]

    def signed(self, body):
        raw = json.dumps({**body, "ts": int(time.time())}).encode()
        sig = hmac.new(b"s3cret", raw, hashlib.sha256).hexdigest()
        return self.client.post(reverse("hollow:coop_report"), data=raw, content_type="application/json", HTTP_X_HOLLOW_SIG=sig)

    def test_token_is_signed_snapshot(self):
        r = post(self.client, "coop_token", cid=self.char["id"]).json()
        raw, sig = r["token"].rsplit(".", 1)
        self.assertEqual(sig, hmac.new(b"s3cret", raw.encode(), hashlib.sha256).hexdigest())
        payload = json.loads(base64.urlsafe_b64decode(raw))
        self.assertEqual(payload["char"], self.char["id"])
        self.assertEqual(payload["data"]["cls"], "cleric")

    def test_report_requires_signature(self):
        r = self.client.post(reverse("hollow:coop_report"), data=json.dumps({"kind": "start"}), content_type="application/json", HTTP_X_HOLLOW_SIG="nope")
        self.assertEqual(r.status_code, 403)

    def test_full_coop_flow(self):
        r = self.signed({"kind": "start", "dungeon": "a1s1", "seed": 42, "chars": [self.char["id"]]}).json()
        run_id = r["runs"][str(self.char["id"])]
        item = {"base": "mace", "rarity": "common", "ilvl": 1, "affixes": [], "name": "Булава"}
        self.assertTrue(self.signed({"kind": "pickup", "run": run_id, "item": item}).json()["ok"])
        r = self.signed({"kind": "finish", "run": run_id, "success": True, "result": {"xp": 300, "gold": 40, "kills": {"skeleton": 3}, "bosses": []}}).json()
        self.assertEqual(r["summary"]["xp"], 300)
        run = HollowRun.objects.get(pk=run_id)
        self.assertTrue(run.coop and run.success)
        ch = HollowCharacter.objects.get(pk=self.char["id"])
        self.assertEqual(len(ch.data["inventory"]), 1)

    @override_settings(HOLLOW_COOP_SECRET="")
    def test_disabled_without_secret(self):
        r = post(self.client, "coop_token", cid=self.char["id"])
        self.assertEqual(r.status_code, 400)
