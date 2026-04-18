#!/usr/bin/env python3
"""
Comprehensive QA suite for Cuemath Trial Mastery.

Covers:
  - Functional regression (login, gating, full walkthrough, quiz paths, persistence)
  - Continue / Start Fresh modal flow (in-progress, completed, fresh-user states)
  - Integration (session_id in every tracking call, reset event fires, unique sessions)
  - Stress (rapid clicks, multiple logout/login cycles, large inputs)
  - Security & edge (XSS in inputs, localStorage tamper, special chars)

Designed to be re-run safely. Uses distinctive test emails so sheet rows are
easy to identify and delete.
"""
from playwright.sync_api import sync_playwright
import sys
import json
import time

URL = 'https://cuemath-row.github.io/trial-mastery/'

# Unique emails per run to avoid localStorage carry-over in fresh browser contexts.
RUN_ID = int(time.time())
def mk_email(tag): return f'qa-{tag}-{RUN_ID}@cuemath-test.local'

SECTIONS = ['a1','a2','b1','b2','b3','b4','b5','b6','c1','c2','c3','d1','d2']
CORRECT = [1, 2, 2, 2, 1, 1]

RESULTS = []
def log(name, passed, detail=''):
    status = '✓' if passed else '✗'
    RESULTS.append({'name': name, 'passed': passed, 'detail': detail})
    line = f'  {status} {name}'
    if detail:
        line += f'  — {detail}'
    print(line, flush=True)


def section(title):
    print(f'\n═══ {title} ═══', flush=True)


def new_context(browser, viewport=None):
    ctx = browser.new_context(viewport=viewport or {'width': 1280, 'height': 800})
    page = ctx.new_page()
    page.on('dialog', lambda d: d.accept())
    return ctx, page


def do_login(page, email, name='QA Bot', mobile='0000000000'):
    """Fill login form and click Continue."""
    page.fill('#login-email', email)
    page.fill('#login-mobile', mobile)
    page.fill('#login-name', name)
    page.click('.login-btn')
    page.wait_for_timeout(800)


def ack_intro(page):
    page.click('#intro-ack-btn')
    page.wait_for_timeout(1000)


def ack_section(page, sec_id):
    page.locator(f'#b-{sec_id} .ack-btn.pending').first.click()
    page.wait_for_timeout(600)


# ═══════════════════════════════════════════════════════════════════
# TEST 1: Functional regression — full happy path
# ═══════════════════════════════════════════════════════════════════
def test_functional_regression(browser):
    section('1. FUNCTIONAL REGRESSION — full happy path')
    ctx, page = new_context(browser)
    try:
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))

        page.goto(URL)
        page.wait_for_load_state('networkidle')
        log('Page loads, login visible', page.locator('#login-screen').is_visible())

        do_login(page, mk_email('fn'), name='Full Nick')
        log('Login → module', page.locator('#module').is_visible())

        # No modal on fresh login (no prior progress)
        log('Fresh user: NO resume modal', not page.locator('#resume-overlay.show').is_visible())

        # Walk through
        ack_intro(page)
        log('Intro acked', 'cknowledged' in (page.locator('#intro-ack-btn').text_content() or ''))
        for s in SECTIONS:
            ack_section(page, s)
        log('All 13 sections acked', page.locator('.step-chip.done').count() == 13)

        # Quiz — pass path
        page.locator('#final-btn').click()
        page.wait_for_timeout(800)
        for qi, ai in enumerate(CORRECT):
            page.locator(f'input[name="q{qi}"][value="{ai}"]').check(force=True)
        page.locator('button:has-text("Submit Assessment")').click()
        page.wait_for_timeout(2500)
        log('Quiz pass → Module Complete',
            (page.locator('#final-heading').text_content() or '').strip() == 'Module Complete')
        log('Cheat sheet visible', page.locator('#cheatsheet').is_visible())
        log('No page errors', len(errors) == 0, f'{errors[:2]}' if errors else '')
    finally:
        ctx.close()


