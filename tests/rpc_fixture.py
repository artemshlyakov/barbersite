"""Use an isolated PostgREST/Auth origin for browser UI contract tests."""
import re

RPC_ORIGIN = "https://habib-qa.invalid"
ANON_KEY = "sb_publishable_browser_fixture"


def configure(page, key=ANON_KEY):
    config = (
        f"export const supabaseUrl = '{RPC_ORIGIN}';\n"
        f"export const supabaseAnonKey = '{key}';\n"
    )
    page.route(re.compile(r"/api-config\.js(?:\?.*)?$"), lambda route: route.fulfill(
        content_type="text/javascript", body=config))
