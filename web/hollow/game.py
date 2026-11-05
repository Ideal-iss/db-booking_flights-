"""Правила THE HOLLOW на сервере: проверка предметов, инвентарь, торговец, кузнец, опыт.

Таблицы берутся из gamedata.json — его выгружает `npm run export-data` из общего кода игры,
поэтому сервер и клиент считают по одним и тем же данным."""

import json
import math
import random
import re
import secrets
from pathlib import Path

DATA = json.loads((Path(__file__).parent / "gamedata.json").read_text(encoding="utf-8"))
BASES = DATA["bases"]
RARITIES = DATA["rarities"]
AFFIXES = DATA["affixes"]
UNIQUES = DATA["uniques"]
CLASSES = DATA["classes"]
SKILLS = DATA["skills"]
XP_TABLE = DATA["xpTable"]
MAX_LEVEL = DATA["maxLevel"]
STAGES = DATA["stages"]
NIGHTMARE_BONUS = DATA["nightmareBonus"]
FINAL_STAGE = "a5s3"
# старые подземелья до кампании: пройденное засчитывается всеми этапами акта
LEGACY_CLEARED = {
    "crypt": ["a1s1", "a1s2", "a1s3"],
    "catacombs": ["a2s1", "a2s2", "a2s3"],
    "cathedral": ["a3s1", "a3s2", "a3s3"],
    "sanctum": ["a4s1", "a4s2", "a4s3"],
}
QUESTS = DATA["quests"]
POTIONS = DATA["potions"]

EQUIP_SLOTS = ["helmet", "chest", "gloves", "boots", "weapon", "offhand", "amulet", "ring1", "ring2"]
ATTRS = ["str", "dex", "int", "vit", "end", "wil"]
INVENTORY_SIZE = 40
STASH_SIZE = 48
MAX_CHARACTERS = 6
NAME_RE = re.compile(r"^[A-Za-zА-Яа-яЁё0-9 _\-]{3,20}$")
HAIR = {"bald", "short", "long", "hood", "braid", "mohawk"}
ACCESSORY = {"none", "scar", "paint", "eyepatch", "beard", "mask"}


class GameError(Exception):
    pass


def jround(x):
    """Округление как Math.round в JS."""
    return math.floor(x + 0.5)


# ---------------------------------------------------------------- уровни
def level_from_xp(total):
    level, xp = 1, total
    while level < MAX_LEVEL and xp >= XP_TABLE[level]:
        xp -= XP_TABLE[level]
        level += 1
    return level


# ---------------------------------------------------------------- предметы
def affix_range(a, ilvl):
    add = a["perLevel"] * (ilvl - 1)
    return a["base"][0] + add, a["base"][1] + add


def slot_of(equip_slot):
    return "ring" if equip_slot in ("ring1", "ring2") else equip_slot


def new_uid():
    return secrets.token_hex(6)


def item_value(item):
    base = BASES[item["base"]]
    return max(1, jround(base["value"] * RARITIES[item["rarity"]]["value"] * (1 + item["ilvl"] * 0.08) * (1 + item.get("upgrade", 0) * 0.3)))


def upgrade_cost(item):
    lvl = item.get("upgrade", 0)
    if lvl >= 5:
        return None
    return jround(40 * (lvl + 1) ** 2 * (1 + item["ilvl"] * 0.15) * (2 if item["rarity"] == "legendary" else 1))


def required_level(item):
    return max(BASES[item["base"]]["req"], int(item["ilvl"] * 0.8))


def can_class_use(cls, item):
    base = BASES[item["base"]]
    c = CLASSES[cls]
    if base["slot"] == "weapon":
        return base["type"] in c["weaponTypes"]
    if base["slot"] == "offhand":
        return base["type"] in c["offhandTypes"]
    return True


def item_name(base_id, rarity, affixes, unique=None, rng=None):
    base = BASES[base_id]
    if unique:
        return UNIQUES[unique]["name"]
    if rarity == "common":
        return base["name"]
    if rarity in ("rare", "epic"):
        names = DATA["rareNames"]
        return f"{base['name']} «{(rng or random).choice(names)}»"
    main = next((a for a in affixes if not AFFIXES[a["id"]]["curse"]), None)
    suffix = AFFIXES[main["id"]]["suffix"] if main else ""
    n = f"{base['name']} {suffix}" if suffix else base["name"]
    return f"Проклятый артефакт: {n}" if rarity == "cursed" else n


