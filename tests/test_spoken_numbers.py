import pytest

from backend.services.clinical_negation import evaluate_fever_status
from backend.services.local_extractor import extract_clinical_facts
from backend.services.spoken_numbers import spoken_numbers_to_digits

# Same cases as apps/web/lib/spoken-numbers.test.ts — the two readers must agree.
CASES = [
    ("ANC four twenty", "ANC 420"),
    ("platelets eighty eight thousand", "platelets 88000"),
    ("WBC one point eight", "WBC 1.8"),
    ("temp one oh one point three", "temp 101.3"),
    ("ANC zero point four", "ANC 0.4"),
    ("one hundred and twenty", "120"),
    ("twelve fifty", "1250"),
    ("four two zero", "420"),
    ("twenty-five", "25"),
    ("Oh well, ANC 1500", "Oh well, ANC 1500"),
    ("the point is", "the point is"),
]


@pytest.mark.parametrize("text,expected", CASES)
def test_spoken_numbers_to_digits(text, expected):
    assert spoken_numbers_to_digits(text) == expected


def test_local_extractor_reads_spoken_labs():
    facts = extract_clinical_facts(
        "ANC four twenty, platelets eighty eight thousand, hemoglobin nine point two."
    )
    labs = {lab.name: lab.value for lab in facts.labs}
    assert labs["ANC"] == 420
    assert labs["PLATELETS"] == 88000
    assert labs["HEMOGLOBIN"] == 9.2


def test_fever_status_reads_spoken_temperature():
    assert evaluate_fever_status("temp one oh one point three")["active_fever"] is True