# ═══════════════════════════════════════════════════════════════════
# TEST 2: Login validation edge cases
# ═══════════════════════════════════════════════════════════════════
def test_login_validation(browser):
    section('2. LOGIN VALIDATION')
    ctx, page = new_context(browser)
    try:
        alerts = []
        page.on('dialog', lambda d: (alerts.append(d.message), d.accept()))

        page.goto(URL)
        page.wait_for_load_state('networkidle')

        # Whitespace-only fields (should be blocked via .trim())
        alerts.clear()
        page.fill('#login-email', '   ')
        page.fill('#login-mobile', '   ')
        page.fill('#login-name', '   ')
        page.click('.login-btn')
        page.wait_for_timeout(300)
        log('Whitespace-only fields blocked', len(alerts) > 0, ' | '.join(alerts[:1]))

        # Very long email
        alerts.clear()
        long_email = 'a' * 300 + '@cuemath-test.local'
        page.fill('#login-email', long_email)
        page.fill('#login-mobile', '1234567890')
        page.fill('#login-name', 'Long Email User')
        page.click('.login-btn')
        page.wait_for_timeout(600)
        log('Very long email (300+ chars) accepted', page.locator('#module').is_visible())
    finally:
        ctx.close()


# ═══════════════════════════════════════════════════════════════════
# TEST 3: Continue / Start Fresh modal — in-progress user
# ═══════════════════════════════════════════════════════════════════
def test_modal_in_progress(browser):
    section('3. RESUME MODAL — in-progress user')
    ctx, page = new_context(browser)
    try:
        email = mk_email('modal-ip')
        page.goto(URL)
        page.wait_for_load_state('networkidle')
        do_login(page, email, name='Modal Ip')
        ack_intro(page)
        ack_section(page, 'a1')
        ack_section(page, 'a2')
        session_id_1 = page.evaluate(f"localStorage.getItem('cm_session_{email.lower()}')")
        log('Session ID 1 generated', bool(session_id_1) and session_id_1.startswith('s_'), session_id_1 or '(none)')

        page.click('.signout-btn')
        page.wait_for_timeout(400)
        log('Logged out → login screen', page.locator('#login-screen').is_visible())

        do_login(page, email, name='Modal Ip')
        log('Re-login → resume modal shown', page.locator('#resume-overlay.show').is_visible())
        pill = page.locator('#resume-pill').text_content() or ''
        log('Modal pill reads "2 / 13"', '2 / 13' in pill, pill)

        # Click Continue
        page.click('button:has-text("Continue where I left off")')
        page.wait_for_timeout(600)
        log('Continue → modal hidden', not page.locator('#resume-overlay.show').is_visible())
        log('Continue → A1 still done', page.locator('.sec[data-id="a1"].done').count() == 1)
        log('Continue → A2 still done', page.locator('.sec[data-id="a2"].done').count() == 1)
        session_id_2 = page.evaluate(f"localStorage.getItem('cm_session_{email.lower()}')")
        log('Continue → same session_id preserved', session_id_2 == session_id_1)
    finally:
        ctx.close()


# ═══════════════════════════════════════════════════════════════════
# TEST 4: Start Fresh — clears progress, issues new session_id
# ═══════════════════════════════════════════════════════════════════
def test_modal_start_fresh(browser):
    section('4. RESUME MODAL — Start Fresh')
    ctx, page = new_context(browser)
    try:
        email = mk_email('modal-sf')
        reset_calls = []
        page.on('request', lambda req: reset_calls.append(req.url) if 'script.google.com' in req.url else None)

        page.goto(URL)
        page.wait_for_load_state('networkidle')
        do_login(page, email, name='Start Fresh')
        ack_intro(page)
        ack_section(page, 'a1')
        ack_section(page, 'a2')
        ack_section(page, 'b1')
        session_id_1 = page.evaluate(f"localStorage.getItem('cm_session_{email.lower()}')")

        page.click('.signout-btn')
        page.wait_for_timeout(400)
        do_login(page, email, name='Start Fresh')
        log('Modal appeared on re-login', page.locator('#resume-overlay.show').is_visible())

        # Click Start Fresh
        page.click('button:has-text("Start fresh")')
        page.wait_for_timeout(800)
        log('Start Fresh → modal hidden', not page.locator('#resume-overlay.show').is_visible())

        # Verify progress wiped
        log('Start Fresh → stepper is 0/13',
            page.locator('.step-chip.done').count() == 0, f'{page.locator(".step-chip.done").count()} done')
        log('Start Fresh → intro back to pending',
            'cknowledged' not in (page.locator('#intro-ack-btn').text_content() or ''))
        log('Start Fresh → progress label is 0%',
            (page.locator('#progress-label').text_content() or '').strip() == '0%')

        # New session_id generated
        session_id_2 = page.evaluate(f"localStorage.getItem('cm_session_{email.lower()}')")
        log('Start Fresh → new session_id generated', session_id_2 and session_id_2 != session_id_1,
            f'old={session_id_1} new={session_id_2}')
        log('Start Fresh → localStorage cleared for acks',
            page.evaluate(f"localStorage.getItem('cm_ack_{email.lower()}')") in (None, '', '{}'))
    finally:
        ctx.close()


