#!/usr/bin/env python3
"""Labyrinth-Generator und A*-Löser fürs Terminal.

Erzeugt ein zufälliges, perfektes Labyrinth (genau ein Weg zwischen je zwei
Feldern) per Recursive Backtracking und löst es anschließend animiert mit A*.
Im Spielmodus läufst du selbst mit den Pfeiltasten durch.

Aufruf:
    python3 labyrinth.py                 # Standardgröße, animiert
    python3 labyrinth.py -b 30 -h 12     # eigene Breite/Höhe (in Zellen)
    python3 labyrinth.py --seed 42       # reproduzierbares Labyrinth
    python3 labyrinth.py --schnell       # ohne Animation
    python3 labyrinth.py --spielen       # selbst spielen (Pfeiltasten/WASD)
"""

import argparse
import heapq
import os
import random
import select
import sys
import time

WAND, FREI, BESUCHT, WEG, START, ZIEL = "#", " ", ".", "*", "S", "Z"
SPIELER, SPUR = "@", "+"

FARBEN = {
    WAND: "\033[48;5;236m  \033[0m",
    FREI: "  ",
    BESUCHT: "\033[38;5;67m··\033[0m",
    WEG: "\033[48;5;214m  \033[0m",
    START: "\033[48;5;34m  \033[0m",
    ZIEL: "\033[48;5;160m  \033[0m",
    SPIELER: "\033[48;5;33m  \033[0m",
    SPUR: "\033[48;5;24m  \033[0m",
}

RICHTUNGEN = {
    "\x1b[A": (-1, 0), "w": (-1, 0),
    "\x1b[B": (1, 0), "s": (1, 0),
    "\x1b[D": (0, -1), "a": (0, -1),
    "\x1b[C": (0, 1), "d": (0, 1),
}


def erzeuge_labyrinth(breite, hoehe, rng):
    """Recursive Backtracking (iterativ mit Stack, also ohne Rekursionslimit)."""
    gitter = [[WAND] * (2 * breite + 1) for _ in range(2 * hoehe + 1)]
    stack = [(0, 0)]
    gitter[1][1] = FREI
    while stack:
        x, y = stack[-1]
        nachbarn = [
            (nx, ny)
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
            if 0 <= nx < breite and 0 <= ny < hoehe and gitter[2 * ny + 1][2 * nx + 1] == WAND
        ]
        if not nachbarn:
            stack.pop()
            continue
        nx, ny = rng.choice(nachbarn)
        gitter[y + ny + 1][x + nx + 1] = FREI  # Wand zwischen den Zellen einreißen
        gitter[2 * ny + 1][2 * nx + 1] = FREI
        stack.append((nx, ny))
    return gitter


def a_stern(gitter, start, ziel, beim_besuch=None):
    """A* mit Manhattan-Distanz. Liefert den Weg als Liste von (zeile, spalte)."""
    def h(p):
        return abs(p[0] - ziel[0]) + abs(p[1] - ziel[1])

    offen = [(h(start), 0, start)]
    herkunft = {start: None}
    kosten = {start: 0}
    while offen:
        _, g, aktuell = heapq.heappop(offen)
        if aktuell == ziel:
            weg = []
            while aktuell:
                weg.append(aktuell)
                aktuell = herkunft[aktuell]
            return weg[::-1]
        if g > kosten[aktuell]:
            continue  # veralteter Heap-Eintrag
        if beim_besuch:
            beim_besuch(aktuell)
        r, c = aktuell
        for nb in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if gitter[nb[0]][nb[1]] == WAND:
                continue
            ng = g + 1
            if ng < kosten.get(nb, float("inf")):
                kosten[nb] = ng
                herkunft[nb] = aktuell
                heapq.heappush(offen, (ng + h(nb), ng, nb))
    return []


def zeichne(gitter, farbig, kopf="", cursor_oben=None):
    zeilen = ["".join(FARBEN[z] if farbig else z for z in reihe) for reihe in gitter]
    if farbig if cursor_oben is None else cursor_oben:
        sys.stdout.write("\033[H")  # Cursor nach oben links, kein Flackern
        kopf += "\033[K"  # Rest der Kopfzeile löschen
    sys.stdout.write(kopf + "\n" + "\n".join(zeilen) + "\n")
    sys.stdout.flush()


def lies_taste(fd):
    """Liest eine Taste; Pfeiltasten kommen als Escape-Sequenz (ESC [ A..D)."""
    taste = os.read(fd, 1)
    if taste == b"\x1b":
        while len(taste) < 3 and select.select([fd], [], [], 0.05)[0]:
            taste += os.read(fd, 1)
    taste = taste.decode(errors="ignore")
    return taste if taste.startswith("\x1b") else taste.lower()  # Sequenzen nicht verändern


