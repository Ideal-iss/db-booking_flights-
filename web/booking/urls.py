from django.urls import path

from . import views

app_name = "booking"

urlpatterns = [
    path("", views.index, name="index"),
    path("flights/<int:pk>/", views.flight_detail, name="flight_detail"),
    path("bookings/", views.my_bookings, name="my_bookings"),
    path("bookings/<str:code>/", views.booking_detail, name="booking_detail"),
    path("bookings/<str:code>/pay/", views.pay_booking, name="pay_booking"),
    path("bookings/<str:code>/cancel/", views.cancel_booking, name="cancel_booking"),
]
