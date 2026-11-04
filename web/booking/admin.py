from django.contrib import admin
from django.db.models import Count, Q

from .models import Airport, Booking, Flight, Passenger


@admin.register(Airport)
class AirportAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "location"]
    search_fields = ["code", "name", "location"]


class BookingInline(admin.TabularInline):
    model = Booking
    extra = 0
    fields = ["code", "passenger", "seat", "price", "payment_status"]
    readonly_fields = ["code"]
    autocomplete_fields = ["passenger"]


@admin.register(Flight)
class FlightAdmin(admin.ModelAdmin):
    list_display = ["flight_number", "origin", "destination", "departure", "arrival", "price", "occupancy"]
    list_filter = ["origin", "destination", "departure"]
    search_fields = ["flight_number", "origin__code", "destination__code"]
    date_hierarchy = "departure"
    autocomplete_fields = ["origin", "destination"]
    inlines = [BookingInline]

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .select_related("origin", "destination")
            .annotate(booked=Count("bookings", filter=~Q(bookings__payment_status="cancelled")))
        )

    @admin.display(description="занято мест", ordering="booked")
    def occupancy(self, obj):
        return f"{obj.booked} / {obj.total_seats}"


@admin.register(Passenger)
class PassengerAdmin(admin.ModelAdmin):
    list_display = ["last_name", "first_name", "email", "passport_number", "bookings_count"]
    search_fields = ["first_name", "last_name", "email", "passport_number"]

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(n=Count("bookings"))

    @admin.display(description="броней", ordering="n")
    def bookings_count(self, obj):
        return obj.n


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ["code", "passenger", "flight", "seat", "price", "payment_status", "created_at"]
    list_filter = ["payment_status", "flight__origin", "flight__destination"]
    search_fields = ["code", "passenger__last_name", "passenger__passport_number", "flight__flight_number"]
    list_editable = ["payment_status"]
    autocomplete_fields = ["flight", "passenger"]
    readonly_fields = ["code", "created_at"]
    list_select_related = ["passenger", "flight__origin", "flight__destination"]
