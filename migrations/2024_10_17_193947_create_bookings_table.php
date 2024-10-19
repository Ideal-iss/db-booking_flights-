<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateBookingsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create("bookings", function (Blueprint $table) {
            $table->id();
            $table->timestamps();
            $table->unsignedBigInteger("flight_id");
            $table->foreign("flight_id")->references("id")->on("flights");
            $table->unsignedBigInteger("passenger_id");
            $table->foreign("passenger_id")->references("id")->on("passengers");
            $table->string("payment_status");
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists("bookings");
    }
}