# ═══════════════════════════════════════════════════════════════════
# TEST 5: Modal does NOT show on page reload (no explicit logout)
# ═══════════════════════════════════════════════════════════════════
def test_no_modal_on_reload(browser):
    section('5. RELOAD — modal does NOT appear (session still open)')
    ctx, page = new_context(browser)
    try:
        email = mk_email('no-modal-reload')
        page.goto(URL)
        page.wait_for_load_state('networkidle')
        do_login(page, email, name='No Modal Reload')
        ack_intro(page)
        ack_section(page, 'a1')

        page.reload()
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(600)
        log('Reload → still in module', page.locator('#module').is_visible())
        log('Reload → resume modal does NOT show', not page.locator('#resume-overlay.show').is_visible())
        log('Reload → A1 still done', page.locator('.sec[data-id="a1"].done').count() == 1)
    finally:
        ctx.close()


# ═══════════════════════════════════════════════════════════════════
# TEST 6: Completed user — modal shows, doesn't mark as Aborted on reset
# ═══════════════════════════════════════════════════════════════════
def test_completed_modal(browser):
    section('6. COMPLETED USER — modal differentiates state')
    ctx, page = new_context(browser)
    try:
        email = mk_email('done-modal')
        page.goto(URL)
        page.wait_for_load_state('networkidle')
        do_login(page, email, name='Done Modal')
        ack_intro(page)
        for s in SECTIONS:
            ack_section(page, s)
        page.locator('#final-btn').click()
        page.wait_for_timeout(800)
        for qi, ai in enumerate(CORRECT):
            page.locator(f'input[name="q{qi}"][value="{ai}"]').check(force=True)
        page.locator('button:has-text("Submit Assessment")').click()
        page.wait_for_timeout(2500)
        log('Completed module successfully',
            (page.locator('#final-heading').text_content() or '').strip() == 'Module Complete')

        page.click('.signout-btn')
        page.wait_for_timeout(400)
        do_login(page, email, name='Done Modal')
        log('Completed user: modal shows on re-login', page.locator('#resume-overlay.show').is_visible())
        pill = page.locator('#resume-pill').text_content() or ''
        log('Completed user: pill says "Completed"', 'ompleted' in pill, pill)
    finally:
        ctx.close()


# ═══════════════════════════════════════════════════════════════════
# TEST 7: Integration — session_id in every tracking payload
# ═══════════════════════════════════════════════════════════════════
def test_integration_session_id(browser):
    section('7. INTEGRATION — session_id in every tracking call')
    ctx, page = new_context(browser)
    try:
        email = mk_email('integ-sid')
        payloads = []

        def on_request(req):
            if 'script.google.com' in req.url and req.method == 'POST':
                try:
                    payloads.append(json.loads(req.post_data))
                except Exception:
                    pass
        page.on('request', on_request)

        page.goto(URL)
        page.wait_for_load_state('networkidle')
        do_login(page, email, name='Integ Session')
        ack_intro(page)
        ack_section(page, 'a1')
        page.wait_for_timeout(500)

        log('Tracking calls captured', len(payloads) > 0, f'{len(payloads)} payloads')

        has_session = all(('session_id' in p and p['session_id']) for p in payloads)
        log('Every payload has non-empty session_id', has_session,
            'sample: ' + (payloads[0]['session_id'] if payloads else ''))

        unique_sessions = set(p['session_id'] for p in payloads)
        log('One session_id across all events', len(unique_sessions) == 1,
            f'{len(unique_sessions)} unique')

        actions = [p.get('action', '') for p in payloads]
        log('Login event tracked', 'login' in actions)
        log('Intro acknowledge tracked',
            any(p.get('action') == 'acknowledge' and p.get('section') == 'intro' for p in payloads))
        log('Section a1 acknowledge tracked',
            any(p.get('action') == 'acknowledge' and p.get('section') == 'a1' for p in payloads))
    finally:
        ctx.close()


