"""Check browser layout on a running preview, using local Chromium and Playwright.

Run HABIB_PREVIEW_URL=http://localhost:4173 python tests/browser_layout.py.
Public and CRM navigation only. Does not submit any forms.
"""
import os
import shutil
from urllib.parse import urljoin

from playwright.sync_api import expect, sync_playwright


def check_fits(page, selector):
    bounds = page.locator(selector).evaluate(
        """element => ({
          content: element.scrollWidth,
          visible: element.clientWidth,
          viewport: window.innerWidth,
          left: element.getBoundingClientRect().left,
          right: element.getBoundingClientRect().right
        })"""
    )
    assert bounds["content"] <= bounds["visible"] + 2, (selector, bounds)
    assert bounds["left"] >= -1 and bounds["right"] <= bounds["viewport"] + 1, (selector, bounds)


def main():
    base = os.environ.get("HABIB_PREVIEW_URL", "http://localhost:4173/").rstrip("/") + "/"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=shutil.which("chromium"))
        page = browser.new_page(reduced_motion="reduce")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        for width in (320, 360, 390, 768, 1440):
            page.set_viewport_size({"width": width, "height": 740})
            for path in ("", "en/"):
                page.goto(urljoin(base, path), wait_until="domcontentloaded")
                button = page.locator("#price [data-booking]")
                button.click()
                dialog = page.get_by_role("dialog")
                expect(dialog).to_be_visible()
                check_fits(page, "html")
                check_fits(page, "dialog[open]")
                page.keyboard.press("Escape")
                expect(dialog).not_to_be_visible()
                expect(button).to_be_focused()
            page.goto(urljoin(base, "crm/"), wait_until="domcontentloaded")
            expect(page.locator('input[type="password"]')).to_be_visible()
            check_fits(page, "html")
            print(f"{width}px: RU/EN price dialog, Escape, focus return, CRM sign-in OK")
        assert not errors, errors
        browser.close()


if __name__ == "__main__":
    main()
