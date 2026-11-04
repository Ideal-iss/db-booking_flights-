from django.core.management.base import BaseCommand

from world.logic import seed_world


class Command(BaseCommand):
    help = "Создаёт маршруты мира, достопримечательности, достижения и вещи магазина"

    def handle(self, *args, **options):
        created = seed_world()
        self.stdout.write(self.style.SUCCESS(f"Мир готов: новых маршрутов {created}."))