def allowed_for(base, a):
    return a["slots"] == "any" or base["slot"] in a["slots"]


def validate_item(item, max_ilvl):
    """Проверяет, что предмет мог выпасть в игре (диапазоны свойств, редкость, уровень)."""
    if not isinstance(item, dict):
        raise GameError("Неверный предмет.")
    base_id, rarity = item.get("base"), item.get("rarity")
    if base_id not in BASES or rarity not in RARITIES:
        raise GameError("Неизвестный предмет.")
    base = BASES[base_id]
    ilvl = item.get("ilvl")
    if not isinstance(ilvl, int) or not 1 <= ilvl <= max_ilvl:
        raise GameError("Неверный уровень предмета.")
    if base["req"] > ilvl + 2:
        raise GameError("Такой предмет не мог выпасть на этой глубине.")
    affixes = item.get("affixes")
    if not isinstance(affixes, list):
        raise GameError("Неверные свойства.")
    unique = item.get("unique")
    fixed_ids = set()
    if unique is not None:
        u = UNIQUES.get(unique)
        if rarity != "legendary" or not u or u["base"] != base_id:
            raise GameError("Неверная легендарная вещь.")
        for f in u["fixed"]:
            if not any(a.get("id") == f["id"] and abs(a.get("v", 0) - f["v"]) < 1e-6 for a in affixes):
                raise GameError("Свойства легендарной вещи изменены.")
            fixed_ids.add(f["id"])
    seen, curses, rolled = set(), 0, 0
    mult = 2 if rarity == "cursed" else RARITIES[rarity]["mult"]
    for a in affixes:
        aid, v = a.get("id"), a.get("v")
        if aid not in AFFIXES or aid in seen or not isinstance(v, (int, float)):
            raise GameError("Неверное свойство предмета.")
        seen.add(aid)
        if aid in fixed_ids:
            continue
        d = AFFIXES[aid]
        lo, hi = affix_range(d, ilvl)
        m = 1 if d["curse"] else mult
        lo, hi = sorted((lo * m, hi * m))
        if d["int"]:
            lo, hi = max(1, math.floor(lo + 0.5)), max(1, math.floor(hi + 0.5))
        tol = 0.0011 + abs(hi) * 1e-6
        if not (lo - tol <= v <= hi + tol):
            raise GameError("Свойство предмета вне допустимого диапазона.")
        if d["curse"]:
            curses += 1
            if rarity != "cursed":
                raise GameError("Проклятие на обычной вещи.")
        else:
            if not allowed_for(base, d):
                raise GameError("Свойство не подходит предмету.")
            rolled += 1
    lo, hi = RARITIES[rarity]["affixes"]
    if rarity == "cursed" and curses != 1:
        raise GameError("Неверный проклятый предмет.")
    if rolled > hi:
        raise GameError("Слишком много свойств.")
    upgrade = item.get("upgrade", 0) or 0
    if upgrade != 0:
        raise GameError("Найденный предмет не может быть заточен.")
    clean = {
        "uid": new_uid(),
        "base": base_id,
        "rarity": rarity,
        "ilvl": ilvl,
        "affixes": [{"id": a["id"], "v": a["v"]} for a in affixes],
        "upgrade": 0,
    }
    if unique:
        clean["unique"] = unique
    name = item.get("name")
    expected = item_name(base_id, rarity, clean["affixes"], unique, rng=random.Random(0))
    if rarity in ("rare", "epic"):
        ok = isinstance(name, str) and any(name == f"{base['name']} «{n}»" for n in DATA["rareNames"])
        clean["name"] = name if ok else expected
    else:
        clean["name"] = expected
    return clean


