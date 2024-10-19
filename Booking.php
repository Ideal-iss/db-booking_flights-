<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Booking extends Model
{
    use HasFactory;

    protected $fillable = ["flight_id", "passenger_id", "payment_status"];

    public function flight()
    {
        return $this->belongsTo(Flight::class, "flight_id");
    }

    public function passenger()
    {
        return $this->belongsTo(Passenger::class, "passenger_id");
    }
}
