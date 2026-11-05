"""Игровой контент: достопримечательности, достижения, магазин и карта территории аэропорта."""

import hashlib
import random

# ---------- Достопримечательности (kind — как рисовать, см. static/world/scene.js) ----------
LANDMARKS = {
    "JFK": ("Статуя Свободы", "statue", "Подарок Франции к столетию независимости США, высота с постаментом — 93 м."),
    "LAX": ("Колесо обозрения на пирсе Санта-Моники", "wheel", "Единственное в мире колесо обозрения на солнечных батареях."),
    "HND": ("Токийская телебашня", "lattice_red", "Высота 333 м — на 13 метров выше Эйфелевой башни."),
    "CDG": ("Эйфелева башня", "lattice", "Её строили 2 года 2 месяца и 5 дней к Всемирной выставке 1889 года."),
    "DXB": ("Бурдж-Халифа", "skyscraper", "Самое высокое здание в мире — 828 метров."),
    "SIN": ("Сады у залива", "supertrees", "Металлические «супердеревья» высотой до 50 м собирают дождевую воду."),
    "SYD": ("Сиднейский оперный театр", "opera", "Крыша похожа на паруса, её покрывают более миллиона плиток."),
    "LHR": ("Биг-Бен", "clocktower", "Так на самом деле зовут колокол весом 13,7 тонны, а не башню."),
    "FRA": ("Площадь Рёмерберг", "houses", "Фахверковые дома здесь восстановили после войны по старым чертежам."),
    "AMS": ("Мельницы и каналы", "windmill", "В Амстердаме больше 1500 мостов и около 100 км каналов."),
    "PEK": ("Храм Неба", "temple_round", "Построен в 1420 году без единого гвоздя."),
    "HKG": ("Гавань Виктория", "skyline", "Каждый вечер здесь проходит световое шоу «Симфония огней»."),
    "ICN": ("Дворец Кёнбоккун", "pagoda", "Главный королевский дворец династии Чосон, XIV век."),
    "BKK": ("Храм Ват Арун", "stupa", "Храм Утренней зари украшен осколками китайского фарфора."),
    "DEL": ("Ворота Индии", "arch", "42-метровая арка в память о солдатах Первой мировой."),
    "SVO": ("Собор Василия Блаженного", "onion", "Девять храмов на одном основании, построен в 1561 году."),
    "IST": ("Айя-София", "domes", "Её купол почти тысячу лет был крупнейшим в мире."),
    "CAI": ("Пирамиды Гизы", "pyramids", "Пирамида Хеопса — единственное сохранившееся чудо света."),
    "NBO": ("Национальный парк Найроби", "savanna", "Сафари-парк, где жирафы гуляют на фоне небоскрёбов."),
    "JNB": ("Башня Хиллброу", "needle", "270 метров — самое высокое сооружение Африки долгие годы."),
    "GRU": ("Мост Октавиу Фриас", "bridge", "Вантовый мост с X-образным пилоном — символ Сан-Паулу."),
    "EZE": ("Обелиск Буэнос-Айреса", "obelisk", "Поставлен в 1936 году за 31 день."),
    "BOG": ("Гора Монсеррате", "mountain", "Церковь на вершине стоит на высоте 3152 м."),
    "MEX": ("Пирамида Солнца", "step_pyramid", "Третья по величине пирамида в мире, Теотиуакан."),
    "YYZ": ("Си-Эн Тауэр", "needle_tall", "553 метра; с её стеклянного пола видно землю под ногами."),
    "AKL": ("Скай-Тауэр", "needle", "С 192-метровой площадки можно прыгнуть на тросе."),
}

# ---------- Достижения: код, значок, название, условие, награда ----------
ACHIEVEMENTS = [
    ("first_flight", "✈️", "Первый полёт", "Совершите первый перелёт", 20),
    ("airports_5", "🧭", "Путешественник", "Побывайте в 5 аэропортах", 50),
    ("airports_15", "🌍", "Гражданин мира", "Побывайте в 15 аэропортах", 150),
    ("airports_all", "🏆", "Все аэропорты", "Побывайте во всех аэропортах мира", 500),
    ("continents_3", "🗺️", "Три континента", "Побывайте на трёх континентах", 80),
    ("continents_6", "🌐", "Весь мир", "Побывайте на всех шести континентах", 300),
    ("long_haul", "🛫", "Дальний рейс", "Пролетите больше 8000 км за один перелёт", 60),
    ("km_50000", "📏", "50 000 км", "Налетайте 50 000 км", 100),
    ("stamps_5", "📸", "Фотограф", "Сфотографируйте 5 достопримечательностей", 60),
    ("stamps_all", "🏛️", "Все чудеса", "Сфотографируйте все достопримечательности", 400),
    ("company", "🤝", "В хорошей компании", "Летите в одном самолёте с другим игроком", 40),
    ("chatter", "💬", "Душа компании", "Отправьте 10 сообщений в чат", 20),
    ("collector", "🪙", "Копилка", "Соберите 100 монет на картах аэропортов", 40),
    ("shopper", "🛍️", "Модник", "Купите 3 вещи в магазине", 30),
]

