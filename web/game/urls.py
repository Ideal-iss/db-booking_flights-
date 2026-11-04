from django.urls import path

from . import views

app_name = "game"

urlpatterns = [
    path("", views.home, name="home"),
    path("new/", views.new_room, name="new"),
    path("join/", views.join_by_code, name="join_by_code"),
    path("<str:code>/", views.room, name="room"),
    path("<str:code>/join/", views.join, name="join"),
    path("<str:code>/start/", views.start, name="start"),
    path("<str:code>/state/", views.room_state, name="state"),
    path("<str:code>/book/<int:flight_id>/", views.book_flight, name="book"),
    path("<str:code>/cancel/", views.cancel_ticket, name="cancel"),
]
