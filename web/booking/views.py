from datetime import datetime, time, timedelta

from django.contrib import messages
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_POST

from .forms import BookingForm, LookupForm, SearchForm
from .models import Booking, Flight, Passenger


def _upcoming_flights():
    return (
        Flight.objects.filter(departure__gt=timezone.now())
        .select_related("origin", "destination")
        .annotate(
            booked=Count("bookings", filter=~Q(bookings__payment_status=Booking.Status.CANCELLED))
        )
        # С агрегацией Meta.ordering не применяется — сортируем явно.
        .order_by("departure")
    )


def index(request):
    form = SearchForm(request.GET or None)
    flights = _upcoming_flights()
    searched = False
    nearby = None

    if form.is_bound and form.is_valid():
        searched = True
        data = form.cleaned_data
        if data["origin"]:
            flights = flights.filter(origin=data["origin"])
        if data["destination"]:
            flights = flights.filter(destination=data["destination"])
        if data["date"]:
            day_start = timezone.make_aware(datetime.combine(data["date"], time.min))
            exact = flights.filter(departure__gte=day_start, departure__lt=day_start + timedelta(days=1))
            if not exact.exists():
                # Ничего в этот день — покажем ближайшие рейсы по тому же направлению.
                nearby = flights[:6]
            flights = exact

    flights = list(flights[:30])
    for f in flights:
        f.free = f.total_seats - f.booked
    if nearby is not None:
        nearby = list(nearby)
        for f in nearby:
            f.free = f.total_seats - f.booked

    return render(
        request,
        "booking/index.html",
        {"form": form, "flights": flights, "searched": searched, "nearby": nearby},
    )


def flight_detail(request, pk):
    flight = get_object_or_404(Flight.objects.select_related("origin", "destination"), pk=pk)
    departed = flight.departure <= timezone.now()
    form = BookingForm(request.POST or None)

    if request.method == "POST" and not departed and form.is_valid():
        data = form.cleaned_data
        seat = data["seat"]
        try:
            with transaction.atomic():
                # Блокируем рейс, чтобы два человека не заняли одно место одновременно.
                flight = Flight.objects.select_for_update().get(pk=flight.pk)
                if not flight.is_valid_seat(seat):
                    form.add_error("seat", "Такого места нет в салоне.")
                elif seat in flight.taken_seats():
                    form.add_error("seat", f"Место {seat} уже заняли. Выберите другое.")
                else:
                    passenger, created = Passenger.objects.get_or_create(
                        passport_number=data["passport_number"],
                        defaults={
                            "first_name": data["first_name"],
                            "last_name": data["last_name"],
                            "email": data["email"],
                        },
                    )
                    if not created and (
                        passenger.last_name.lower() != data["last_name"].lower()
                        or passenger.first_name.lower() != data["first_name"].lower()
                    ):
                        form.add_error(
                            "passport_number",
                            "Этот паспорт уже зарегистрирован на другое имя.",
                        )
                    else:
                        if passenger.email != data["email"]:
                            passenger.email = data["email"]
                            passenger.save(update_fields=["email"])
                        booking = Booking.objects.create(
                            flight=flight, passenger=passenger, seat=seat, price=flight.price
                        )
                        messages.success(request, "Бронирование создано! Осталось его оплатить.")
                        return redirect("booking:booking_detail", code=booking.code)
        except IntegrityError:
            form.add_error(None, "У этого пассажира уже есть бронь на этот рейс, или место только что заняли.")

    return render(
        request,
        "booking/flight_detail.html",
        {
            "flight": flight,
            "form": form,
            "departed": departed,
            "seat_map": flight.seat_map(),
            "selected_seat": form["seat"].value() or "",
        },
    )


def booking_detail(request, code):
    booking = get_object_or_404(
        Booking.objects.select_related("flight__origin", "flight__destination", "passenger"),
        code=code.upper(),
    )
    can_change = booking.is_active and booking.flight.departure > timezone.now()
    return render(request, "booking/booking_detail.html", {"booking": booking, "can_change": can_change})


def _changeable_booking(code):
    booking = get_object_or_404(Booking.objects.select_related("flight"), code=code.upper())
    if not booking.is_active or booking.flight.departure <= timezone.now():
        return booking, False
    return booking, True


@require_POST
def pay_booking(request, code):
    booking, ok = _changeable_booking(code)
    if ok and booking.payment_status == Booking.Status.PENDING:
        booking.payment_status = Booking.Status.PAID
        booking.save(update_fields=["payment_status"])
        messages.success(request, "Оплата прошла успешно. Хорошего полёта!")
    else:
        messages.error(request, "Это бронирование нельзя оплатить.")
    return redirect("booking:booking_detail", code=booking.code)


@require_POST
def cancel_booking(request, code):
    booking, ok = _changeable_booking(code)
    if ok:
        booking.payment_status = Booking.Status.CANCELLED
        booking.save(update_fields=["payment_status"])
        messages.info(request, f"Бронирование отменено, место {booking.seat} освобождено.")
    else:
        messages.error(request, "Это бронирование уже нельзя отменить.")
    return redirect("booking:booking_detail", code=booking.code)


def my_bookings(request):
    form = LookupForm(request.GET or None)
    bookings = None
    code_lookup = request.GET.get("code", "").strip().upper()

    if code_lookup:
        if Booking.objects.filter(code=code_lookup).exists():
            return redirect("booking:booking_detail", code=code_lookup)
        messages.error(request, f"Бронирование с кодом {code_lookup} не найдено.")
        form = LookupForm()
    elif form.is_bound and form.is_valid():
        bookings = (
            Booking.objects.filter(
                passenger__passport_number=form.cleaned_data["passport_number"],
                passenger__email__iexact=form.cleaned_data["email"],
            )
            .select_related("flight__origin", "flight__destination", "passenger")
            .order_by("-flight__departure")
        )

    return render(request, "booking/my_bookings.html", {"form": form, "bookings": bookings})
