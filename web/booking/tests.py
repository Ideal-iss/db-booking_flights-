from datetime import timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from .models import Airport, Booking, Flight, Passenger


class BookingFlowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.jfk = Airport.objects.create(code="JFK", name="JFK", location="Нью-Йорк, США")
        cls.lax = Airport.objects.create(code="LAX", name="LAX", location="Лос-Анджелес, США")
        dep = timezone.now() + timedelta(days=3)
        cls.flight = Flight.objects.create(
            flight_number="AA123", origin=cls.jfk, destination=cls.lax,
            departure=dep, arrival=dep + timedelta(hours=6), rows=2, price=Decimal("300"),
        )

    def book(self, seat="1A", passport="P1", first="Иван", last="Петров"):
        return self.client.post(
            reverse("booking:flight_detail", args=[self.flight.pk]),
            {"seat": seat, "first_name": first, "last_name": last, "email": "i@example.com", "passport_number": passport},
        )

    def test_search_finds_flight(self):
        r = self.client.get(reverse("booking:index"), {"origin": "JFK", "destination": "LAX"})
        self.assertContains(r, "AA123")
        r = self.client.get(reverse("booking:index"), {"origin": "LAX", "destination": "JFK"})
        self.assertNotContains(r, "AA123")

    def test_booking_created_and_seats_decrease(self):
        r = self.book()
        booking = Booking.objects.get()
        self.assertRedirects(r, reverse("booking:booking_detail", args=[booking.code]))
        self.assertEqual(booking.seat, "1A")
        self.assertEqual(booking.price, Decimal("300"))
        self.assertEqual(self.flight.available_seats, 11)

    def test_same_seat_cannot_be_booked_twice(self):
        self.book(seat="1A", passport="P1")
        r = self.book(seat="1A", passport="P2", first="Анна", last="Смирнова")
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "уже заняли")
        self.assertEqual(Booking.objects.count(), 1)

    def test_invalid_seat_rejected(self):
        r = self.book(seat="9Z")
        self.assertContains(r, "Такого места нет")
        self.assertFalse(Booking.objects.exists())

    def test_passenger_cannot_book_same_flight_twice(self):
        self.book(seat="1A")
        r = self.book(seat="1B")
        self.assertEqual(Booking.objects.count(), 1)
        self.assertContains(r, "уже есть бронь")

    def test_passport_with_other_name_rejected(self):
        self.book(seat="1A", passport="P1")
        r = self.book(seat="1B", passport="P1", first="Другой", last="Человек")
        self.assertContains(r, "другое имя")

    def test_pay_and_cancel_frees_seat(self):
        self.book(seat="2C")
        b = Booking.objects.get()
        self.client.post(reverse("booking:pay_booking", args=[b.code]))
        b.refresh_from_db()
        self.assertEqual(b.payment_status, Booking.Status.PAID)
        self.client.post(reverse("booking:cancel_booking", args=[b.code]))
        b.refresh_from_db()
        self.assertEqual(b.payment_status, Booking.Status.CANCELLED)
        self.assertNotIn("2C", self.flight.taken_seats())
        # Место снова можно занять.
        self.book(seat="2C", passport="P9", first="Анна", last="Смирнова")
        self.assertEqual(Booking.objects.active().count(), 1)

    def test_my_bookings_lookup(self):
        self.book()
        r = self.client.get(reverse("booking:my_bookings"), {"email": "I@example.com", "passport_number": "p1"})
        self.assertContains(r, "Найдено: 1")
        r = self.client.get(reverse("booking:my_bookings"), {"email": "x@example.com", "passport_number": "P1"})
        self.assertContains(r, "Найдено: 0")

    def test_departed_flight_not_bookable(self):
        self.flight.departure = timezone.now() - timedelta(hours=2)
        self.flight.arrival = timezone.now() + timedelta(hours=4)
        self.flight.save()
        r = self.book()
        self.assertContains(r, "уже вылетел")
        self.assertFalse(Booking.objects.exists())


class ConstraintTests(TestCase):
    def test_flight_constraints(self):
        a = Airport.objects.create(code="AAA", name="A", location="A, A")
        b = Airport.objects.create(code="BBB", name="B", location="B, B")
        now = timezone.now()
        with self.assertRaises(IntegrityError), transaction.atomic():
            Flight.objects.create(flight_number="X1", origin=a, destination=a, departure=now,
                                  arrival=now + timedelta(hours=1), rows=1, price=1)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Flight.objects.create(flight_number="X2", origin=a, destination=b, departure=now,
                                  arrival=now - timedelta(hours=1), rows=1, price=1)

    def test_passport_unique(self):
        Passenger.objects.create(first_name="A", last_name="B", email="a@b.c", passport_number="Z1")
        with self.assertRaises(IntegrityError):
            Passenger.objects.create(first_name="C", last_name="D", email="c@d.e", passport_number="Z1")
