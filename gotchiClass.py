import pygame, os
import json
import random
from mainConst import screen, pixel_font
from buttonClass import Button
from abs_path import abs_path

pygame.init()

# --- $Gotchi demo economy ------------------------------------------------
# NOTE: This is a *demo* play-to-earn layer. "$Gotchi" tokens live only in a
# local save file and a mock wallet address - they have no real-world value
# and there is no blockchain involved. A real integration would need a web
# frontend (e.g. WalletConnect / wagmi) instead of this pygame mock.

SAVE_FILE = abs_path('gotchi_save.json')

# How much XP separates each level, and the per-action rewards.
XP_PER_LEVEL = 100
COIN_XP = 4          # xp per coin caught in the mini-game
COIN_GOTCHI = 5      # $Gotchi accrued per coin caught

# Level milestones the player can *claim* a reward at: (level, $Gotchi reward).
CLAIM_TIERS = [
    (2, 100),
    (5, 250),
    (10, 500),
    (25, 1000),
]

# Open/close flags, kept consistent with the clicked_* convention used by the
# other overlay modules (panelClass, foodClass, statisticsClass).
clicked_wallet = False
clicked_earn = False

state = {
    'balance': 0,          # claimed $Gotchi (demo)
    'pending': 0,          # earned but not yet claimed
    'xp': 0,               # total experience -> drives level
    'wallet': None,        # mock wallet address, or None when disconnected
    'claimed_tiers': [],   # milestone levels already claimed
}

button_sound = pygame.mixer.Sound(abs_path('sounds/button.ogg'))
button_sound.set_volume(0.05)
coin_sound = pygame.mixer.Sound(abs_path('sounds/coin.ogg'))

title_font = pygame.font.Font(abs_path('font/technicality1.ttf'), 30)
body_font = pygame.font.Font(abs_path('font/technicality1.ttf'), 18)

GOLD = (255, 214, 102)
WHITE = (255, 255, 255)


def load():
    try:
        with open(SAVE_FILE, 'r') as f:
            saved = json.load(f)
        for key in state:
            if key in saved:
                state[key] = saved[key]
    except (FileNotFoundError, ValueError, OSError):
        pass


def save():
    try:
        with open(SAVE_FILE, 'w') as f:
            json.dump(state, f)
    except OSError:
        pass


def level():
    return 1 + state['xp'] // XP_PER_LEVEL


def add_xp(amount):
    state['xp'] += amount


def reward(xp=0, gotchi=0):
    """Grant experience and accrue claimable $Gotchi from a single action."""
    state['xp'] += xp
    state['pending'] += gotchi


def reward_coin(count=1):
    reward(xp=COIN_XP * count, gotchi=COIN_GOTCHI * count)


# --- wallet ---------------------------------------------------------------
def is_connected():
    return state['wallet'] is not None


def connect():
    if state['wallet'] is None:
        state['wallet'] = '0x' + ''.join(random.choice('0123456789abcdef') for _ in range(40))
        save()
    return state['wallet']


def disconnect():
    state['wallet'] = None
    save()


def short_address():
    wallet = state['wallet']
    if not wallet:
        return 'Not connected'
    return wallet[:6] + '...' + wallet[-4:]


# --- claiming -------------------------------------------------------------
def claimable_tiers():
    return [(lvl, rwd) for lvl, rwd in CLAIM_TIERS
            if level() >= lvl and lvl not in state['claimed_tiers']]


def total_claimable():
    return state['pending'] + sum(rwd for _, rwd in claimable_tiers())


def can_claim():
    return is_connected() and level() >= CLAIM_TIERS[0][0] and total_claimable() > 0


def claim():
    """Move all unlocked $Gotchi into the wallet balance. Returns the amount."""
    if not can_claim():
        return 0
    amount = total_claimable()
    for lvl, _ in claimable_tiers():
        state['claimed_tiers'].append(lvl)
    state['balance'] += amount
    state['pending'] = 0
    save()
    return amount


def claim_status():
    """Human-readable hint about why claiming is / isn't available."""
    if not is_connected():
        return 'Connect a wallet to claim'
    if level() < CLAIM_TIERS[0][0]:
        return f'Reach Lv {CLAIM_TIERS[0][0]} to unlock claiming'
    amount = total_claimable()
    if amount <= 0:
        return 'Care & play to earn more $Gotchi'
    return f'Claimable: {amount} $Gotchi - press Claim!'


