<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class airport extends Model
{
    use HasFactory;

    protected $primaryKey = "airport_code";

    protected $fillable = ["airport_code", "airport_name", "location"];
}