def make_item(rng, base_id, rarity, ilvl):
    """Генерация предмета для торговца (те же правила, что в игре)."""
    base = BASES[base_id]
    r = RARITIES[rarity]
    pool = [(k, a) for k, a in AFFIXES.items() if not a["curse"] and allowed_for(base, a)]
    n = rng.randint(r["affixes"][0], r["affixes"][1])
    affixes = []
    for _ in range(min(n, len(pool))):
        total = sum(a["weight"] for _, a in pool)
        x = rng.random() * total
        for i, (k, a) in enumerate(pool):
            x -= a["weight"]
            if x <= 0:
                break
        k, a = pool.pop(i)
        lo, hi = affix_range(a, ilvl)
        v = rng.uniform(lo, hi) * r["mult"]
        affixes.append({"id": k, "v": max(1, jround(v)) if a["int"] else round(v, 3)})
    return {
        "uid": new_uid(), "base": base_id, "rarity": rarity, "ilvl": ilvl, "affixes": affixes, "upgrade": 0,
        "name": item_name(base_id, rarity, affixes, rng=rng),
    }


def merchant_stock(char_id, gen, level):
    rng = random.Random(f"{char_id}:{gen}")
    candidates = [k for k, b in BASES.items() if b["req"] <= level + 1]
    items = []
    for i in range(10):
        rarity = rng.choices(["common", "uncommon", "rare"], [50, 38, 12])[0]
        it = make_item(rng, rng.choice(candidates), rarity, max(1, level))
        it["price"] = item_value(it) * 4
        items.append(it)
    return items


# ---------------------------------------------------------------- персонаж
def starter_item(base_id):
    return {"uid": new_uid(), "base": base_id, "rarity": "common", "ilvl": 1, "affixes": [], "upgrade": 0, "name": BASES[base_id]["name"]}


def new_character_data(cls, appearance):
    c = CLASSES[cls]
    equipment = {}
    for b in c["startItems"]:
        slot = BASES[b]["slot"]
        equipment["ring1" if slot == "ring" else slot] = starter_item(b)
    first_skill = next(k for k, s in SKILLS.items() if s["cls"] == cls and s["kind"] == "active" and s["reqLevel"] == 1)
    return {
        "appearance": appearance,
        "level": 1,
        "xp": 0,
        "attrs": dict(c["attrs"]),
        "attrPoints": 0,
        "skillPoints": 0,
        "skills": {first_skill: 1},
        "hotbar": [first_skill, None, None, None, None, None],
        "sp2": 1,
        "equipment": equipment,
        "inventory": [],
        "stash": [],
        "gold": 60,
        "potions": {"health": 3, "mana": 2},
        "quests": [],
        "cleared": [],
        "merchantGen": 0,
        "stats": {"runs": 0, "deaths": 0, "kills": 0, "bosses": 0},
    }


def clean_appearance(a):
    a = a if isinstance(a, dict) else {}

    def num(k, hi):
        v = a.get(k, 0)
        return v if isinstance(v, int) and 0 <= v < hi else 0

    return {
        "skin": num("skin", 6),
        "hair": a.get("hair") if a.get("hair") in HAIR else "short",
        "hairColor": num("hairColor", 8),
        "cloth": num("cloth", 8),
        "trim": num("trim", 8),
        "accessory": a.get("accessory") if a.get("accessory") in ACCESSORY else "none",
    }


def free_pos(container, size):
    used = {it["pos"] for it in container}
    for p in range(size):
        if p not in used:
            return p
    return None


def find(container, uid):
    for it in container:
        if it["uid"] == uid:
            return it
    raise GameError("Предмет не найден.")


def add_xp(data, amount):
    before = data["level"]
    data["xp"] += max(0, int(amount))
    after = level_from_xp(data["xp"])
    if after > before:
        data["level"] = after
        data["attrPoints"] += DATA["attrPerLevel"] * (after - before)
        data["skillPoints"] += DATA["skillPerLevel"] * (after - before)
    return after - before