def spielen(gitter, start, ziel, seed, farbig):
    """Interaktiver Modus: Spieler läuft mit Pfeiltasten/WASD zum Ziel."""
    import termios
    import tty

    fd = sys.stdin.fileno()
    optimal = len(a_stern(gitter, start, ziel)) - 1
    pos, zuege, spur = start, 0, {start}
    zeige_loesung = loesung_genutzt = False
    t0 = None
    alte_einstellungen = termios.tcgetattr(fd)
    try:
        tty.setcbreak(fd)  # Tasten sofort lesen, ohne Echo; Strg+C funktioniert weiter
        sys.stdout.write("\033[?25l\033[2J")  # Cursor verstecken, Bildschirm leeren
        while True:
            anzeige = [reihe[:] for reihe in gitter]
            for r, c in spur:
                if anzeige[r][c] == FREI:
                    anzeige[r][c] = SPUR
            if zeige_loesung:
                for r, c in a_stern(gitter, pos, ziel)[1:-1]:
                    anzeige[r][c] = WEG
            anzeige[pos[0]][pos[1]] = SPIELER
            kopf = (f"Seed {seed} · Züge: {zuege} · Pfeile/WASD: laufen · "
                    f"L: Lösung {'aus' if zeige_loesung else 'an'} · Q: Ende")
            zeichne(anzeige, farbig, kopf, cursor_oben=True)
            if pos == ziel:
                break

            taste = lies_taste(fd)
            if taste == "q":
                print("Aufgegeben – bis zum nächsten Mal!")
                return
            if taste == "l":
                zeige_loesung = not zeige_loesung
                loesung_genutzt = True
            elif taste in RICHTUNGEN:
                dr, dc = RICHTUNGEN[taste]
                neu = (pos[0] + dr, pos[1] + dc)
                if gitter[neu[0]][neu[1]] != WAND:
                    t0 = t0 or time.perf_counter()
                    pos, zuege = neu, zuege + 1
                    spur.add(pos)
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, alte_einstellungen)
        sys.stdout.write("\033[?25h")  # Cursor wieder anzeigen
        sys.stdout.flush()

    dauer = time.perf_counter() - t0
    if loesung_genutzt:
        urteil = "mit Spickzettel 😉"
    elif zuege == optimal:
        urteil = "perfekt – kürzester Weg! 🏆"
    elif zuege <= optimal * 1.5:
        urteil = "stark! 💪"
    else:
        urteil = "geschafft – ein paar Umwege waren dabei 🧭"
    print(f"Ziel erreicht in {zuege} Zügen (optimal: {optimal}) und {dauer:.1f} s – {urteil}")


def main():
    p = argparse.ArgumentParser(description="Labyrinth-Generator mit A*-Löser", add_help=False)
    p.add_argument("--help", action="help", help="Hilfe anzeigen")
    p.add_argument("-b", "--breite", type=int, default=24, help="Breite in Zellen (Standard: 24)")
    p.add_argument("-h", "--hoehe", type=int, default=12, help="Höhe in Zellen (Standard: 12)")
    p.add_argument("--seed", type=int, help="Zufallsseed für reproduzierbare Labyrinthe")
    p.add_argument("--schnell", action="store_true", help="Keine Animation")
    p.add_argument("--ohne-farbe", action="store_true", help="Reine ASCII-Ausgabe")
    p.add_argument("--spielen", action="store_true", help="Selbst spielen mit Pfeiltasten/WASD")
    args = p.parse_args()
    if args.breite < 2 or args.hoehe < 2:
        p.error("Breite und Höhe müssen mindestens 2 sein")
    if args.spielen and not (sys.stdin.isatty() and sys.stdout.isatty()):
        p.error("--spielen braucht ein interaktives Terminal")
    if args.spielen and os.name == "nt":
        p.error("--spielen wird unter Windows nicht unterstützt (nutze WSL)")

    seed = args.seed if args.seed is not None else random.randrange(10**6)
    farbig = not args.ohne_farbe and sys.stdout.isatty()
    animiert = farbig and not args.schnell

    gitter = erzeuge_labyrinth(args.breite, args.hoehe, random.Random(seed))
    start, ziel = (1, 1), (2 * args.hoehe - 1, 2 * args.breite - 1)
    gitter[start[0]][start[1]], gitter[ziel[0]][ziel[1]] = START, ZIEL

    if args.spielen:
        spielen(gitter, start, ziel, seed, farbig)
        return

    besucht = 0

    def beim_besuch(pos):
        nonlocal besucht
        besucht += 1
        if gitter[pos[0]][pos[1]] == FREI:
            gitter[pos[0]][pos[1]] = BESUCHT
        if animiert:
            zeichne(gitter, farbig, f"Seed {seed} · A* erkundet … {besucht} Felder")
            time.sleep(0.012)

    if farbig:
        sys.stdout.write("\033[2J")  # Bildschirm leeren
    t0 = time.perf_counter()
    weg = a_stern(gitter, start, ziel, beim_besuch)
    dauer = time.perf_counter() - t0

    for r, c in weg[1:-1]:
        gitter[r][c] = WEG
        if animiert:
            zeichne(gitter, farbig, f"Seed {seed} · Weg gefunden!{' ' * 20}")
            time.sleep(0.008)

    zeichne(gitter, farbig, f"Seed {seed} · Labyrinth {args.breite}×{args.hoehe}{' ' * 20}")
    frei = sum(z != WAND for reihe in gitter for z in reihe)
    print(f"Weglänge: {len(weg)} Felder · erkundet: {besucht} von {frei} freien Feldern"
          + ("" if animiert else f" · Rechenzeit: {dauer * 1000:.2f} ms"))


if __name__ == "__main__":
    main()
