from django.contrib.auth import views as auth_views
from django.urls import path

from . import views

app_name = "world"

urlpatterns = [
    path("", views.home, name="home"),
    path("register/", views.register, name="register"),
    path("login/", auth_views.LoginView.as_view(template_name="world/login.html"), name="login"),
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("me/", views.cabinet, name="cabinet"),
    path("me/avatar/", views.save_avatar, name="save_avatar"),
    path("shop/", views.shop, name="shop"),
    path("play/", views.play, name="play"),
    path("api/tick/", views.api_tick, name="tick"),
    path("api/map/", views.api_map, name="map"),
    path("api/world/", views.api_world, name="world"),
    path("api/departures/", views.api_departures, name="departures"),
    path("api/board/", views.api_board, name="board"),
    path("api/cancel/", views.api_cancel, name="cancel"),
    path("api/coin/", views.api_coin, name="coin"),
    path("api/stamp/", views.api_stamp, name="stamp"),
    path("api/say/", views.api_say, name="say"),
    path("api/emote/", views.api_emote, name="emote"),
    path("api/buy/", views.api_buy, name="buy"),
    path("api/equip/", views.api_equip, name="equip"),
]