def quest_progress(data, kills, bosses):
    states = {q["id"]: q for q in data["quests"]}
    for qid, q in QUESTS.items():
        if data["level"] < q["minLevel"]:
            continue
        st = states.get(qid)
        if not st:
            st = {"id": qid, "progress": 0, "done": False, "claimed": False}
            data["quests"].append(st)
            states[qid] = st
        if st["done"]:
            continue
        if q["kind"] == "kill":
            st["progress"] += int(kills.get(q["target"], 0))
        elif q["kind"] == "boss":
            st["progress"] += sum(1 for b in bosses if b == q["target"])
        if st["progress"] >= q["count"]:
            st["progress"] = q["count"]
            st["done"] = True


def parse_stage(key):
    """«a2s3» или «n:a2s3» (Кошмар) → (этап, кошмар?) или None."""
    if not isinstance(key, str):
        return None
    nightmare = key.startswith("n:")
    st = STAGES.get(key[2:] if nightmare else key)
    return (st, nightmare) if st else None


def stage_unlocked(key, cleared):
    p = parse_stage(key)
    if not p:
        return False
    st, nightmare = p
    prev = st["unlock"]
    if nightmare:
        return ("n:" + prev) in cleared if prev else FINAL_STAGE in cleared
    return not prev or prev in cleared


def stage_name(key):
    p = parse_stage(key)
    if not p:
        return key
    st, nightmare = p
    return ("Кошмар: " if nightmare else "") + st["name"]


def stage_boss(key):
    p = parse_stage(key)
    return p[0]["boss"] if p else ""


HOTBAR_SIZE = 6


def respec_cost(level):
    return 40 + level * level * 6


def migrate_char(data):
    """Обновляет старые сохранения: 6 ячеек навыков, 2 очка навыков за уровень, этапы кампании."""
    changed = migrate_cleared(data)
    hb = list(data.get("hotbar") or [])
    if len(hb) < HOTBAR_SIZE:
        data["hotbar"] = (hb + [None] * HOTBAR_SIZE)[:HOTBAR_SIZE]
        changed = True
    if not data.get("sp2"):
        # раньше давали 1 очко за уровень — доплачиваем разницу
        data["skillPoints"] = data.get("skillPoints", 0) + max(0, data.get("level", 1) - 1)
        data["sp2"] = 1
        changed = True
    return changed


def migrate_cleared(data):
    """Переводит старые id подземелий в этапы кампании. Возвращает True, если что-то поменялось."""
    cleared = data.get("cleared", [])
    if not any(c in LEGACY_CLEARED for c in cleared):
        return False
    out = []
    for c in cleared:
        for x in LEGACY_CLEARED.get(c, [c]):
            if x not in out:
                out.append(x)
    data["cleared"] = out
    return True


def unlocked_by(key):
    """Что открывает первое прохождение этапа."""
    p = parse_stage(key)
    if not p:
        return []
    st, nightmare = p
    pref = "n:" if nightmare else ""
    out = [pref + k for k, s in STAGES.items() if s["unlock"] == st["id"]]
    if st["id"] == FINAL_STAGE and not nightmare:
        out.append("n:a1s1")
    return out


def run_level(key, char_level):
    st, nightmare = parse_stage(key)
    base = st["level"] + (NIGHTMARE_BONUS if nightmare else 0)
    # чуть подтягиваем к уровню героя, чтобы повтор старых этапов не был пустым
    return max(base, min(char_level - 1, base + 3))


