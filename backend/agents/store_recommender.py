"""Industry-aware competitor store recommendations from tenant-owned data."""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlparse


STOP_WORDS = {
    "und",
    "oder",
    "der",
    "die",
    "das",
    "ein",
    "eine",
    "mit",
    "für",
    "von",
    "shop",
    "store",
    "online",
    "set",
    "pro",
    "standard",
}

INDUSTRY_LABELS = {
    "grow_horticulture": "Grow / Gartenbau",
    "home_living": "Home & Living",
    "electronics": "Elektronik",
    "beauty_health": "Beauty & Gesundheit",
    "sports_outdoor": "Sport & Outdoor",
    "fashion": "Fashion",
    "food_beverage": "Food & Beverage",
    "b2b_industrial": "B2B / Industriebedarf",
    "other": "deiner Branche",
}


@dataclass(frozen=True)
class StoreCandidate:
    name: str
    base_url: str
    industries: tuple[str, ...]
    countries: tuple[str, ...]
    tags: tuple[str, ...]
    profile: str


STORE_DIRECTORY = (
    StoreCandidate("Growmart", "https://www.growmart.de", ("grow_horticulture",), ("DE", "AT"), ("grow", "zelt", "led", "substrat", "dünger", "hydroponik", "lüfter"), "Spezialisierter Grow- und Gartenbau-Shop"),
    StoreCandidate("Growland", "https://www.growland.net", ("grow_horticulture",), ("DE", "AT"), ("grow", "lampe", "led", "erde", "dünger", "bewässerung", "hydro"), "Breites Sortiment für Indoor-Gartenbau"),
    StoreCandidate("Pflanzburg", "https://www.pflanzburg.de", ("grow_horticulture",), ("DE",), ("pflanze", "substrat", "dünger", "zubehör", "grow", "garten"), "Gartenbau- und Pflanzenbedarf mit DACH-Fokus"),
    StoreCandidate("Baldur Garten", "https://www.baldur-garten.de", ("grow_horticulture", "home_living"), ("DE", "AT"), ("pflanze", "garten", "samen", "erde", "dünger", "outdoor"), "Etablierter Garten- und Pflanzenversender"),
    StoreCandidate("Westwing", "https://www.westwing.de", ("home_living",), ("DE", "AT"), ("möbel", "sofa", "stuhl", "tisch", "deko", "lampe", "teppich"), "Home-&-Living-Shop mit starkem Markenmix"),
    StoreCandidate("Home24", "https://www.home24.de", ("home_living",), ("DE", "AT", "CH"), ("möbel", "bett", "schrank", "sofa", "stuhl", "tisch", "lampe"), "Großer Möbel- und Einrichtungshändler"),
    StoreCandidate("Connox", "https://www.connox.de", ("home_living",), ("DE", "AT"), ("design", "möbel", "leuchte", "lampe", "deko", "küche"), "Design-orientierter Wohn- und Lifestyle-Shop"),
    StoreCandidate("Cyberport", "https://www.cyberport.de", ("electronics",), ("DE", "AT"), ("notebook", "laptop", "monitor", "smartphone", "tablet", "kamera", "zubehör"), "Elektronik- und IT-Händler mit breitem Katalog"),
    StoreCandidate("Alternate", "https://www.alternate.de", ("electronics",), ("DE",), ("pc", "hardware", "grafikkarte", "monitor", "laptop", "gaming", "komponente"), "Hardware- und Elektronik-Shop mit Preisfokus"),
    StoreCandidate("Notebooksbilliger", "https://www.notebooksbilliger.de", ("electronics",), ("DE",), ("notebook", "laptop", "tablet", "monitor", "pc", "smartphone"), "Elektronik-Shop mit starken Notebook- und IT-Kategorien"),
    StoreCandidate("Flaconi", "https://www.flaconi.de", ("beauty_health",), ("DE", "AT"), ("parfum", "pflege", "kosmetik", "haut", "makeup", "haare"), "Beauty-Händler mit großem Markenportfolio"),
    StoreCandidate("Douglas", "https://www.douglas.de", ("beauty_health",), ("DE", "AT", "CH"), ("parfum", "beauty", "kosmetik", "pflege", "makeup", "haare"), "Beauty-Marktplatz und Filialist"),
    StoreCandidate("Shop Apotheke", "https://www.shop-apotheke.com", ("beauty_health",), ("DE", "AT"), ("gesundheit", "pflege", "vitamin", "apotheke", "supplement"), "Gesundheit, Pflege und OTC-Produkte"),
    StoreCandidate("SportScheck", "https://www.sportscheck.com", ("sports_outdoor",), ("DE", "AT"), ("sport", "schuh", "jacke", "outdoor", "fitness", "running"), "Sport- und Outdoor-Sortiment mit Markenartikeln"),
    StoreCandidate("Bergfreunde", "https://www.bergfreunde.de", ("sports_outdoor", "fashion"), ("DE", "AT", "CH"), ("outdoor", "schuh", "jacke", "rucksack", "klettern", "wandern"), "Outdoor-Spezialist für Ausrüstung und Bekleidung"),
    StoreCandidate("Bike24", "https://www.bike24.de", ("sports_outdoor",), ("DE", "AT"), ("bike", "fahrrad", "helm", "schuh", "trikot", "komponente"), "Fahrrad- und Ausdauersport-Shop"),
    StoreCandidate("About You", "https://www.aboutyou.de", ("fashion",), ("DE", "AT", "CH"), ("mode", "schuh", "sneaker", "jacke", "hose", "kleid", "shirt"), "Fashion-Marktplatz mit breiter Markenabdeckung"),
    StoreCandidate("Zalando", "https://www.zalando.de", ("fashion", "sports_outdoor"), ("DE", "AT", "CH"), ("mode", "schuh", "sneaker", "jacke", "hose", "sport"), "Großer Fashion- und Lifestyle-Marktplatz"),
    StoreCandidate("Breuninger", "https://www.breuninger.com", ("fashion",), ("DE", "AT", "CH"), ("mode", "premium", "schuh", "tasche", "jacke", "kleid"), "Premium-Fashion und Lifestyle"),
    StoreCandidate("Gourmondo", "https://www.gourmondo.de", ("food_beverage",), ("DE",), ("kaffee", "tee", "wein", "feinkost", "gewürz", "schokolade"), "Feinkost- und Lebensmittelversand"),
    StoreCandidate("MyTime", "https://www.mytime.de", ("food_beverage",), ("DE",), ("lebensmittel", "getränk", "bio", "kaffee", "snack", "haushalt"), "Online-Supermarkt mit breitem Sortiment"),
    StoreCandidate("Mitte Meer", "https://www.mitte-meer.de", ("food_beverage",), ("DE",), ("feinkost", "wein", "öl", "pasta", "spanien", "italien"), "Mediterrane Lebensmittel und Feinkost"),
    StoreCandidate("Contorion", "https://www.contorion.de", ("b2b_industrial",), ("DE", "AT"), ("werkzeug", "maschine", "arbeitsschutz", "schraube", "industrie", "betrieb"), "B2B-Shop für Werkzeug und Industriebedarf"),
    StoreCandidate("Toolineo", "https://www.toolineo.de", ("b2b_industrial",), ("DE",), ("werkzeug", "maschine", "bohrer", "schraube", "handwerk", "betrieb"), "Werkzeug-Marktplatz für Handwerk und B2B"),
    StoreCandidate("Kaiserkraft", "https://www.kaiserkraft.de", ("b2b_industrial",), ("DE", "AT", "CH"), ("betrieb", "lager", "transport", "büro", "industrie", "regal"), "Betriebs-, Lager- und Büroausstattung"),
)