# ═══════════════════════════════════════════════════════════════════
# TEST 8: Integration — Start Fresh fires `reset` with OLD session_id
# ═══════════════════════════════════════════════════════════════════
def test_integration_reset_event(browser):
    section('8. INTEGRATION — Start Fresh fires reset with old session_id')
    ctx, page = new_context(browser)
    try:
        email = mk_email('integ-reset')
        payloads = []

        def on_request(req):
            if 'script.google.com' in req.url and req.method == 'POST':
                try:
                    payloads.append(json.loads(req.post_data))
                except Exception:
                    pass
        page.on('request', on_request)

        page.goto(URL)
        page.wait_for_load_state('networkidle')
        do_login(page, email, name='Integ Reset')
        ack_intro(page)
        ack_section(page, 'a1')

        # Logout + re-login
        page.click('.signout-btn')
        page.wait_for_timeout(300)
        do_login(page, email, name='Integ Reset')

        # Track payloads before clicking Start Fresh
        payloads_before_reset = len(payloads)

        page.click('button:has-text("Start fresh")')
        page.wait_for_timeout(1000)

        reset_events = [p for p in payloads if p.get('action') == 'reset']
        log('Reset event fired exactly once', len(reset_events) == 1, f'{len(reset_events)} reset events')

        # Session_id changes after reset
        sessions_before = set(p.get('session_id') for p in payloads[:payloads_before_reset] if p.get('session_id'))
        after_reset = [p for p in payloads if p.get('action') == 'login' and p.get('session_id') not in sessions_before]
        log('New session_id after Start Fresh',
            len(after_reset) >= 1, f'new sessions: {[p.get("session_id") for p in after_reset][:2]}')
        log('Reset event uses OLD session_id',
            reset_events[0].get('session_id') in sessions_before if reset_events else False)
    finally:
        ctx.close()


# ═══════════════════════════════════════════════════════════════════
# TEST 9: Stress — rapid click on ack button
# ═══════════════════════════════════════════════════════════════════
def test_stress_rapid_ack(browser):
    section('9. STRESS — rapid double/triple clicking ack')
    ctx, page = new_context(browser)
    try:
        email = mk_email('stress-rapid')
        payloads = []
        page.on('request', lambda req: payloads.append(req.url) if 'script.google.com' in req.url else None)

        page.goto(URL)
        page.wait_for_load_state('networkidle')
        do_login(page, email, name='Stress Rapid')
        ack_intro(page)

        # Rapid-click the A1 ack button 5 times
        ack_btn = page.locator('#b-a1 .ack-btn.pending')
        for _ in range(5):
            try:
                ack_btn.click(timeout=200)
            except Exception:
                pass  # Button may disappear after first click
        page.wait_for_timeout(1000)

        a1_done = page.locator('.sec[data-id="a1"].done').count() == 1
        log('After rapid clicks, A1 marked done exactly once', a1_done)
        current_is_a2 = page.locator('.sec.current[data-id="a2"]').count() == 1
        log('Auto-advance to A2 worked', current_is_a2)
        log('No JS runaway (sane tracking count)', len(payloads) < 30, f'{len(payloads)} tracking calls')
    finally:
        ctx.close()


