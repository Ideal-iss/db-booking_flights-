import json

from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User

from booking.models import Airport

from .models import Profile


class RegisterForm(UserCreationForm):
    nickname = forms.CharField(label="Никнейм", max_length=20, help_text="Его видят другие игроки.")
    home = forms.ModelChoiceField(
        Airport.objects.exclude(continent="").order_by("location"), label="Родной аэропорт",
        empty_label=None, help_text="Здесь вы начнёте путешествие.",
    )
    avatar = forms.CharField(widget=forms.HiddenInput, required=False)

    class Meta(UserCreationForm.Meta):
        model = User
        fields = ["username"]
        labels = {"username": "Логин"}
        help_texts = {"username": "Латиница, цифры и @/./+/-/_"}

    def clean_nickname(self):
        nick = " ".join(self.cleaned_data["nickname"].split())
        if len(nick) < 2:
            raise forms.ValidationError("Минимум 2 символа.")
        if Profile.objects.filter(nickname__iexact=nick).exists():
            raise forms.ValidationError("Этот никнейм уже занят.")
        return nick

    def clean_avatar(self):
        try:
            data = json.loads(self.cleaned_data.get("avatar") or "{}")
        except ValueError:
            data = {}
        return data if isinstance(data, dict) else {}
