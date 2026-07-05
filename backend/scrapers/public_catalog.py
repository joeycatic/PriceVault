"""Public shop catalog discovery from Shopify, sitemaps, and Product JSON-LD."""

import asyncio
import json
import socket
from html.parser import HTMLParser
from ipaddress import ip_address
from urllib.parse import quote_plus, urljoin, urlparse
from xml.etree import ElementTree

import httpx


PRODUCT_PATH_MARKERS = ("/products/", "/product/", "/produkt/", "/p/")


def validate_public_shop_url(value: str) -> str:
    candidate = value.strip()
    if "://" not in candidate:
        candidate = f"https://{candidate}"
    parsed = urlparse(candidate)
    hostname = (parsed.hostname or "").lower()
    if parsed.scheme not in {"http", "https"} or not hostname or parsed.username or parsed.password:
        raise ValueError("Bitte gib eine öffentliche Shop-URL ein")
    if hostname == "localhost" or hostname.endswith((".localhost", ".local", ".internal")):
        raise ValueError("Lokale Shop-Adressen sind nicht erlaubt")
    try:
        address = ip_address(hostname)
    except ValueError:
        pass
    else:
        if not address.is_global:
            raise ValueError("Private Shop-Adressen sind nicht erlaubt")
    path = parsed.path.rstrip("/")
    return parsed._replace(path=path, query="", fragment="").geturl()


