#!/usr/bin/env python3
"""
Focused test: user logs in, makes partial progress, logs out, logs back in.
Expected: they resume where they left off. No duplicate tracker entry.
"""
from playwright.sync_api import sync_playwright
import sys

URL = 'https://cuemath-row.github.io/trial-mastery/'
EMAIL = 'qa-resume-bot@cuemath-test.local'
MOBILE = '0000000001'
NAME = 'QA Resume Bot'

results = []

def log(name, passed, detail=''):
    status = '✓ PASS' if passed else '✗ FAIL'
    results.append((name, passed, detail))
    print(f'{status}  {name}' + (f'  — {detail}' if detail else ''), flush=True)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()
        page.on('dialog', lambda d: d.accept())

        # ── Step 1: Fresh login ──
        print('\n── STEP 1: Fresh login ──', flush=True)
        page.goto(URL)
        page.wait_for_load_state('networkidle')
        page.fill('#login-email', EMAIL)
        page.fill('#login-mobile', MOBILE)
        page.fill('#login-name', NAME)
        page.click('.login-btn')
        page.wait_for_timeout(800)
        log('Login succeeds', page.locator('#module').is_visible())

        # ── Step 2: Ack intro + first 2 sections ──
        print('\n── STEP 2: Make partial progress (intro + A1 + A2) ──', flush=True)
        page.click('#intro-ack-btn')
        page.wait_for_timeout(1200)
        page.locator('#b-a1 .ack-btn.pending').click()
        page.wait_for_timeout(700)
        page.locator('#b-a2 .ack-btn.pending').click()
        page.wait_for_timeout(700)
        progress_before = (page.locator('#progress-label').text_content() or '').strip()
        done_before = page.locator('.step-chip.done').count()
        log('Progress after 2 sections', done_before == 2 and progress_before != '0%',
            f'progress={progress_before}, done={done_before}/23')

        # ── Step 3: Sign out ──
        print('\n── STEP 3: Sign out ──', flush=True)
        page.click('.signout-btn')
        page.wait_for_timeout(500)
        log('Sign out → login screen', page.locator('#login-screen').is_visible())

        # ── Step 4: Log back in with same email ──
        print('\n── STEP 4: Log back in with same email ──', flush=True)
        page.fill('#login-email', EMAIL)
        page.fill('#login-mobile', MOBILE)
        page.fill('#login-name', NAME)
        page.click('.login-btn')
        page.wait_for_timeout(1000)
        log('Re-login succeeds', page.locator('#module').is_visible())

        # ── Step 5: Verify state is restored ──
        print('\n── STEP 5: Verify progress resumed ──', flush=True)
        intro_txt = (page.locator('#intro-ack-btn').text_content() or '').strip()
        intro_restored = '✓' in intro_txt or 'cknowledged' in intro_txt
        log('Intro acknowledgement restored', intro_restored, intro_txt)

        a1_done = page.locator('.sec[data-id="a1"].done').count() == 1
        a2_done = page.locator('.sec[data-id="a2"].done').count() == 1
        log('A1 still marked done', a1_done)
        log('A2 still marked done', a2_done)

        progress_after = (page.locator('#progress-label').text_content() or '').strip()
        done_after = page.locator('.step-chip.done').count()
        log('Stepper ticks preserved', done_after == 2, f'{done_after}/23 (expected 2)')
        log('Progress label preserved', progress_after != '0%', f'progress={progress_after}')

        # Current section should be A3 (the 3rd one now, since A1 and A2 are acked)
        current_sec = page.locator('.sec.current[data-id]').get_attribute('data-id') if page.locator('.sec.current').count() else None
        log('Current section is A3 (resumed)', current_sec == 'a3', f'current={current_sec}')

        browser.close()

    passed = sum(1 for _, p, _ in results if p)
    failed = sum(1 for _, p, _ in results if not p)
    print('\n' + '=' * 60)
    print(f'RESUME TEST: {passed} passed, {failed} failed')
    print('=' * 60)
    if failed > 0:
        print('\nFAILED:')
        for n, p, d in results:
            if not p:
                print(f'  ✗ {n}  {d}')
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
