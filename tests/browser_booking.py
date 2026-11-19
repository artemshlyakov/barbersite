"""Exercise the RU/EN booking dialog with deterministic API responses.

Run against a local static server using HABIB_PREVIEW_URL; requests are intercepted.
"""
import os
import shutil
from urllib.parse import parse_qs, urljoin, urlparse

from playwright.sync_api import expect, sync_playwright


def run(page, base, language):
    submissions = []
    flags = {"error": True}
    service = dict(id=1, name_ru="Стрижка", name_en="Haircut", active=True,
                   price=1000, minutes=30, description_ru="", description_en="")
    def respond(route):
        request = route.request
        url = urlparse(request.url)
        path = url.path
        if path.endswith("/services"):
            return route.fulfill(json=[service])
        if path.endswith("/slots"):
            day = parse_qs(url.query)["day"][0]
            return route.fulfill(json=[{"starts_at": day + "T13:00:00+03:00"}])
        if path.endswith("/reserve"):
            submissions.append(request.post_data_json)
            if flags["error"]:
                return route.fulfill(status=503, json={"error": "database_unavailable"})
            return route.fulfill(json={"id": 123})
        raise ValueError(path)

    page.route("**/api/**", respond)
    page.goto(urljoin(base, language), wait_until="domcontentloaded")
    expect(page.locator("#booking-prices")).to_contain_text(service["name_en" if language else "name_ru"])
    page.locator("#price [data-booking]").click()
    dialog = page.get_by_role("dialog")
    expect(dialog.locator(".bk-times button")).to_have_count(0)
    dialog.locator('[name="service"]').select_option("1")
    dialog.locator(".bk-times button").first.click()
    dialog.locator('[name="name"]').fill("QA")
    dialog.locator('[name="phone"]').fill("123")
    submit = dialog.locator('button[type="submit"]')
    submit.click()
    expect(dialog.locator('[name="phone"]')).to_be_focused()
    assert not submissions
    dialog.locator('[name="phone"]').fill("+1 202 555 0142")
    submit.click()
    expect(dialog.locator("[data-result]")).to_contain_text("confirm" if language else "не получено")
    expect(dialog.locator("form")).to_be_visible()
    assert len(submissions) == 1
    flags["error"] = False
    submit.click()
    expect(dialog.locator("[data-result]")).to_contain_text("Request received" if language else "Заявка получена")
    assert len(submissions) == 2 and submissions[0] == submissions[1]
    assert submissions[1]["phone"] == "+12025550142" and submissions[1]["token"]
    expect(dialog.locator("form")).not_to_be_visible()
    print(f"{language or 'ru'}: service, date/time, validation, 503 recovery, idempotent retry, confirmed success OK")


def main():
    base = os.environ.get("HABIB_PREVIEW_URL","http://localhost:4173/").rstrip("/") + "/"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=shutil.which("chromium"))
        for language, width in [("", 390), ("en/", 1440)]:
            page = browser.new_page(viewport={"width":width, "height":820}, reduced_motion="reduce")
            run(page, base, language)
            page.close()
        browser.close()


if __name__ == "__main__":
    main()