def _host(value: str | None) -> str:
    if not value:
        return ""
    candidate = value.strip()
    if "://" not in candidate:
        candidate = f"https://{candidate}"
    parsed = urlparse(candidate)
    return (parsed.hostname or "").lower().removeprefix("www.").rstrip(".")


def _tokens(values: list[str]) -> set[str]:
    raw = " ".join(values).casefold()
    return {
        token
        for token in re.findall(r"[a-zäöüß0-9]{3,}", raw)
        if token not in STOP_WORDS
    }


def recommend_stores(
    *,
    tenant: dict,
    products: list[dict],
    competitors: list[dict],
    limit: int = 8,
) -> list[dict]:
    industry = tenant.get("industry") or "other"
    country = tenant.get("headquarters_country") or "DE"
    product_tokens = _tokens([str(product.get("name") or "") for product in products])
    existing_hosts = {_host(tenant.get("shop_url"))}
    existing_hosts.update(_host(str(competitor.get("base_url") or "")) for competitor in competitors)
    existing_hosts.discard("")

    recommendations: list[dict] = []
    for candidate in STORE_DIRECTORY:
        candidate_host = _host(candidate.base_url)
        if candidate_host in existing_hosts:
            continue
        matching_tags = sorted(product_tokens.intersection(candidate.tags))
        industry_match = industry in candidate.industries
        country_match = country in candidate.countries or "EU" in candidate.countries
        score = 25
        if industry_match:
            score += 38
        elif industry == "other":
            score += 12
        if country_match:
            score += 12
        score += min(25, len(matching_tags) * 7)

        reasons = []
        if industry_match:
            reasons.append(f"passt zur Branche {INDUSTRY_LABELS.get(industry, industry)}")
        elif industry == "other":
            reasons.append("breit genug für eine manuelle Prüfung")
        if country_match:
            reasons.append(f"liefert Marktbezug für {country}")
        if matching_tags:
            reasons.append("Produktbezug: " + ", ".join(matching_tags[:4]))
        if not reasons:
            reasons.append(candidate.profile)

        recommendations.append(
            {
                "shop_name": candidate.name,
                "base_url": candidate.base_url,
                "host": candidate_host,
                "industry": candidate.industries[0],
                "profile": candidate.profile,
                "confidence": round(min(0.98, score / 100), 2),
                "matching_terms": matching_tags[:6],
                "reasons": reasons[:3],
            }
        )

    return sorted(recommendations, key=lambda item: item["confidence"], reverse=True)[:limit]
