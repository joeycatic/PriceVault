from agents.alert_agent import AlertAgent, is_map_violation
from agents.repricing_agent import calculate_suggested_price, scoped_competitor_prices
from routers.benchmark import classify_position, compute_rank
from security.crypto import sign_webhook_payload


def test_stay_above_percent_prices_above_lowest():
    suggested, floor = calculate_suggested_price(
        lowest_competitor_price=100.0,
        cost_price=50.0,
        strategy="stay_above_percent",
        beat_by_pct=3.0,
        min_margin_pct=20.0,
    )
    assert suggested == 103.0
    assert floor == 60.0


def test_stay_above_percent_respects_margin_floor():
    suggested, _ = calculate_suggested_price(
        lowest_competitor_price=10.0,
        cost_price=50.0,
        strategy="stay_above_percent",
        beat_by_pct=3.0,
        min_margin_pct=20.0,
    )
    assert suggested == 60.0


def test_scoped_competitor_prices_filters_by_rule_scope():
    rows = [
        {"competitor_id": "a", "competitor_price": 10.0},
        {"competitor_id": "b", "competitor_price": 8.0},
        {"competitor_id": "c", "competitor_price": None},
    ]
    assert scoped_competitor_prices(rows, ["a"]) == [10.0]
    assert scoped_competitor_prices(rows, None) == [10.0, 8.0]
    assert scoped_competitor_prices(rows, ["missing"]) == []


def test_sale_started_triggers_on_transition_to_sale():
    alert = {"condition": "sale_started"}
    row = {"price_type": "sale", "previous_price_type": "regular"}
    assert AlertAgent.evaluate(alert, row) is True


def test_sale_started_ignores_ongoing_sale():
    alert = {"condition": "sale_started"}
    row = {"price_type": "sale", "previous_price_type": "sale"}
    assert AlertAgent.evaluate(alert, row) is False


def test_sale_ended_triggers_on_transition_back():
    alert = {"condition": "sale_ended"}
    row = {"price_type": "regular", "previous_price_type": "sale"}
    assert AlertAgent.evaluate(alert, row) is True


def test_sale_started_ignores_unknown_previous():
    alert = {"condition": "sale_started"}
    row = {"price_type": "sale", "previous_price_type": None}
    assert AlertAgent.evaluate(alert, row) is False


def test_map_violation_below_map():
    assert is_map_violation(map_price=49.99, advertised_price=44.90) is True


def test_map_violation_at_or_above_map():
    assert is_map_violation(map_price=49.99, advertised_price=49.99) is False


def test_map_violation_missing_data():
    assert is_map_violation(map_price=None, advertised_price=44.90) is False
    assert is_map_violation(map_price=49.99, advertised_price=None) is False


def test_webhook_signature_is_deterministic_hmac():
    sig = sign_webhook_payload("secret", "1720000000", b'{"a":1}')
    assert sig == sign_webhook_payload("secret", "1720000000", b'{"a":1}')
    assert sig != sign_webhook_payload("other", "1720000000", b'{"a":1}')
    assert len(sig) == 64


def test_rank_counts_cheaper_competitors():
    assert compute_rank(our_price=19.99, competitor_prices=[18.5, 21.0, 24.0]) == (2, 4)


def test_cheapest_position():
    assert classify_position(our_price=17.0, lowest=18.5) == "cheapest"


def test_within_5_pct():
    assert classify_position(our_price=19.0, lowest=18.5) == "within_5_pct"


def test_most_expensive_when_above_all():
    assert classify_position(our_price=25.0, lowest=18.5) == "most_expensive"