# ---------- Магазин: код, название, слот, цена ----------
SHOP = [
    ("cap", "Кепка", "hat", 40),
    ("beanie", "Шапка-бини", "hat", 50),
    ("panama", "Панама", "hat", 60),
    ("pilot", "Фуражка пилота", "hat", 150),
    ("cowboy", "Ковбойская шляпа", "hat", 90),
    ("crown", "Корона", "hat", 400),
    ("sunglasses", "Солнечные очки", "glasses", 40),
    ("round_glasses", "Круглые очки", "glasses", 30),
    ("hawaii", "Гавайская рубашка", "outfit", 80),
    ("uniform", "Форма пилота", "outfit", 200),
    ("hoodie", "Худи", "outfit", 70),
    ("scarf", "Шарф", "extra", 35),
    ("backpack", "Рюкзак", "extra", 60),
    ("camera", "Фотоаппарат", "extra", 90),
    ("balloon", "Воздушный шарик", "extra", 25),
]

# Бесплатные варианты конструктора аватара (индексы в палитрах scene.js)
AVATAR_CHOICES = {"skin": 6, "hair": ["short", "long", "bun", "spiky", "curly", "bald"], "hair_color": 7, "top": 9, "bottom": 7}

# ---------- Карта территории аэропорта ----------
MAP_W, MAP_H = 1600, 1040
COIN_WINDOW_S = 600  # монеты появляются заново каждые 10 минут
COINS_PER_WINDOW = 7
PICK_RADIUS = 46
STAMP_RADIUS = 120


def _rng(*parts):
    seed = int(hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()[:12], 16)
    return random.Random(seed)


def _overlaps(r, rects, pad=0):
    x, y, w, h = r
    return any(x < a + c + pad and x + w + pad > a and y < b + d + pad and y + h + pad > b for a, b, c, d in rects)


def layout(code):
    """Карта аэропорта. Одинаковая для всех игроков и для сервера (проверка монет и зон)."""
    rnd = _rng("layout", code)
    blocked = []
    runway = [0, 0, MAP_W, 160]
    terminal = [300, 200, 1000, 170]
    blocked += [runway, terminal]
    gate = [710, 370, 180, 80]  # выход на посадку — перед дверями терминала

    shop_left = rnd.random() < 0.5
    shop_building = [140 if shop_left else MAP_W - 320, 540, 180, 120]
    shop_zone = [shop_building[0] + 10, shop_building[1] + 120, 160, 70]
    blocked.append(shop_building)

    lm_x = MAP_W - 380 if shop_left else 380
    lm_x += rnd.randint(-60, 60)
    lm_y = 800 + rnd.randint(-40, 40)
    landmark = {"x": lm_x, "y": lm_y}
    blocked.append([lm_x - 70, lm_y - 50, 140, 70])

    pond = None
    if rnd.random() < 0.7:
        pw, ph = rnd.randint(220, 340), rnd.randint(110, 160)
        px = rnd.randint(560, MAP_W - 560 - pw)
        pond = [px, MAP_H - ph - 30, pw, ph]
        if not _overlaps(pond, blocked, 30):
            blocked.append(pond)
        else:
            pond = None

    fountain = [765, 560, 70, 70]  # фонтан на площади перед терминалом
    blocked.append(fountain)
    keep_clear = [gate, shop_zone, [lm_x - STAMP_RADIUS, lm_y - STAMP_RADIUS, 2 * STAMP_RADIUS, 2 * STAMP_RADIUS],
                  [700, 450, 200, 160]]
    trees = []
    for _ in range(140):
        if len(trees) >= 26:
            break
        t = [rnd.randint(40, MAP_W - 70), rnd.randint(420, MAP_H - 60), 30, 30]
        if not _overlaps(t, blocked + keep_clear + trees, 26):
            trees.append(t)
    blocked += trees

    benches = []
    for _ in range(60):
        if len(benches) >= 6:
            break
        b = [rnd.randint(80, MAP_W - 140), rnd.randint(440, MAP_H - 80), 60, 18]
        if not _overlaps(b, blocked + keep_clear + benches, 20):
            benches.append(b)

    palette = rnd.choice([
        {"grass": "#7cc36e", "path": "#e9dcc0", "water": "#5ab4e5"},
        {"grass": "#a7c957", "path": "#efe3c8", "water": "#4ea8de"},
        {"grass": "#d9c48a", "path": "#f3e9d2", "water": "#48b5c4"},  # сухой климат
        {"grass": "#6fbf8f", "path": "#e6e1d3", "water": "#62a8e0"},
    ])
    return {
        "w": MAP_W, "h": MAP_H,
        "runway": runway, "terminal": terminal, "gate": gate,
        "shop": shop_building, "shop_zone": shop_zone,
        "landmark": landmark, "pond": pond, "trees": trees, "benches": benches,
        "blocked": blocked, "spawn": [800, 525], "palette": palette, "fountain": fountain,
    }


def coins(code, window):
    """Монеты на карте в текущем 10-минутном окне: [(номер, x, y, номинал)]."""
    lay = layout(code)
    rnd = _rng("coins", code, window)
    out = []
    for _ in range(200):
        if len(out) >= COINS_PER_WINDOW:
            break
        x, y = rnd.randint(60, MAP_W - 60), rnd.randint(440, MAP_H - 50)
        if _overlaps([x - 20, y - 20, 40, 40], lay["blocked"], 10):
            continue
        value = 10 if rnd.random() < 0.25 else 5
        out.append((len(out), x, y, value))
    return out


def in_rect(x, y, rect, pad=0):
    a, b, w, h = rect
    return a - pad <= x <= a + w + pad and b - pad <= y <= b + h + pad