def apply_op(char_id, data, op):
    """Действие игрока в лагере. Меняет data на месте и возвращает сообщение."""
    kind = op.get("op")
    inv, stash, eq = data["inventory"], data["stash"], data["equipment"]

    if kind == "move":
        src = inv if op.get("from") == "inventory" else stash if op.get("from") == "stash" else None
        dst = inv if op.get("to") == "inventory" else stash if op.get("to") == "stash" else None
        if src is None or dst is None:
            raise GameError("Неверное место.")
        size = INVENTORY_SIZE if dst is inv else STASH_SIZE
        pos = op.get("pos")
        if not isinstance(pos, int) or not 0 <= pos < size:
            raise GameError("Неверная ячейка.")
        it = find(src, op.get("uid"))
        other = next((x for x in dst if x["pos"] == pos and x is not it), None)
        if other:
            dst.remove(other)
            other["pos"] = it["pos"]
            src.append(other)
        src.remove(it)
        it["pos"] = pos
        dst.append(it)
        return ""

    if kind == "equip":
        it = find(inv, op.get("uid"))
        base = BASES[it["base"]]
        if required_level(it) > data["level"]:
            raise GameError(f"Нужен {required_level(it)} уровень.")
        if not can_class_use(data["cls"], it):
            raise GameError("Ваш класс не может это использовать.")
        slot = op.get("slot")
        if base["slot"] == "ring":
            slot = slot if slot in ("ring1", "ring2") else ("ring1" if "ring1" not in eq else "ring2" if "ring2" not in eq else "ring1")
        else:
            slot = base["slot"]
        inv.remove(it)
        pos = it.pop("pos")
        old = eq.get(slot)
        eq[slot] = it
        if old:
            old["pos"] = pos
            inv.append(old)
        return ""

    if kind == "unequip":
        slot = op.get("slot")
        if slot not in eq:
            raise GameError("Слот пуст.")
        pos = op.get("pos")
        if not isinstance(pos, int) or any(x["pos"] == pos for x in inv) or not 0 <= pos < INVENTORY_SIZE:
            pos = free_pos(inv, INVENTORY_SIZE)
        if pos is None:
            raise GameError("Сумка полна.")
        it = eq.pop(slot)
        it["pos"] = pos
        inv.append(it)
        return ""

    if kind == "sell":
        it = find(inv, op.get("uid"))
        inv.remove(it)
        v = item_value(it)
        data["gold"] += v
        return f"Продано за {v} зол."

    if kind == "destroy":
        it = find(inv, op.get("uid"))
        inv.remove(it)
        return "Предмет выброшен."

    if kind == "buy":
        stock = merchant_stock(char_id, data.get("merchantGen", 0), data["level"])
        bought = data.setdefault("bought", [])
        idx = op.get("index")
        if not isinstance(idx, int) or not 0 <= idx < len(stock) or idx in bought:
            raise GameError("Этого товара уже нет.")
        it = stock[idx]
        if data["gold"] < it["price"]:
            raise GameError("Не хватает золота.")
        pos = free_pos(inv, INVENTORY_SIZE)
        if pos is None:
            raise GameError("Сумка полна.")
        data["gold"] -= it.pop("price")
        it["pos"] = pos
        inv.append(it)
        bought.append(idx)
        return f"Куплено: {it['name']}"

    if kind == "buy_potion":
        pk = op.get("kind")
        n = op.get("n", 1)
        if pk not in POTIONS or not isinstance(n, int) or not 1 <= n <= 10:
            raise GameError("Неверная покупка.")
        cost = POTIONS[pk]["price"] * n
        if data["gold"] < cost:
            raise GameError("Не хватает золота.")
        if data["potions"][pk] + n > 20:
            raise GameError("Больше 20 зелий не унести.")
        data["gold"] -= cost
        data["potions"][pk] += n
        return ""

    if kind == "upgrade":
        uid = op.get("uid")
        it = next((x for x in eq.values() if x["uid"] == uid), None) or find(inv, uid)
        cost = upgrade_cost(it)
        if cost is None:
            raise GameError("Предмет уже заточен до предела.")
        if data["gold"] < cost:
            raise GameError("Не хватает золота.")
        data["gold"] -= cost
        it["upgrade"] = it.get("upgrade", 0) + 1
        return f"{it['name']} заточен до +{it['upgrade']}."

    if kind == "attr":
        a = op.get("attr")
        if a not in ATTRS:
            raise GameError("Неизвестный атрибут.")
        if data["attrPoints"] <= 0:
            raise GameError("Нет свободных очков.")
        data["attrPoints"] -= 1
        data["attrs"][a] += 1
        return ""

    if kind == "skill":
        sid = op.get("id")
        s = SKILLS.get(sid)
        if not s or s["cls"] != data["cls"]:
            raise GameError("Неизвестный навык.")
        cur = data["skills"].get(sid, 0)
        if data["skillPoints"] <= 0:
            raise GameError("Нет очков навыков.")
        if cur >= s["maxRank"]:
            raise GameError("Максимальный ранг.")
        if data["level"] < s["reqLevel"]:
            raise GameError(f"Нужен {s['reqLevel']} уровень.")
        for r in s["requires"]:
            if data["skills"].get(r["id"], 0) < r["rank"]:
                raise GameError(f"Нужно: {SKILLS[r['id']]['name']} {r['rank']}")
        data["skillPoints"] -= 1
        data["skills"][sid] = cur + 1
        if cur == 0 and s["kind"] == "active" and None in data["hotbar"]:
            data["hotbar"][data["hotbar"].index(None)] = sid
        return ""

    if kind == "respec":
        spent = sum(v for v in data["skills"].values() if isinstance(v, int))
        if spent <= 0:
            raise GameError("Нечего сбрасывать.")
        cost = respec_cost(data["level"])
        if data["gold"] < cost:
            raise GameError(f"Нужно {cost} золота.")
        data["gold"] -= cost
        data["skills"] = {}
        data["skillPoints"] += spent
        data["hotbar"] = [None] * HOTBAR_SIZE
        return f"Навыки забыты. Свободных очков: {data['skillPoints']}."

    if kind == "hotbar":
        slot, sid = op.get("slot"), op.get("id")
        if slot not in range(HOTBAR_SIZE):
            raise GameError("Неверная ячейка.")
        if sid is not None:
            s = SKILLS.get(sid)
            if not s or s["kind"] != "active" or data["skills"].get(sid, 0) <= 0:
                raise GameError("Навык не изучен.")
            data["hotbar"] = [None if x == sid else x for x in data["hotbar"]]
        data["hotbar"][slot] = sid
        return ""

    if kind == "quest_claim":
        st = next((q for q in data["quests"] if q["id"] == op.get("id")), None)
        if not st or not st["done"] or st["claimed"]:
            raise GameError("Награда недоступна.")
        q = QUESTS[st["id"]]
        st["claimed"] = True
        data["gold"] += q["reward"]["gold"]
        add_xp(data, q["reward"]["xp"])
        return f"Награда: {q['reward']['xp']} опыта и {q['reward']['gold']} золота."

    if kind == "appearance":
        data["appearance"] = clean_appearance(op.get("appearance"))
        return ""

    raise GameError("Неизвестное действие.")


