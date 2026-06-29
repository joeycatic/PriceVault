"""DACH and Swiss price normalization."""

import re


_NUMBER_PATTERN = re.compile(r"-?\d[\d.,]*(?:\d)?")


def parse_price(raw: str) -> float:
    """Normalize a localized price string to a float.

    German formatting uses a comma decimal separator and periods for grouping.
    Swiss formatting commonly uses a period decimal separator.
    """
    if not raw or not raw.strip():
        raise ValueError("Price text is empty")

    match = _NUMBER_PATTERN.search(raw.replace("\u00a0", " "))
    if not match:
        raise ValueError(f"No numeric price found in {raw!r}")

    token = match.group(0)
    sign = "-" if token.startswith("-") else ""
    token = token.lstrip("-")

    if "," in token and "." in token:
        decimal_separator = "," if token.rfind(",") > token.rfind(".") else "."
        grouping_separator = "." if decimal_separator == "," else ","
        normalized = token.replace(grouping_separator, "").replace(decimal_separator, ".")
    elif "," in token:
        head, tail = token.rsplit(",", 1)
        normalized = (
            token.replace(",", "")
            if len(tail) == 3 and head.replace(",", "").isdigit()
            else head.replace(",", "") + "." + tail
        )
    elif "." in token:
        head, tail = token.rsplit(".", 1)
        normalized = (
            token.replace(".", "")
            if len(tail) == 3 and head.replace(".", "").isdigit()
            else head.replace(".", "") + "." + tail
        )
    else:
        normalized = token

    try:
        return float(sign + normalized)
    except ValueError as exc:
        raise ValueError(f"Invalid price format: {raw!r}") from exc


if __name__ == "__main__":
    examples = {
        "€ 12,99": 12.99,
        "12.999,00 €": 12999.0,
        "CHF 45.90": 45.90,
        "ab 9,99 €": 9.99,
        "Preis: 19,95": 19.95,
    }
    for value, expected in examples.items():
        assert parse_price(value) == expected
    print("price parser checks passed")

