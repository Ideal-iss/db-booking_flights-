from django.urls import path

from . import views

app_name = "hollow"

urlpatterns = [
    path("", views.index, name="index"),
    path("api/me/", views.me, name="me"),
    path("api/login/", views.api_login, name="login"),
    path("api/register/", views.api_register, name="register"),
    path("api/logout/", views.api_logout, name="logout"),
    path("api/characters/", views.create_character, name="create"),
    path("api/characters/<int:cid>/", views.character, name="character"),
    path("api/characters/<int:cid>/op/", views.character_op, name="op"),
    path("api/characters/<int:cid>/run/", views.run_start, name="run_start"),
    path("api/characters/<int:cid>/run/<uuid:rid>/pickup/", views.run_pickup, name="run_pickup"),
    path("api/characters/<int:cid>/run/<uuid:rid>/finish/", views.run_finish, name="run_finish"),
    path("api/characters/<int:cid>/coop-token/", views.coop_token, name="coop_token"),
    path("api/coop/report/", views.coop_report, name="coop_report"),
]