# ═══════════════════════════════════════════════════════════════════
# TEST 10: Stress — 5 rapid logout/login cycles
# ═══════════════════════════════════════════════════════════════════
def test_stress_logout_cycles(browser):
    section('10. STRESS — 5 rapid logout/login cycles with Continue')
    ctx, page = new_context(browser)
    try:
        email = mk_email('stress-cycles')
        page.goto(URL)
        page.wait_for_load_state('networkidle')
        do_login(page, email, name='Cycles')
        ack_intro(page)
        ack_section(page, 'a1')

        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))

        for i in range(5):
            page.click('.signout-btn')
            page.wait_for_timeout(300)
            do_login(page, email, name='Cycles')
            if page.locator('#resume-overlay.show').is_visible():
                page.click('button:has-text("Continue where I left off")')
                page.wait_for_timeout(500)

        log('5 logout/login cycles completed without errors', len(errors) == 0)
        log('After cycles: A1 still done', page.locator('.sec[data-id="a1"].done').count() == 1)
        log('After cycles: intro still acked',
            'cknowledged' in (page.locator('#intro-ack-btn').text_content() or ''))
    finally:
        ctx.close()


# ═══════════════════════════════════════════════════════════════════
# TEST 11: Stress — long name/email with special chars
# ═══════════════════════════════════════════════════════════════════
def test_stress_special_chars(browser):
    section('11. STRESS — special characters in name/email')
    ctx, page = new_context(browser)
    try:
        email = f'quoted+filter.user-{RUN_ID}@cuemath-test.local'
        name = "O'Brien-Smith (Test) 测试 ñ"
        page.goto(URL)
        page.wait_for_load_state('networkidle')
        do_login(page, email, name=name, mobile='+91 98765 43210')
        log('Special chars login succeeds', page.locator('#module').is_visible())
        user_info = page.locator('#user-info').text_content() or ''
        log('Name renders correctly in topbar', 'Brien' in user_info or name.split(' ')[0] in user_info, user_info)
    finally:
        ctx.close()


# ═══════════════════════════════════════════════════════════════════
# TEST 12: Security — XSS attempt in inputs
# ═══════════════════════════════════════════════════════════════════
def test_security_xss(browser):
    section('12. SECURITY — XSS attempt in inputs')
    ctx, page = new_context(browser)
    try:
        xss_name = '<img src=x onerror=window.xssFired=true>'
        xss_payload_fired = [False]

        def on_console(msg):
            if 'xssFired' in msg.text:
                xss_payload_fired[0] = True
        page.on('console', on_console)

        page.goto(URL)
        page.wait_for_load_state('networkidle')
        do_login(page, mk_email('xss'), name=xss_name)
        page.wait_for_timeout(1000)

        xss_executed = page.evaluate('window.xssFired === true')
        log('XSS payload did NOT execute', not xss_executed)
        # Name should appear as plain text (either truncated in avatar, or in user-info)
        user_info_html = page.locator('#user-info').inner_html() or ''
        log('XSS payload rendered as text (no live img tag)',
            '<img' not in user_info_html.lower(),
            user_info_html[:80])
    finally:
        ctx.close()


# ═══════════════════════════════════════════════════════════════════
# TEST 13: Edge — localStorage tamper (corrupt JSON)
# ═══════════════════════════════════════════════════════════════════
def test_edge_localstorage_tamper(browser):
    section('13. EDGE — corrupted localStorage')
    ctx, page = new_context(browser)
    try:
        email = mk_email('tamper')
        page.goto(URL)
        page.wait_for_load_state('networkidle')
        do_login(page, email, name='Tamper Test')
        ack_intro(page)

        # Corrupt the acked storage
        page.evaluate(f"localStorage.setItem('cm_ack_{email.lower()}', 'NOT_VALID_JSON{{')")
        page.reload()
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(600)

        # Should either recover or fail gracefully (not throw uncaught)
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.wait_for_timeout(400)

        still_loaded = page.locator('#module').is_visible() or page.locator('#login-screen').is_visible()
        log('Corrupted localStorage does not brick the app', still_loaded,
            f'errors: {errors[:1]}' if errors else '')
    finally:
        ctx.close()


