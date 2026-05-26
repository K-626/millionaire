/**
 * Standard Daifugo (大富豪) - Game Logic Module
 *
 * Card strength (normal):     3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A < 2
 * Card strength (revolution): reversed
 *
 * Rules:
 *  - Singles, pairs, triples, quads of the same number
 *  - 8切り (Eight Cut): Playing 8(s) clears the field; same player goes again
 *  - 革命 (Revolution): Playing 4+ of the same number toggles strength order
 *  - 縛り (Bind): Consecutive same-suit plays lock the suit
 */

// ── Deck ──────────────────────────────────────────────

export function buildDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const deck = [];
    let id = 1;
    for (const suit of suits) {
        for (let number = 1; number <= 13; number++) {
            deck.push({ id: id++, suit, number });
        }
    }
    return deck;
}

export function shuffleDeck(deck) {
    const d = deck.slice();
    for (let i = d.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
}

export function dealHands(deck, playerCount) {
    const hands = Array.from({ length: playerCount }, () => []);
    for (let i = 0; i < deck.length; i++) {
        hands[i % playerCount].push(deck[i]);
    }
    return hands;
}

// ── Card helpers ──────────────────────────────────────

/**
 * Convert a card number to a comparable rank.
 *   Normal:     3→3 … K→13, A→14, 2→15
 *   Revolution: rank is flipped via  18 − rank
 */
export function cardRank(number, revolution = false) {
    let rank;
    if (number === 1) rank = 14;        // Ace
    else if (number === 2) rank = 15;   // 2 is strongest in normal
    else rank = number;                 // 3‑13
    if (revolution) rank = 18 - rank;
    return rank;
}

export function sortCards(cards, revolution = false) {
    return cards.slice().sort((a, b) => {
        const diff = cardRank(a.number, revolution) - cardRank(b.number, revolution);
        return diff !== 0 ? diff : a.suit.localeCompare(b.suit);
    });
}

export function formatNumber(number) {
    if (number === 1) return 'A';
    if (number === 11) return 'J';
    if (number === 12) return 'Q';
    if (number === 13) return 'K';
    return String(number);
}

export function isRedSuit(suit) {
    return suit === '♥' || suit === '♦';
}

export function normalizeNumber(number) {
    return number === 2 ? 15 : number;
}

// ── Play classification ───────────────────────────────

export function allSameNumber(cards) {
    if (cards.length === 0) return true;
    return cards.every(c => c.number === cards[0].number);
}

/** 8切り: all played cards are 8 */
export function isEightCut(cards) {
    return cards.length > 0 && cards.every(c => c.number === 8);
}

/** 革命: 4+ cards of the same number */
export function isRevolution(cards) {
    return cards.length >= 4 && allSameNumber(cards);
}

export function isQuestion(cards) {
    return cards.length >= 1 && cards.every(c => c.number === 12);
}

export function isBabanuki(cards) {
    return cards.length >= 1 && cards.every(c => c.number === 9);
}

export function isOneStar(cards) {
    return cards.length === 1 && cards[0].number === 1;
}

export function isSalvage(cards) {
    return cards.length === 1 && cards[0].number === 2;
}

export function isTenThrow(cards) {
    return cards.length >= 1 && cards.every(c => c.number === 10);
}

export function isSixLock(cards) {
    return cards.length >= 1 && cards.every(c => c.number === 6);
}

export function isJackPlay(cards) {
    return cards.length > 0 && cards.every(c => c.number === 11);
}

export function isSameSuitSequence(cards) {
    if (!cards || cards.length < 2) return false;
    const sorted = cards.slice().sort((a, b) => {
        const na = normalizeNumber(a.number);
        const nb = normalizeNumber(b.number);
        return na - nb || a.suit.localeCompare(b.suit);
    });
    const suit = sorted[0].suit;
    if (!sorted.every(c => c.suit === suit)) return false;

    const values = sorted.map(c => normalizeNumber(c.number));
    const diff = values[1] - values[0];
    const arithmetic = values.slice(1).every((value, index) => value === values[index] + diff);
    if (arithmetic) return true;

    const ratios = values.slice(1).every((value, index) => value === values[index] * 2);
    return ratios;
}

export function hasMiwaLock(cards) {
    if (!cards || cards.length === 0) return false;
    const suits = new Set(cards.map(c => c.suit));
    return Array.from(suits).some(suit => {
        const has3 = cards.some(c => c.suit === suit && c.number === 3);
        const has8 = cards.some(c => c.suit === suit && c.number === 8);
        return has3 && has8;
    });
}

export function playClearsField(cards) {
    return isEightCut(cards);
}

/** Do two same-length card groups share the same multiset of suits? */
export function suitSetsMatch(cards1, cards2) {
    if (cards1.length !== cards2.length) return false;
    const s1 = cards1.map(c => c.suit).sort().join(',');
    const s2 = cards2.map(c => c.suit).sort().join(',');
    return s1 === s2;
}

// ── Validation ────────────────────────────────────────

/**
 * Is the proposed play legal?
 *
 * @param {Card[]} fieldCards  – cards currently on the field (empty = free turn)
 * @param {Card[]} played     – cards the player wants to play
 * @param {boolean} isBind    – suit bind active?
 * @param {boolean} revolution – revolution active?
 */
export function isValidPlay(fieldCards, played, isBind = false, revolution = false) {
    if (!played || played.length === 0) return false;

    if (isEightCut(played)) return true;
    if (isQuestion(played) || isBabanuki(played) || isOneStar(played) || isSalvage(played) || isTenThrow(played) || isSixLock(played) || isJackPlay(played)) return true;
    if (isSameSuitSequence(played)) return true;
    if (!allSameNumber(played)) return false;

    // Free turn: any same-number group
    if (!fieldCards || fieldCards.length === 0) return true;

    // Must match the number of cards on the field
    if (played.length !== fieldCards.length) return false;

    // Bind check
    if (isBind && !suitSetsMatch(fieldCards, played)) return false;

    // Must beat the field rank
    return cardRank(played[0].number, revolution) > cardRank(fieldCards[0].number, revolution);
}
