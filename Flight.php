<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Flight extends Model
{
    use HasFactory;

    protected $fillable = [
        "flight_number", "departure_datetime", "arrival_datetime", 
        "origin_airport_code", "destination_airport_code", "available_seats"
    ];

    public function originAirport()
    {
        return $this->belongsTo(airport::class, "origin_airport_code", "id");
    }

    public function destinationAirport()
    {
        return $this->belongsTo(airport::class, "destination_airport_code", "id");
    }
}
