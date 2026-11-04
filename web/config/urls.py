from django.contrib import admin
from django.urls import include, path

admin.site.site_header = "SkyBook — администрирование"
admin.site.site_title = "SkyBook"
admin.site.index_title = "Управление системой бронирования"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("world/", include("world.urls")),
    path("", include("booking.urls")),
]