# ═══════════════════════════════════════════════════════════════════
# TEST 14: Multi-user — two users share the same browser
# ═══════════════════════════════════════════════════════════════════
def test_multi_user_same_browser(browser):
    section('14. MULTI-USER — two teachers share the same browser')
    ctx, page = new_context(browser)
    try:
        user_a = mk_email('user-a')
        user_b = mk_email('user-b')

        page.goto(URL)
        page.wait_for_load_state('networkidle')

        # User A logs in, completes 2 sections
        do_login(page, user_a, name='Teacher A')
        ack_intro(page)
        ack_section(page, 'a1')
        ack_section(page, 'a2')
        a_sections = page.locator('.step-chip.done').count()
        log('User A: 2 sections done', a_sections == 2, f'{a_sections}/13')

        # User A logs out, User B logs in
        page.click('.signout-btn')
        page.wait_for_timeout(300)
        do_login(page, user_b, name='Teacher B')
        # Should NOT see A's progress
        log('User B: no resume modal (fresh for this email)',
            not page.locator('#resume-overlay.show').is_visible())
        b_sections = page.locator('.step-chip.done').count()
        log('User B: sees 0 sections done', b_sections == 0, f'{b_sections}/13')

        # User B does 3 sections
        ack_intro(page)
        ack_section(page, 'a1')
        ack_section(page, 'a2')
        ack_section(page, 'b1')
        b_after = page.locator('.step-chip.done').count()
        log('User B: 3 sections done', b_after == 3)

        # User B logs out, User A comes back
        page.click('.signout-btn')
        page.wait_for_timeout(300)
        do_login(page, user_a, name='Teacher A')
        log('User A back: resume modal shown',
            page.locator('#resume-overlay.show').is_visible())
        page.click('button:has-text("Continue where I left off")')
        page.wait_for_timeout(500)
        a_back = page.locator('.step-chip.done').count()
        log('User A: their 2 sections preserved (not B\'s 3)', a_back == 2, f'{a_back}/13')
    finally:
        ctx.close()


# ═══════════════════════════════════════════════════════════════════
# TEST 15: Viewport — desktop, tablet, mobile
# ═══════════════════════════════════════════════════════════════════
def test_viewports(browser):
    section('15. RESPONSIVE — desktop, tablet, mobile')
    for label, vw in [('desktop', {'width': 1440, 'height': 900}),
                       ('tablet', {'width': 820, 'height': 1180}),
                       ('mobile', {'width': 390, 'height': 844})]:
        ctx, page = new_context(browser, viewport=vw)
        try:
            page.goto(URL)
            page.wait_for_load_state('networkidle')
            do_login(page, mk_email(f'vp-{label}'), name=f'Viewport {label}')
            log(f'{label} ({vw["width"]}px): module loads', page.locator('#module').is_visible())
            ack_intro(page)
            ack_section(page, 'a1')
            log(f'{label}: ack + advance works', page.locator('.sec[data-id="a1"].done').count() == 1)
            # Stepper visible (layout may be horizontal on mobile, vertical on desktop)
            stepper_visible = page.locator('#stepper').bounding_box() is not None
            log(f'{label}: stepper visible', stepper_visible)
        finally:
            ctx.close()


# ═══════════════════════════════════════════════════════════════════
# RUNNER
# ═══════════════════════════════════════════════════════════════════
def main():
    print(f'▶ QA suite — run_id={RUN_ID}')
    print(f'▶ Target: {URL}', flush=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            test_functional_regression(browser)
            test_login_validation(browser)
            test_modal_in_progress(browser)
            test_modal_start_fresh(browser)
            test_no_modal_on_reload(browser)
            test_completed_modal(browser)
            test_integration_session_id(browser)
            test_integration_reset_event(browser)
            test_stress_rapid_ack(browser)
            test_stress_logout_cycles(browser)
            test_stress_special_chars(browser)
            test_security_xss(browser)
            test_edge_localstorage_tamper(browser)
            test_multi_user_same_browser(browser)
            test_viewports(browser)
        finally:
            browser.close()

    passed = sum(1 for r in RESULTS if r['passed'])
    failed = sum(1 for r in RESULTS if not r['passed'])
    print('\n' + '=' * 72)
    print(f'QA RESULT: {passed} PASSED, {failed} FAILED (of {len(RESULTS)} checks)')
    print('=' * 72)
    if failed > 0:
        print('\nFAILED CHECKS:')
        for r in RESULTS:
            if not r['passed']:
                print(f'  ✗ {r["name"]}')
                if r['detail']:
                    print(f'      detail: {r["detail"]}')
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
