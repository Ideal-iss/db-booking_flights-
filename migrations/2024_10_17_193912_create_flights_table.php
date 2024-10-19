<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateFlightsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create("flights", function (Blueprint $table) {
            $table->id();
            $table->string("flight_number", 20);
            $table->dateTime("departure_datetime");
            $table->dateTime("arrival_datetime");
            $table->string("origin_airport_code");
            $table->string("destination_airport_code");
            $table->integer("available_seats");
            $table->foreign("origin_airport_code")->references("airport_code")->on("airports");
            $table->foreign("destination_airport_code")->references("airport_code")->on("airports");
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists("flights");
    }
}
