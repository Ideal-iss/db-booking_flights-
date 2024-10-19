<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\airport;
use App\Models\Flight;
use App\Models\passenger;
use App\Models\Booking;
class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     *
     * @return void
     */
    public function run()
    {
        $airports = [
            ['JFK', 'John F. Kennedy International Airport', 'New York, USA'],
            ['LAX', 'Los Angeles International Airport', 'Los Angeles, USA'],
            ['HND', 'Tokyo Haneda Airport', 'Tokyo, Japan'],
            ['CDG', 'Charles de Gaulle Airport', 'Paris, France'],
            ['DXB', 'Dubai International Airport', 'Dubai, UAE'],
            ['SIN', 'Singapore Changi Airport', 'Singapore'],
            ['SYD', 'Sydney Kingsford Smith Airport', 'Sydney, Australia'],
            ['LHR', 'London Heathrow Airport', 'London, UK'],
            ['FRA', 'Frankfurt Airport', 'Frankfurt, Germany'],
            ['AMS', 'Amsterdam Schiphol Airport', 'Amsterdam, Netherlands']
        ];

        foreach ($airports as $airport) {
            airport::create([
                "airport_code" => $airport[0],
                'airport_name' => $airport[1],
                'location' => $airport[2],
            ]);
        }

        $flights = [
            ['AA123', '2024-10-18 08:00:00', '2024-10-18 12:00:00', 'JFK', 'LAX', 150],
            ['JL456', '2024-10-19 09:00:00', '2024-10-19 13:00:00', 'HND', 'JFK', 200],
            ['AF789', '2024-10-20 10:00:00', '2024-10-20 14:00:00', 'CDG', 'DXB', 180],
            ['EK101', '2024-10-21 11:00:00', '2024-10-21 15:00:00', 'DXB', 'SIN', 220],
            ['SQ202', '2024-10-22 12:00:00', '2024-10-22 16:00:00', 'SIN', 'SYD', 170],
            ['QF303', '2024-10-23 13:00:00', '2024-10-23 17:00:00', 'SYD', 'LHR', 190],
            ['BA404', '2024-10-24 14:00:00', '2024-10-24 18:00:00', 'LHR', 'FRA', 160],
            ['LH505', '2024-10-25 15:00:00', '2024-10-25 19:00:00', 'FRA', 'AMS', 140],
            ['KL606', '2024-10-26 16:00:00', '2024-10-26 20:00:00', 'AMS', 'JFK', 210],
            ['DL707', '2024-10-27 17:00:00', '2024-10-27 21:00:00', 'JFK', 'HND', 230]
        ];

        foreach ($flights as $flight) {
            Flight::create([
                'flight_number' => $flight[0],
                'departure_datetime' => $flight[1],
                'arrival_datetime' => $flight[2],
                'origin_airport_code' => $flight[3],
                'destination_airport_code' => $flight[4],
                'available_seats' => $flight[5]
            ]);
        }

        $passengers = [
            ['John', 'Doe', 'john.doe@example.com', 'A12345678'],
            ['Jane', 'Smith', 'jane.smith@example.com', 'B87654321'],
            ['Alice', 'Johnson', 'alice.johnson@example.com', 'C23456789'],
            ['Bob', 'Brown', 'bob.brown@example.com', 'D34567890'],
            ['Charlie', 'Davis', 'charlie.davis@example.com', 'E45678901'],
            ['David', 'Wilson', 'david.wilson@example.com', 'F56789012'],
            ['Eve', 'Taylor', 'eve.taylor@example.com', 'G67890123'],
            ['Frank', 'Anderson', 'frank.anderson@example.com', 'H78901234'],
            ['Grace', 'Thomas', 'grace.thomas@example.com', 'I89012345'],
            ['Hank', 'Moore', 'hank.moore@example.com', 'J90123456']
        ];

        foreach ($passengers as $passenger) {
            passenger::create([
                'first_name' => $passenger[0],
                'last_name' => $passenger[1],
                'email' => $passenger[2],
                'passport_number' => $passenger[3]
            ]);
        }
        $bookings = [
            [1, 1, 'Paid'],
            [2, 2, 'Pending'],
            [3, 3, 'Paid'],
            [4, 4, 'Pending'],
            [5, 5, 'Paid'],
            [6, 6, 'Pending'],
            [7, 7, 'Paid'],
            [8, 8, 'Pending'],
            [9, 9, 'Paid'],
            [10, 10, 'Pending']
        ];

        foreach ($bookings as $booking) {
            Booking::create([
                "flight_id" => $booking[0],
                "passenger_id" => $booking[1],
                "payment_status" => $booking[2]
            ]);
        }
    
    }
}