def xp_cap(level):
    """Верхняя граница опыта за один забег (защита от подделки итогов)."""
    return int(9000 * (1 + 0.35 * (level - 1)) ** 1.5)


def gold_cap(level):
    return int(6000 * (1 + 0.3 * (level - 1)) ** 1.4)


def apply_run_result(data, run_level_, success, res, boss_id):
    """Начисляет итоги забега с проверкой правдоподобия."""
    def clamp_int(v, lo, hi):
        return max(lo, min(hi, int(v))) if isinstance(v, (int, float)) and math.isfinite(v) else lo

    xp = clamp_int(res.get("xp", 0), 0, xp_cap(run_level_))
    gold = clamp_int(res.get("gold", 0), 0, gold_cap(run_level_))
    kills_in = res.get("kills") if isinstance(res.get("kills"), dict) else {}
    kills = {k: clamp_int(v, 0, 200) for k, v in kills_in.items() if isinstance(k, str) and len(k) < 32}
    bosses = [b for b in (res.get("bosses") or []) if b == boss_id][:1]
    if not success:
        xp //= 2
    pu = res.get("potionsUsed") or {}
    pf = res.get("potionsFound") or {}
    for k in ("health", "mana"):
        used = clamp_int(pu.get(k, 0), 0, 99)
        found = clamp_int(pf.get(k, 0), 0, 15)
        data["potions"][k] = max(0, min(20, data["potions"][k] - used + found))
    levels = add_xp(data, xp)
    data["gold"] += gold
    st = data.setdefault("stats", {"runs": 0, "deaths": 0, "kills": 0, "bosses": 0})
    st["runs"] += 1
    st["kills"] += sum(kills.values())
    if not success:
        st["deaths"] += 1
    if bosses:
        st["bosses"] += 1
    quest_progress(data, kills, bosses)
    data["merchantGen"] = data.get("merchantGen", 0) + 1
    data["bought"] = []
    return {"xp": xp, "gold": gold, "levels": levels}
