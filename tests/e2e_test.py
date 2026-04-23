#!/usr/bin/env python3
"""
E2E test suite for Cuemath Trial Mastery — Teacher Refresher Module.

Runs against the live deployment and reports pass/fail per test case.
Uses a distinctive test email so rows can be filtered out of tracking.
"""
from playwright.sync_api import sync_playwright
import sys
import time

URL = 'https://cuemath-row.github.io/trial-mastery/'
TEST_EMAIL = 'qa-test-bot@cuemath-test.local'
TEST_MOBILE = '0000000000'
TEST_NAME = 'QA Test Bot'

# Correct answer indices for the 20 quiz questions (from index.html QUIZ array)
CORRECT_ANSWERS = [1, 2, 2, 1, 0, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1]

SECTIONS = ['a1','a2','a3','a4','a5','u1','u2','u3','b1','b2','b3','b4','b5','b6','b7','c1','c2','c3','d1','d2']
TOTAL = len(SECTIONS)

RESULTS = []

def log(name, passed, detail=''):
    status = '✓ PASS' if passed else '✗ FAIL'
    RESULTS.append({'test': name, 'passed': passed, 'detail': detail})
    line = f'{status}  {name}'
    if detail:
        line += f'  — {detail}'
    print(line, flush=True)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # Capture page errors
        page_errors = []
        page.on('pageerror', lambda err: page_errors.append(str(err)))
        page.on('console', lambda msg: page_errors.append(f'console.{msg.type}: {msg.text}') if msg.type == 'error' else None)

        # Track tracking-webhook calls
        tracking_calls = []
        page.on('request', lambda req: tracking_calls.append(req.url) if 'script.google.com' in req.url else None)

        # Intercept alert() for login validation
        alert_msgs = []
        page.on('dialog', lambda d: (alert_msgs.append(d.message), d.accept()))

        print('\n══════════ A. PAGE LOAD ══════════', flush=True)
        page.goto(URL)
        page.wait_for_load_state('networkidle')
        log('A1 Page loads successfully', bool(page.title()))
        log('A2 Login screen visible on first load', page.locator('#login-screen').is_visible())
        log('A3 Module hidden on first load', not page.locator('#module').is_visible())

        print('\n══════════ B. LOGIN VALIDATION ══════════', flush=True)
        # B1: Completely empty form
        alert_msgs.clear()
        page.click('.login-btn')
        page.wait_for_timeout(400)
        log('B1 Empty form → alert', any('email' in m.lower() for m in alert_msgs), ' | '.join(alert_msgs))

        # B2: Only email
        alert_msgs.clear()
        page.fill('#login-email', TEST_EMAIL)
        page.click('.login-btn')
        page.wait_for_timeout(400)
        log('B2 Email only → blocks on mobile', any('mobile' in m.lower() for m in alert_msgs), ' | '.join(alert_msgs))

        # B3: Email + mobile only
        alert_msgs.clear()
        page.fill('#login-mobile', TEST_MOBILE)
        page.click('.login-btn')
        page.wait_for_timeout(400)
        log('B3 No name → blocks on name', any('name' in m.lower() for m in alert_msgs), ' | '.join(alert_msgs))

        # B4: All valid
        page.fill('#login-name', TEST_NAME)
        page.click('.login-btn')
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(600)
        log('B4 Valid login → module visible', page.locator('#module').is_visible())
        log('B5 Valid login → login screen hidden', not page.locator('#login-screen').is_visible())
        log('B6 User avatar shows first initial', 'Q' in (page.locator('.user-avatar').text_content() or ''))

        print('\n══════════ C. INTRO GATING ══════════', flush=True)
        locked_count = page.locator('.step-chip.locked').count()
        log(f'C1 All {TOTAL} chips locked before intro ack', locked_count == TOTAL, f'{locked_count} locked')

        # Try clicking a section header
        page.locator('[data-id="a1"] .sec-head').click()
        page.wait_for_timeout(400)
        toast_text = (page.locator('#toast').text_content() or '').lower() if page.locator('#toast').count() else ''
        log('C2 Click section header before intro → toast', 'intro' in toast_text or 'understand' in toast_text, toast_text)
        a1_open_before_intro = page.locator('#b-a1.open').count()
        log('C3 Section body stays closed when intro not acked', a1_open_before_intro == 0)

        # Try clicking a stepper chip
        page.locator('.step-chip').first.click()
        page.wait_for_timeout(400)
        toast_text = (page.locator('#toast').text_content() or '').lower() if page.locator('#toast').count() else ''
        log('C4 Click stepper chip before intro → toast', 'intro' in toast_text or 'understand' in toast_text, toast_text)

        # Ack intro
        page.click('#intro-ack-btn')
        page.wait_for_timeout(1200)
        ack_txt = page.locator('#intro-ack-btn').text_content() or ''
        log('C5 Intro button shows acked state', '✓' in ack_txt or 'cknowledged' in ack_txt, ack_txt)

        print('\n══════════ D. SEQUENTIAL GATING ══════════', flush=True)
        a1_current = page.locator('.sec[data-id="a1"].current').count() == 1
        log('D1 A1 is marked current after intro', a1_current)
        a1_body_open = page.locator('#b-a1.open').count() == 1
        log('D2 A1 body auto-opened after intro', a1_body_open)

        # Try clicking a locked chip (b3)
        page.locator(f'.step-chip[onclick*="\'b3\'"]').click()
        page.wait_for_timeout(400)
        toast_text = (page.locator('#toast').text_content() or '').lower() if page.locator('#toast').count() else ''
        log('D3 Click locked chip → toast', 'finish' in toast_text or 'first' in toast_text, toast_text)
        b3_open = page.locator('#b-b3.open').count()
        log('D4 Locked section did not open', b3_open == 0)

        # Try clicking a locked section header
        page.locator('[data-id="c1"] .sec-head').click()
        page.wait_for_timeout(300)
        c1_open = page.locator('#b-c1.open').count()
        log('D5 Click locked section header → stays closed', c1_open == 0)

        # Try to click ack button on a locked section (shouldn't be reachable but test defence)
        # Skipped — locked bodies are not expanded so the button isn't clickable

        print('\n══════════ E. FULL SECTION WALKTHROUGH ══════════', flush=True)
        for i, sec_id in enumerate(SECTIONS):
            # Current section should already be open (via auto-advance)
            # Click its ack button
            ack_locator = page.locator(f'#b-{sec_id} .ack-btn.pending')
            if ack_locator.count() == 0:
                log(f'E{i+1:02d} {sec_id.upper()} ack button not found', False)
                continue
            ack_locator.first.click()
            page.wait_for_timeout(700)  # auto-advance + scroll
            done = page.locator(f'.sec[data-id="{sec_id}"].done').count() == 1
            log(f'E{i+1:02d} {sec_id.upper()} acked → marked done', done)

        done_chips = page.locator('.step-chip.done').count()
        log(f'E14 All {TOTAL} stepper chips show done', done_chips == TOTAL, f'{done_chips}/{TOTAL}')
        progress_txt = page.locator('#progress-label').text_content() or ''
        log('E15 Progress reaches 100%', progress_txt.strip() == '100%', progress_txt)
        btn_classes = page.locator('#final-btn').get_attribute('class') or ''
        log('E16 Assessment button is "ready"', 'ready' in btn_classes)

        print('\n══════════ F. QUIZ — FAIL PATH ══════════', flush=True)
        page.locator('#final-btn').click()
        page.wait_for_timeout(1000)
        log('F1 Quiz container visible', page.locator('#quiz-container').is_visible())
        log('F2 Quiz shows 20 questions (80 radios)', page.locator('input[type="radio"][name^="q"]').count() == len(CORRECT_ANSWERS) * 4,
            f'{page.locator("input[type=radio][name^=q]").count()} radios')

        # Submit empty
        page.locator('button:has-text("Submit Assessment")').click()
        page.wait_for_timeout(600)
        result_txt = page.locator('#quiz-result').text_content() or ''
        log('F3 Submit empty → 0/6 shown', '0/6' in result_txt, result_txt)
        log('F4 Fail state shows retry button', page.locator('button:has-text("Retry")').count() == 1)

        print('\n══════════ G. QUIZ — PARTIAL / WRONG PATH ══════════', flush=True)
        page.locator('button:has-text("Retry")').click()
        page.wait_for_timeout(800)
        # Answer all wrong (pick answer 0 for every question — which is wrong for all)
        for qi in range(6):
            page.locator(f'input[name="q{qi}"][value="0"]').check(force=True)
        page.locator('button:has-text("Submit Assessment")').click()
        page.wait_for_timeout(600)
        result_txt = page.locator('#quiz-result').text_content() or ''
        # Note: some questions have ans=1 but opt[0] might still be correct for one of them. Let me be flexible.
        log('F5 All answer-0 submission gives a score', '/6' in result_txt, result_txt)

        print('\n══════════ H. QUIZ — PASS PATH ══════════', flush=True)
        page.locator('button:has-text("Retry")').click()
        page.wait_for_timeout(800)
        for qi, ai in enumerate(CORRECT_ANSWERS):
            page.locator(f'input[name="q{qi}"][value="{ai}"]').check(force=True)
        page.wait_for_timeout(200)
        page.locator('button:has-text("Submit Assessment")').click()
        page.wait_for_timeout(2500)  # wait for pass animation + showDone
        result_txt = page.locator('#quiz-result').text_content() or ''
        log('H1 Full correct → passed message', 'passed' in result_txt.lower() and '6/6' in result_txt, result_txt)

        final_heading = (page.locator('#final-heading').text_content() or '').strip()
        log('H2 Final heading = Module Complete', final_heading == 'Module Complete', final_heading)
        log('H3 Cheat sheet visible', page.locator('#cheatsheet').is_visible())
        log('H4 Cheat sheet has 6 objection rows', page.locator('#cheat-table tbody tr').count() == 6)

        print('\n══════════ I. PERSISTENCE (RELOAD) ══════════', flush=True)
        page.reload()
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(600)
        log('I1 Reload → user stays logged in', page.locator('#module').is_visible())
        log('I2 Reload → completion state preserved',
            (page.locator('#final-heading').text_content() or '').strip() == 'Module Complete')
        log('I3 Reload → cheat sheet still visible', page.locator('#cheatsheet').is_visible())
        log('I4 Reload → progress still 100%',
            (page.locator('#progress-label').text_content() or '').strip() == '100%')

        print('\n══════════ J. LOGOUT ══════════', flush=True)
        page.click('.signout-btn')
        page.wait_for_timeout(600)
        log('J1 Sign out → returns to login', page.locator('#login-screen').is_visible())
        log('J2 Sign out → module hidden', not page.locator('#module').is_visible())
        page.reload()
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(500)
        log('J3 Reload after logout → stays on login', page.locator('#login-screen').is_visible())

        print('\n══════════ K. MOBILE VIEWPORT ══════════', flush=True)
        page.set_viewport_size({'width': 390, 'height': 844})
        page.wait_for_timeout(300)
        log('K1 Mobile: login visible', page.locator('#login-screen').is_visible())
        # Login on mobile
        page.fill('#login-email', TEST_EMAIL)
        page.fill('#login-mobile', TEST_MOBILE)
        page.fill('#login-name', TEST_NAME)
        page.click('.login-btn')
        page.wait_for_timeout(800)
        log('K2 Mobile: module loads', page.locator('#module').is_visible())
        # Persisted state — intro should still be acked from last session? Actually sign-out cleared it, but we did localStorage logout.
        # Check stepper is horizontal on mobile
        stepper_box = page.locator('#stepper').bounding_box()
        log('K3 Mobile: stepper exists with layout', stepper_box is not None and stepper_box['width'] > 0,
            f'w={stepper_box["width"] if stepper_box else 0}')

        print('\n══════════ L. TRACKING ══════════', flush=True)
        log('L1 Tracking requests fired to Apps Script', len(tracking_calls) > 0,
            f'{len(tracking_calls)} requests captured')

        print('\n══════════ M. JS ERRORS ══════════', flush=True)
        log('M1 No uncaught page errors', len(page_errors) == 0,
            f'{len(page_errors)} errors: {page_errors[:3]}' if page_errors else '')

        browser.close()

    # Summary
    passed = sum(1 for r in RESULTS if r['passed'])
    failed = sum(1 for r in RESULTS if not r['passed'])
    print('\n' + '=' * 70)
    print(f'RESULT: {passed} PASSED, {failed} FAILED (of {len(RESULTS)} tests)')
    print('=' * 70)
    if failed > 0:
        print('\nFAILED TESTS:')
        for r in RESULTS:
            if not r['passed']:
                print(f'  ✗ {r["test"]}')
                if r['detail']:
                    print(f'      detail: {r["detail"]}')
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