def _blit_lines(lines, start_y, x=400, line_height=30, center=True, font=None, color=WHITE):
    font = font or body_font
    y = start_y
    for line in lines:
        if not line:
            y += line_height
            continue
        surf = font.render(line, True, color)
        rect = surf.get_rect(center=(x, y)) if center else surf.get_rect(topleft=(x, y))
        screen.blit(surf, rect)
        y += line_height


class WalletPanel:
    """Overlay showing the demo wallet, balance and the Claim action."""

    def __init__(self):
        self.image = pygame.transform.scale(pygame.image.load(abs_path('images/sprites/panel_brown.png')), (750, 450))
        self.image_rect = self.image.get_rect(center=(400, 250))
        self.exit = pygame.transform.scale(pygame.image.load(abs_path('images/sprites/iconCross_beige.png')), (40, 40))
        self.exit_rect = self.exit.get_rect(center=(75, 65))

        brown = abs_path('images/sprites/buttonLong_brown.png')
        self.connect_btn = Button(260, 370, 230, 50, brown, 'Connect')
        self.disconnect_btn = Button(260, 370, 230, 50, brown, 'Disconnect')
        self.claim_btn = Button(545, 370, 230, 50, brown, 'Claim')

    def _action_btn(self):
        return self.disconnect_btn if is_connected() else self.connect_btn

    def draw(self, pos_x, pos_y):
        screen.blit(self.image, self.image_rect)
        _blit_lines(['$GOTCHI WALLET'], 70, font=title_font, color=GOLD)
        _blit_lines(['DEMO MODE - tokens have no real value'], 105, color=GOLD)
        _blit_lines([
            f'Wallet:  {short_address()}',
            f'Balance:  {state["balance"]} $Gotchi',
            f'Claimable:  {total_claimable()} $Gotchi',
            f'Gotchi Level:  {level()}   (XP {state["xp"]})',
        ], 150, line_height=35)
        _blit_lines([claim_status()], 305, color=GOLD)

        action_btn = self._action_btn()
        action_btn.hover(pos_x, pos_y)
        action_btn.blit_btn()
        self.claim_btn.hover(pos_x, pos_y)
        self.claim_btn.blit_btn()
        screen.blit(self.exit, self.exit_rect)

    def handle_event(self, pos, event):
        global clicked_wallet
        if event.type != pygame.MOUSEBUTTONDOWN:
            return
        if self.exit_rect.collidepoint(pos):
            button_sound.play()
            clicked_wallet = False
        elif self._action_btn().rect.collidepoint(pos):
            button_sound.play()
            disconnect() if is_connected() else connect()
        elif self.claim_btn.rect.collidepoint(pos):
            if claim() > 0:
                coin_sound.play()
            else:
                button_sound.play()


class EarnPanel:
    """The 'How to Earn' play-to-earn explainer page."""

    def __init__(self):
        self.image = pygame.transform.scale(pygame.image.load(abs_path('images/sprites/panel_brown.png')), (750, 450))
        self.image_rect = self.image.get_rect(center=(400, 250))
        self.exit = pygame.transform.scale(pygame.image.load(abs_path('images/sprites/iconCross_beige.png')), (40, 40))
        self.exit_rect = self.exit.get_rect(center=(75, 65))

    def draw(self):
        screen.blit(self.image, self.image_rect)
        _blit_lines(['HOW TO EARN  $GOTCHI'], 70, font=title_font, color=GOLD)
        _blit_lines(['Play-to-Earn demo - care for your Gotchi to earn'], 105)
        _blit_lines([
            '1.  Connect your demo wallet.',
            '2.  Feed, clean, heal and play with your Gotchi.',
            f'3.  Catch coins in the mini-game:  +{COIN_GOTCHI} $Gotchi each.',
            f'4.  Every action gives XP.  {XP_PER_LEVEL} XP = +1 Level.',
            '5.  Milestone levels unlock rewards:',
            '        Lv 2: 100      Lv 5: 250',
            '        Lv 10: 500     Lv 25: 1000',
            '6.  Open your Wallet and press CLAIM.',
        ], 150, x=110, center=False)
        _blit_lines(['Demo only - $Gotchi has no real-world value.'], 440, color=GOLD)
        screen.blit(self.exit, self.exit_rect)

    def handle_event(self, pos, event):
        global clicked_earn
        if event.type == pygame.MOUSEBUTTONDOWN and self.exit_rect.collidepoint(pos):
            button_sound.play()
            clicked_earn = False


load()