async def _assert_public_dns(hostname: str) -> None:
    loop = asyncio.get_running_loop()
    addresses = await loop.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    if not addresses or any(not ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError("Die Shop-Adresse verweist nicht auf ein öffentliches Ziel")


def _host_aliases(hostname: str) -> set[str]:
    bare = hostname.removeprefix("www.")
    return {bare, f"www.{bare}"}


async def _get(client: httpx.AsyncClient, url: str, expected_hosts: set[str]) -> httpx.Response:
    current = url
    for _ in range(5):
        parsed = urlparse(current)
        current_host = parsed.hostname or ""
        if parsed.scheme not in {"http", "https"} or current_host not in expected_hosts:
            raise ValueError("Weiterleitungen auf andere Hosts sind nicht erlaubt")
        await _assert_public_dns(current_host)
        response = await client.get(current, timeout=20)
        if response.status_code not in {301, 302, 303, 307, 308}:
            response.raise_for_status()
            return response
        location = response.headers.get("location")
        if not location:
            response.raise_for_status()
        current = urljoin(current, location)
    raise ValueError("Zu viele Weiterleitungen beim Katalogabruf")


def _number(value: object) -> float | None:
    try:
        return float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return None


def parse_shopify_catalog(payload: dict, base_url: str, limit: int) -> list[dict]:
    products = []
    for item in payload.get("products", [])[:limit]:
        variants = item.get("variants") or []
        first = variants[0] if variants else {}
        title = str(item.get("title") or "").strip()
        handle = str(item.get("handle") or "").strip()
        if not title or not handle:
            continue
        products.append(
            {
                "name": title,
                "url": urljoin(f"{base_url}/", f"products/{handle}"),
                "sku": str(first.get("sku") or "").strip() or None,
                "gtin": str(first.get("barcode") or "").strip() or None,
                "price": _number(first.get("price")),
                "currency": "EUR",
                "source": "shopify",
            }
        )
    return products


class _ProductPageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []
        self.link_titles: list[tuple[str, str]] = []
        self.json_ld: list[str] = []
        self.meta: dict[str, str] = {}
        self._script = False
        self._buffer: list[str] = []
        self._anchor_href: str | None = None
        self._anchor_buffer: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "a" and values.get("href"):
            self.links.append(values["href"] or "")
            self._anchor_href = values["href"] or ""
            self._anchor_buffer = []
        if tag == "meta":
            key = values.get("property") or values.get("name")
            if key and values.get("content"):
                self.meta[key.lower()] = values["content"] or ""
        if tag == "script" and values.get("type", "").lower() == "application/ld+json":
            self._script = True
            self._buffer = []

    def handle_data(self, data: str) -> None:
        if self._script:
            self._buffer.append(data)
        if self._anchor_href is not None:
            self._anchor_buffer.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._script:
            self.json_ld.append("".join(self._buffer))
            self._script = False
        if tag == "a" and self._anchor_href is not None:
            title = " ".join("".join(self._anchor_buffer).split())
            if title:
                self.link_titles.append((self._anchor_href, title))
            self._anchor_href = None
            self._anchor_buffer = []


def _product_nodes(value: object) -> list[dict]:
    if isinstance(value, list):
        return [node for item in value for node in _product_nodes(item)]
    if not isinstance(value, dict):
        return []
    nodes = _product_nodes(value.get("@graph")) if "@graph" in value else []
    kind = value.get("@type")
    kinds = kind if isinstance(kind, list) else [kind]
    if "Product" in kinds:
        nodes.append(value)
    return nodes


def parse_product_page(html: str, url: str) -> dict | None:
    parser = _ProductPageParser()
    parser.feed(html)
    for raw in parser.json_ld:
        try:
            nodes = _product_nodes(json.loads(raw))
        except (json.JSONDecodeError, TypeError):
            continue
        for node in nodes:
            offers = node.get("offers") or {}
            if isinstance(offers, list):
                offers = offers[0] if offers else {}
            name = str(node.get("name") or "").strip()
            if not name:
                continue
            return {
                "name": name,
                "url": url,
                "sku": str(node.get("sku") or "").strip() or None,
                "gtin": str(node.get("gtin13") or node.get("gtin14") or node.get("gtin") or "").strip() or None,
                "price": _number(offers.get("price") or offers.get("lowPrice")),
                "currency": str(offers.get("priceCurrency") or "EUR").upper(),
                "source": "json-ld",
            }
    name = parser.meta.get("og:title", "").strip()
    price = _number(parser.meta.get("product:price:amount"))
    if name and price is not None:
        return {
            "name": name,
            "url": url,
            "sku": None,
            "gtin": None,
            "price": price,
            "currency": parser.meta.get("product:price:currency", "EUR").upper(),
            "source": "open-graph",
        }
    return None


def _sitemap_locations(xml: str) -> list[str]:
    try:
        root = ElementTree.fromstring(xml)
    except ElementTree.ParseError:
        return []
    return [node.text.strip() for node in root.iter() if node.tag.endswith("loc") and node.text]


def _same_host_product_urls(urls: list[str], hosts: set[str], limit: int) -> list[str]:
    seen: set[str] = set()
    result = []
    for url in urls:
        parsed = urlparse(url)
        if parsed.hostname not in hosts or not any(marker in parsed.path.lower() for marker in PRODUCT_PATH_MARKERS):
            continue
        clean = parsed._replace(query="", fragment="").geturl()
        if clean not in seen:
            seen.add(clean)
            result.append(clean)
        if len(result) >= limit:
            break
    return result


async def search_public_shop(base_url: str, query: str) -> list[tuple[str, str]]:
    """Search common storefront endpoints and return titled, same-host links."""
    normalized = validate_public_shop_url(base_url)
    host = urlparse(normalized).hostname or ""
    hosts = _host_aliases(host)
    encoded = quote_plus(query)
    search_urls = [
        f"{normalized}/search/?qs={encoded}",
        f"{normalized}/search?q={encoded}",
        f"{normalized}/?suche={encoded}",
        f"{normalized}/?s={encoded}",
    ]
    found: dict[str, str] = {}
    async with httpx.AsyncClient(headers={"User-Agent": "PriceVault Product Matcher/1.0"}) as client:
        for search_url in search_urls:
            try:
                response = await _get(client, search_url, hosts)
            except (httpx.HTTPError, ValueError):
                continue
            parser = _ProductPageParser()
            parser.feed(response.text)
            for href, title in parser.link_titles:
                candidate = urljoin(f"{normalized}/", href)
                parsed = urlparse(candidate)
                if parsed.scheme not in {"http", "https"} or parsed.hostname not in hosts:
                    continue
                if parsed.path in {"", "/"} or parsed.path.startswith(("/search", "/suche")):
                    continue
                clean = parsed._replace(query="", fragment="").geturl()
                found.setdefault(clean, title)
    return list(found.items())


async def discover_public_catalog(base_url: str, max_products: int) -> list[dict]:
    normalized = validate_public_shop_url(base_url)
    parsed = urlparse(normalized)
    host = parsed.hostname or ""
    hosts = _host_aliases(host)
    async with httpx.AsyncClient(headers={"User-Agent": "PriceVault Catalog Discovery/1.0"}) as client:
        try:
            response = await _get(client, f"{normalized}/products.json?limit={max_products}", hosts)
            products = parse_shopify_catalog(response.json(), normalized, max_products)
            if products:
                return products
        except (httpx.HTTPError, ValueError, json.JSONDecodeError):
            pass

        candidate_urls: list[str] = []
        try:
            sitemap = await _get(client, f"{normalized}/sitemap.xml", hosts)
            locations = _sitemap_locations(sitemap.text)
            candidate_urls = _same_host_product_urls(locations, hosts, max_products)
            if not candidate_urls:
                child_maps = [url for url in locations if urlparse(url).hostname in hosts][:10]
                child_responses = await asyncio.gather(
                    *(_get(client, url, hosts) for url in child_maps), return_exceptions=True
                )
                child_urls = [
                    location
                    for item in child_responses
                    if isinstance(item, httpx.Response)
                    for location in _sitemap_locations(item.text)
                ]
                candidate_urls = _same_host_product_urls(child_urls, hosts, max_products)
        except (httpx.HTTPError, ValueError):
            pass

        if not candidate_urls:
            response = await _get(client, normalized, hosts)
            parser = _ProductPageParser()
            parser.feed(response.text)
            candidate_urls = _same_host_product_urls(
                [urljoin(f"{normalized}/", link) for link in parser.links], hosts, max_products
            )

        pages = await asyncio.gather(
            *(_get(client, url, hosts) for url in candidate_urls), return_exceptions=True
        )
        products = []
        for url, response in zip(candidate_urls, pages, strict=True):
            if isinstance(response, httpx.Response):
                product = parse_product_page(response.text, url)
                if product:
                    products.append(product)
        return products[:max_products]
