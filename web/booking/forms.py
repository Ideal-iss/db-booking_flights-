from django import forms

from .models import Airport


class SearchForm(forms.Form):
    origin = forms.ModelChoiceField(
        Airport.objects.all(), label="Откуда", empty_label="Любой аэропорт", required=False
    )
    destination = forms.ModelChoiceField(
        Airport.objects.all(), label="Куда", empty_label="Любой аэропорт", required=False
    )
    date = forms.DateField(
        label="Дата вылета", required=False, widget=forms.DateInput(attrs={"type": "date"})
    )

    def clean(self):
        data = super().clean()
        if data.get("origin") and data.get("origin") == data.get("destination"):
            raise forms.ValidationError("Выберите разные аэропорты вылета и прилёта.")
        return data


class BookingForm(forms.Form):
    seat = forms.CharField(widget=forms.HiddenInput, error_messages={"required": "Выберите место на схеме салона."})
    first_name = forms.CharField(label="Имя", max_length=100)
    last_name = forms.CharField(label="Фамилия", max_length=100)
    email = forms.EmailField(label="Email")
    passport_number = forms.CharField(label="Номер паспорта", max_length=20)

    def clean_passport_number(self):
        return self.cleaned_data["passport_number"].replace(" ", "").upper()

    def clean_seat(self):
        return self.cleaned_data["seat"].strip().upper()


class LookupForm(forms.Form):
    email = forms.EmailField(label="Email")
    passport_number = forms.CharField(label="Номер паспорта", max_length=20)

    def clean_passport_number(self):
        return self.cleaned_data["passport_number"].replace(" ", "").upper()
