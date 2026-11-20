"""Check CRM session and calendar UI against local browser fixtures."""
import os
import shutil
from urllib.parse import urljoin

from playwright.sync_api import expect, sync_playwright

from rpc_fixture import ANON_KEY, RPC_ORIGIN, configure


def run(page, base, key):
    configure(page, key)
    access_token = "fixture-access-token"
    actions = []
    state = {"master": False, "refreshes": 0}
    fixture = dict(id=1, client_id=5, name="Тестовый клиент", phone="+12025550179",
                   status="pending", booked_name_ru="Стрижка", booked_price=1000)

    def dispatch(route):
        request = route.request
        headers = request.headers
        assert headers.get("apikey") == (key or None)
        url = request.url
        if "/auth/v1/token?" in url:
            credentials = request.post_data_json
            if "grant_type=refresh_token" in url:
                assert credentials == {"refresh_token": "fixture-refresh"}
                state["refreshes"] += 1
                return route.fulfill(json={"access_token":access_token,"refresh_token":"fixture-refresh",
                                           "token_type":"bearer","expires_in":3600})
            assert credentials["email"] == ("master@example.test" if key else "habib_admin@example.invalid")
            if credentials["password"] == "denied":
                return route.fulfill(status=400, json={"error_code":"invalid_credentials", "msg":"Invalid login credentials"})
            state["master"] = credentials["password"] == "accepted"
            return route.fulfill(json={"access_token":access_token,"refresh_token":"fixture-refresh",
                                       "token_type":"bearer","expires_in":30 if state["master"] else 3600})
        if "/auth/v1/logout" in url:
            return route.fulfill(status=204)
        assert url.endswith("/rest/v1/rpc/habib_admin"), url
        assert headers.get("authorization") == "Bearer " + access_token
        if not state["master"]:
            return route.fulfill(status=403,json={"code":"42501","message":"forbidden"})
        query = request.post_data_json
        action, payload = query["action"], query["payload"]
        actions.append(action)
        if action == "calendar":
            fixture.update(start_at=payload["day"]+"T12:00:00+03:00", end_at=payload["day"]+"T12:30:00+03:00")
            result = [fixture]
        elif action == "days":
            result = []
        elif action == "status":
            assert payload["id"] == fixture["id"]
            fixture["status"] = payload["status"]
            result = {"ok":True}
        elif action == "clients":
            result = [{"name":fixture["name"], "id":fixture["client_id"], "phone":fixture["phone"]}]
        elif action == "history":
            result = [fixture]
        else:
            raise AssertionError(action)
        return route.fulfill(json=result)

    page.route(RPC_ORIGIN+"/**", dispatch)
    page.goto(urljoin(base, "crm/"), wait_until="domcontentloaded")
    email = page.get_by_label("Логин или электронная почта")
    email.fill("master@example.test" if key else "habib_admin")
    password = page.locator('#login input[type="password"]')
    password.fill("denied")
    page.locator("#login button").click()
    expect(page.locator("#notice")).not_to_be_empty()
    expect(page.locator("#workspace")).not_to_be_visible()
    password.fill("valid-but-not-master")
    page.locator("#login button").click()
    expect(page.locator("#notice")).to_contain_text("не имеет доступа")
    expect(page.locator("#workspace")).not_to_be_visible()
    password.fill("accepted")
    page.locator("#login button").click()
    appt = page.locator("#view article").filter(has_text=fixture["name"])
    expect(appt).to_contain_text("Ожидает подтверждения")
    page.locator("#range").click()
    expect(page.locator("#view .group")).to_have_count(7)
    appt.get_by_role("button", name="Открыть запись").click()
    page.locator('select[name=status]').select_option("confirmed")
    page.get_by_role("button", name="Сохранить статус").click()
    expect(appt).to_contain_text("Подтверждена")
    page.get_by_role("button", name="Клиенты", exact=True).click()
    page.locator("#view button").first.click()
    expect(page.locator("#editor")).to_contain_text("Подтверждена")
    page.locator("#close").click()
    page.locator("#logout").click()
    expect(email).to_be_visible()
    expect(page.locator("#view")).to_be_empty()
    assert state["refreshes"] == 1
    assert {"days","calendar","status","clients","history"} <= set(actions)
    print("CRM mock RPC: login rejection, login, day/week, status, client history, logout OK")


if __name__ == "__main__":
    base = os.environ.get("HABIB_PREVIEW_URL","http://localhost:4173/").rstrip("/")+"/"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=shutil.which("chromium"))
        for key in ("", ANON_KEY):
            page = browser.new_page(viewport={"width":390,"height":820}, reduced_motion="reduce")
            run(page, base, key)
            page.close()
        browser.close()
