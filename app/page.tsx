"use client";

import React from "react";
import { motion } from "framer-motion";

/**
 * SENDY — One-phone pass-and-play board game
 * - 35 tiles (7x5 snake)
 * - Dice 1–6
 * - Exact landing WIN (bounce back)
 * - Popups gate turns (no end-turn button)
 * - Snap timers (10 min) must be started to continue
 * - TikTok timers (60 min) must be started to continue
 * - Dare has no preset (other players pick)
 * - Back 5 treats the new tile as landed-on (resolves it)
 * - Minimal solo cup background decoration
 * - Loud red/white/blue vibe
 * - Language uses “drink”
 */

const MAX_PLAYERS = 16;
const COLS = 7;
const ROWS = 5;
const TILE_COUNT = COLS * ROWS; // 35
const WIN_INDEX = TILE_COUNT - 1;

const USA_RED = "#C8102E";
const USA_BLUE = "#1F3A93";
const NAVY = "#0B1B3A";
const OFF_WHITE = "#FBFBFF";

const PLAYER_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#00C7BE",
  "#32ADE6", "#007AFF", "#5856D6", "#AF52DE", "#FF2D55",
  "#FF6B6B", "#4D96FF", "#6BCB77", "#FFD93D", "#845EC2", "#00A8E8",
];

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function nowMs() {
  return Date.now();
}

function fmt(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

/** ===== Tiles ===== */

type TileType =
  | "start"
  | "path"
  | "safe"
  | "sip2"
  | "sip3"
  | "sip5"
  | "sip10"
  | "chug10s"
  | "shotgun"
  | "finish"
  | "back5"
  | "snap"
  | "tiktok"
  | "dare"
  | "win";

type Tile = { i: number; type: TileType; label: string };

const TILE_TEXT: Record<TileType, { title: string; subtitle: string }> = {
  start: { title: "SENDY", subtitle: "Everyone starts here. Don’t be soft." },
  path: { title: "Move", subtitle: "Nothing special. Next up." },
  safe: { title: "SAFE ✅", subtitle: "No effect. You’re chilling." },

  sip2: { title: "2 SIPS", subtitle: "Take 2 sips." },
  sip3: { title: "3 SIPS", subtitle: "Take 3 sips." },
  sip5: { title: "5 SIPS", subtitle: "Take 5 sips." },
  sip10: { title: "10 SIPS", subtitle: "Take 10 sips. Count ’em." },

  chug10s: { title: "CHUG ⏱️", subtitle: "Chug your drink for 10 seconds." },
  shotgun: { title: "SHOTGUN 💥", subtitle: "Shotgun a new drink." },
  finish: { title: "FINISH 🚨", subtitle: "Finish your drink." },

  back5: { title: "BACK 5 ⬅️", subtitle: "Go back 5 spaces (and resolve that tile)." },

  snap: {
    title: "SNAP 📸",
    subtitle:
      "Other players can post something on your Snapchat story for 10 minutes. You must start the timer to continue.",
  },

  tiktok: {
    title: "TIKTOK 🎬",
    subtitle:
      "Other players pick a TikTok for you to do. You must start the 60-minute timer to continue.",
  },

  dare: { title: "DARE 🎯", subtitle: "Other players pick a dare for you to do." },

  win: { title: "WIN 🏁", subtitle: "You must land exactly here to win." },
};

function buildBoard(): Tile[] {
  const board: Tile[] = Array.from({ length: TILE_COUNT }, (_, i) => ({
    i,
    type: "path",
    label: String(i),
  }));

  const set = (i: number, type: TileType, label: string) => {
    if (i < 0 || i >= TILE_COUNT) return;
    board[i] = { i, type, label };
  };

  set(0, "start", "START");
  set(WIN_INDEX, "win", "WIN");

  // Safe (reduced)
  [1, 14, 29].forEach((i) => set(i, "safe", "SAFE"));

  // 2 sips (2)
  [6, 22].forEach((i) => set(i, "sip2", "2"));

  // 3 sips (7) — 27 is TikTok
  [2, 7, 11, 15, 18, 21, 30].forEach((i) => set(i, "sip3", "3"));

  // 5 sips (4)
  [4, 19, 25, 28].forEach((i) => set(i, "sip5", "5"));

  // 10 sips (2)
  [9, 16].forEach((i) => set(i, "sip10", "10"));

  // chug (2)
  [20, 26].forEach((i) => set(i, "chug10s", "CHUG"));

  // shotgun (1)
  set(24, "shotgun", "SHOTGUN");

  // finish (2 near end)
  [32, 33].forEach((i) => set(i, "finish", "FINISH"));

  // actions
  set(12, "back5", "BACK 5");
  set(10, "snap", "SNAP");
  set(17, "snap", "SNAP");
  set(8, "dare", "DARE");

  // TikTok locked
  set(13, "tiktok", "TIKTOK");
  set(27, "tiktok", "TIKTOK");

  return board;
}

/** ===== Snake grid mapping ===== */
function boardIndexFromGridCell(gridRowTop: number, gridCol: number) {
  const rowFromBottom = ROWS - 1 - gridRowTop; // 0 bottom ... 4 top
  const base = rowFromBottom * COLS;
  const reverse = rowFromBottom % 2 === 1;
  return reverse ? base + (COLS - 1 - gridCol) : base + gridCol;
}

/** ===== Game types ===== */

type Player = { id: string; name: string; pos: number; color: string };

type GameTimer = { id: string; label: string; endsAt: number };

type PopupAction =
  | { kind: "continue" }
  | { kind: "startSnapTimer" }
  | { kind: "startTikTokTimer" };

type Popup = { title: string; subtitle: string; button: string; action: PopupAction };

type Phase = "lobby" | "playing" | "finished";

type GameState = {
  phase: Phase;
  board: Tile[];
  players: Player[];
  current: number;
  passScreen: boolean;
  lastRoll?: number;
  popup?: Popup;
  timers: GameTimer[];
  winnerName?: string;
  animating: boolean;
};

function initialState(): GameState {
  return {
    phase: "lobby",
    board: buildBoard(),
    players: [],
    current: 0,
    passScreen: false,
    timers: [],
    animating: false,
  };
}

function saveState(s: GameState) {
  try {
    localStorage.setItem("sendy_state_v1", JSON.stringify(s));
  } catch {}
}

function loadState(): GameState | null {
  try {
    const raw = localStorage.getItem("sendy_state_v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (!parsed || !parsed.board || !parsed.players) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearSaved() {
  try {
    localStorage.removeItem("sendy_state_v1");
  } catch {}
}

/** ===== Styling helpers ===== */

function tileStyle(type: TileType): React.CSSProperties {
  const base: React.CSSProperties = {
    borderRadius: 18,
    padding: 10,
    minHeight: 70,
    position: "relative",
    boxShadow: "0 10px 24px rgba(11,27,58,0.08)",
    border: "2px solid rgba(11,27,58,0.08)",
    overflow: "hidden",
  };

  const tintBlue = "rgba(31,58,147,0.16)";
  const tintRed = "rgba(200,16,46,0.16)";
  const navyCard = NAVY;

  switch (type) {
    case "start":
      return { ...base, background: "rgba(31,58,147,0.12)", borderColor: "rgba(31,58,147,0.28)" };
    case "win":
      return { ...base, background: USA_BLUE, borderColor: "rgba(255,255,255,0.35)", color: "white" };
    case "safe":
      return { ...base, background: "white", borderColor: "rgba(31,58,147,0.28)" };

    case "sip2":
    case "sip3":
      return { ...base, background: tintBlue, borderColor: "rgba(31,58,147,0.30)" };

    case "sip5":
    case "sip10":
    case "finish":
      return { ...base, background: tintRed, borderColor: "rgba(200,16,46,0.30)" };

    case "chug10s":
      return { ...base, background: "rgba(31,58,147,0.22)", borderColor: "rgba(31,58,147,0.34)" };

    case "shotgun":
      return { ...base, background: USA_RED, borderColor: "rgba(255,255,255,0.35)", color: "white" };

    case "snap":
      return { ...base, background: USA_BLUE, color: "white", borderColor: "rgba(255,255,255,0.35)" };

    case "tiktok":
      return { ...base, background: navyCard, color: "white", borderColor: "rgba(200,16,46,0.55)" };

    case "dare":
      return { ...base, background: "white", borderColor: "rgba(200,16,46,0.32)" };

    case "back5":
      return { ...base, background: "rgba(200,16,46,0.20)", borderColor: "rgba(200,16,46,0.38)" };

    default:
      return { ...base, background: "white" };
  }
}

/** ===== Background cups (decor) ===== */

function RedSoloCupsBackground() {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <Cup
        style={{
          position: "absolute",
          right: -40,
          bottom: -60,
          width: 240,
          opacity: 0.14,
          transform: "rotate(18deg)",
        }}
      />
      <Cup
        style={{
          position: "absolute",
          left: -70,
          top: 40,
          width: 180,
          opacity: 0.18,
          transform: "rotate(-22deg)",
        }}
      />
      <Cup
        style={{
          position: "absolute",
          right: 30,
          top: -50,
          width: 120,
          opacity: 0.12,
          transform: "rotate(28deg)",
        }}
      />
    </div>
  );
}

function Cup({ style }: { style: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 200 260" style={style}>
      <path
        d="M40 25 L160 25 L146 240 Q144 252 132 252 L68 252 Q56 252 54 240 L40 25 Z"
        fill={USA_RED}
      />
      <path d="M34 25 Q34 10 50 10 L150 10 Q166 10 166 25 L166 35 L34 35 Z" fill={USA_RED} />
      <path d="M34 35 L166 35" stroke="rgba(255,255,255,0.35)" strokeWidth="8" />
      <path d="M50 80 L150 80" stroke="rgba(255,255,255,0.22)" strokeWidth="6" />
    </svg>
  );
}

/** ===== UI bits ===== */

function Button({
  children,
  onClick,
  disabled,
  variant = "blue",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "blue" | "red" | "navy" | "white";
}) {
  const bg =
    variant === "blue" ? USA_BLUE : variant === "red" ? USA_RED : variant === "navy" ? NAVY : "white";
  const fg = variant === "white" ? NAVY : "white";
  const border = variant === "white" ? "2px solid rgba(31,58,147,0.35)" : "2px solid rgba(255,255,255,0.18)";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        padding: "14px 14px",
        borderRadius: 18,
        border,
        background: bg,
        color: fg,
        fontWeight: 900,
        letterSpacing: 0.3,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        boxShadow: disabled ? "none" : "0 10px 24px rgba(11,27,58,0.14)",
      }}
    >
      {children}
    </button>
  );
}

function Chip({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "white",
        border: "2px solid rgba(11,27,58,0.10)",
        borderRadius: 999,
        padding: "6px 10px",
        fontWeight: 800,
        fontSize: 12,
        color: NAVY,
        boxShadow: "0 10px 24px rgba(11,27,58,0.08)",
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: 999, background: color }} />
      {text}
    </span>
  );
}

function TimersCorner({
  timers,
  clearTimer,
}: {
  timers: { id: string; label: string; endsAt: number }[];
  clearTimer: (id: string) => void;
}) {
  const [, tick] = React.useState(0);

  React.useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (!timers.length) return null;
  const now = nowMs();

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        width: 260,
        background: "white",
        borderRadius: 18,
        border: `3px solid ${USA_BLUE}`,
        padding: 10,
        zIndex: 60,
        boxShadow: "0 14px 30px rgba(11,27,58,0.18)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: 1000, letterSpacing: 0.6 }}>TIMERS</div>
        <div style={{ fontWeight: 900, color: USA_RED }}>{timers.length}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {timers.map((t) => {
          const remaining = t.endsAt - now;
          const done = remaining <= 0;
          return (
            <div
              key={t.id}
              style={{
                borderRadius: 14,
                padding: 10,
                background: done ? "rgba(52,199,89,0.14)" : "rgba(31,58,147,0.10)",
                border: "2px solid rgba(11,27,58,0.10)",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 12, color: NAVY }}>{t.label}</div>
              <div style={{ fontWeight: 1000, fontSize: 22, color: done ? "#1F7A3F" : NAVY }}>
                {done ? "DONE" : fmt(remaining)}
              </div>
              <button
                onClick={() => clearTimer(t.id)}
                style={{
                  marginTop: 6,
                  width: "100%",
                  borderRadius: 12,
                  padding: "8px 10px",
                  border: `2px solid ${USA_RED}`,
                  background: "white",
                  color: NAVY,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                CLEAR
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PassOverlay({ name, onReady }: { name: string; onReady: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11,27,58,0.90)",
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          borderRadius: 24,
          background: "white",
          padding: 18,
          border: `4px solid ${USA_RED}`,
          boxShadow: "0 18px 40px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ fontWeight: 1000, color: USA_BLUE, letterSpacing: 0.6 }}>PASS THE PHONE TO</div>
        <div style={{ marginTop: 6, fontSize: 34, fontWeight: 1000, color: NAVY }}>{name}</div>
        <div style={{ marginTop: 6, opacity: 0.75, fontWeight: 700 }}>Tap when you’re ready to roll.</div>
        <div style={{ marginTop: 14 }}>
          <Button onClick={onReady} variant="red">
            I’M READY
          </Button>
        </div>
      </div>
    </div>
  );
}

function PopupModal({ popup, onPress }: { popup: Popup; onPress: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.70)",
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          borderRadius: 26,
          background: "white",
          padding: 20,
          border: `4px solid ${USA_BLUE}`,
          boxShadow: "0 20px 46px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 1100, color: NAVY, letterSpacing: 0.4 }}>{popup.title}</div>
        <div style={{ marginTop: 10, fontSize: 16, fontWeight: 750, color: "rgba(11,27,58,0.85)" }}>
          {popup.subtitle}
        </div>
        <div style={{ marginTop: 16 }}>
          <Button onClick={onPress} variant={popup.action.kind === "startTikTokTimer" ? "red" : "blue"}>
            {popup.button}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** ===== Main page ===== */

export default function Page() {
  const [state, setState] = React.useState<GameState>(() => {
    const loaded = typeof window !== "undefined" ? loadState() : null;
    return loaded ?? initialState();
  });

  React.useEffect(() => {
    if (state.animating) return;
    saveState(state);
  }, [state]);

  React.useEffect(() => {
    if (state.phase !== "playing") return;
    const t = setInterval(() => {
      setState((s) => ({ ...s, timers: s.timers.filter((x) => x.endsAt > nowMs()) }));
    }, 5000);
    return () => clearInterval(t);
  }, [state.phase]);

  const currentPlayer = state.players[state.current];

  function newGame() {
    clearSaved();
    setState(initialState());
  }

  function resumeGame() {
    const loaded = loadState();
    if (loaded) setState(loaded);
  }

  function startGame() {
    if (state.players.length < 2) return;
    setState((s) => ({
      ...s,
      phase: "playing",
      current: 0,
      passScreen: true,
      lastRoll: undefined,
      popup: undefined,
      winnerName: undefined,
      animating: false,
    }));
  }

  function addPlayer(nameRaw: string) {
    const name = nameRaw.trim();
    if (!name) return;
    setState((s) => {
      if (s.players.length >= MAX_PLAYERS) return s;
      if (s.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) return s;
      const used = new Set(s.players.map((p) => p.color));
      const color = pickPlayerColor(used);
      return { ...s, players: [...s.players, { id: crypto.randomUUID(), name, pos: 0, color }] };
    });
  }

  function removePlayer(id: string) {
    setState((s) => ({ ...s, players: s.players.filter((p) => p.id !== id) }));
  }

  function pickPlayerColor(used: Set<string>) {
    const available = PLAYER_COLORS.filter((c) => !used.has(c));
    const pool = available.length ? available : PLAYER_COLORS;
    const c = pool[Math.floor(Math.random() * pool.length)];
    used.add(c);
    return c;
  }

  function clearTimer(id: string) {
    setState((s) => ({ ...s, timers: s.timers.filter((t) => t.id !== id) }));
  }

  function onReady() {
    setState((s) => ({ ...s, passScreen: false }));
  }

  async function animateMove(steps: number) {
    setState((s) => ({ ...s, animating: true }));
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const s0 = state;
    const p0 = s0.players[s0.current];
    const start = p0.pos;
    const rawTarget = start + steps;

    const path: number[] = [];
    if (rawTarget <= WIN_INDEX) {
      for (let i = start + 1; i <= rawTarget; i++) path.push(i);
    } else {
      for (let i = start + 1; i <= WIN_INDEX; i++) path.push(i);
      const overshoot = rawTarget - WIN_INDEX;
      for (let b = 1; b <= overshoot; b++) path.push(WIN_INDEX - b);
    }

    for (const pos of path) {
      await delay(160);
      setState((s) => {
        const players = s.players.map((pp) => ({ ...pp }));
        players[s.current].pos = pos;
        return { ...s, players, lastRoll: steps };
      });
    }

    await delay(140);

    // Resolve landing & popup
    setState((s) => {
      const players = s.players.map((pp) => ({ ...pp }));
      const me = players[s.current];
      const tile = s.board[me.pos];

      const popupFor = (type: TileType, button = "CONTINUE", action: PopupAction = { kind: "continue" }) => ({
        title: TILE_TEXT[type].title,
        subtitle: TILE_TEXT[type].subtitle,
        button,
        action,
      });

      const resolveTile = (t: TileType): GameState => {
        if (t === "win") {
          return {
            ...s,
            players,
            phase: "finished",
            winnerName: me.name,
            popup: popupFor("win", "NEW GAME"),
            animating: false,
          };
        }
        if (t === "snap") {
          return {
            ...s,
            players,
            popup: popupFor("snap", "START 10:00 TIMER", { kind: "startSnapTimer" }),
            animating: false,
          };
        }
        if (t === "tiktok") {
          return {
            ...s,
            players,
            popup: popupFor("tiktok", "START 60:00 TIMER", { kind: "startTikTokTimer" }),
            animating: false,
          };
        }
        if (t === "dare") {
          return { ...s, players, popup: popupFor("dare"), animating: false };
        }
        // Normal tiles
        return { ...s, players, popup: popupFor(t), animating: false };
      };

      // Back 5: move back AND treat as landed on new tile
      if (tile.type === "back5") {
        me.pos = clamp(me.pos - 5, 0, WIN_INDEX);
        const landed = s.board[me.pos];
        return resolveTile(landed.type);
      }

      // Regular landing
      return resolveTile(tile.type);
    });
  }

  function onRoll() {
    if (state.phase !== "playing") return;
    if (state.passScreen) return;
    if (state.animating) return;
    if (state.popup) return;

    const d = rollDice();
    animateMove(d);
  }

  function advanceTurn() {
    setState((s) => ({
      ...s,
      current: (s.current + 1) % s.players.length,
      passScreen: true,
      popup: undefined,
      lastRoll: undefined,
    }));
  }

  function handlePopupPress() {
    const popup = state.popup;
    if (!popup) return;

    if (state.phase === "finished") {
      newGame();
      return;
    }

    if (popup.action.kind === "startSnapTimer") {
      setState((s) => {
        const p = s.players[s.current];
        const timer: GameTimer = { id: crypto.randomUUID(), label: `SNAP: ${p.name}`, endsAt: nowMs() + 10 * 60 * 1000 };
        return { ...s, timers: [timer, ...s.timers] };
      });
      advanceTurn();
      return;
    }

    if (popup.action.kind === "startTikTokTimer") {
      setState((s) => {
        const p = s.players[s.current];
        const timer: GameTimer = { id: crypto.randomUUID(), label: `TIKTOK: ${p.name}`, endsAt: nowMs() + 60 * 60 * 1000 };
        return { ...s, timers: [timer, ...s.timers] };
      });
      advanceTurn();
      return;
    }

    advanceTurn();
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: OFF_WHITE,
        color: NAVY,
        position: "relative",
        fontFamily:
          'Poppins, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"',
      }}
    >
      <RedSoloCupsBackground />

      <div style={{ maxWidth: 980, margin: "0 auto", padding: 18, position: "relative" }}>
        <Header
          phase={state.phase}
          onNew={newGame}
          onResume={resumeGame}
          hasSaved={typeof window !== "undefined" && !!localStorage.getItem("sendy_state_v1")}
        />

        {state.phase === "lobby" && (
          <Lobby
            players={state.players}
            addPlayer={addPlayer}
            removePlayer={removePlayer}
            onStart={startGame}
            onReset={() => setState((s) => ({ ...s, players: [] }))}
          />
        )}

        {state.phase !== "lobby" && (
          <>
            <TimersCorner timers={state.timers} clearTimer={clearTimer} />

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12 }}>
              <Chip text={`TURN: ${currentPlayer?.name ?? ""}`} color={currentPlayer?.color ?? USA_BLUE} />
              {typeof state.lastRoll === "number" && <Chip text={`ROLL: ${state.lastRoll}`} color={USA_RED} />}
              <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                <button
                  onClick={() => {
                    clearSaved();
                    setState((s) => ({ ...s, phase: "lobby", passScreen: false, popup: undefined, winnerName: undefined }));
                  }}
                  style={{
                    borderRadius: 16,
                    border: `2px solid rgba(11,27,58,0.18)`,
                    padding: "10px 12px",
                    background: "white",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  BACK TO LOBBY
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: 10 }}>
              {Array.from({ length: TILE_COUNT }, (_, gridIdx) => {
                const rTop = Math.floor(gridIdx / COLS);
                const c = gridIdx % COLS;
                const bi = boardIndexFromGridCell(rTop, c);
                const tile = state.board[bi];
                const onTilePlayers = state.players.filter((p) => p.pos === bi);

                return (
                  <div key={gridIdx} style={tileStyle(tile.type)}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontWeight: 1100, letterSpacing: 0.4 }}>
                        {tile.label}
                        {tile.type === "win" ? " 🏁" : ""}
                      </div>
                      <div style={{ fontWeight: 900, opacity: 0.65 }}>#{bi}</div>
                    </div>

                    <div style={{ position: "absolute", left: 10, right: 10, bottom: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {onTilePlayers.slice(0, 8).map((p) => (
                        <motion.div
                          key={p.id}
                          layout
                          transition={{ type: "spring", stiffness: 700, damping: 35 }}
                          title={p.name}
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 999,
                            background: p.color,
                            border: "2px solid rgba(255,255,255,0.9)",
                            boxShadow: "0 8px 16px rgba(0,0,0,0.18)",
                          }}
                        />
                      ))}
                      {onTilePlayers.length > 8 && (
                        <span style={{ fontWeight: 1000, fontSize: 12, color: "rgba(11,27,58,0.85)" }}>
                          +{onTilePlayers.length - 8}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 14 }}>
              <Button
                onClick={onRoll}
                disabled={state.passScreen || state.animating || !!state.popup || state.phase !== "playing"}
                variant="blue"
              >
                {state.animating ? "MOVING..." : "ROLL DICE 🎲"}
              </Button>
            </div>
          </>
        )}
      </div>

      {state.phase === "playing" && state.passScreen && currentPlayer && <PassOverlay name={currentPlayer.name} onReady={onReady} />}
      {state.popup && <PopupModal popup={state.popup} onPress={handlePopupPress} />}
    </div>
  );
}

/** ===== Header + Lobby ===== */

function Header({
  phase,
  onNew,
  onResume,
  hasSaved,
}: {
  phase: Phase;
  onNew: () => void;
  onResume: () => void;
  hasSaved: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 24,
        padding: 16,
        background: "white",
        border: `4px solid ${USA_RED}`,
        boxShadow: "0 16px 34px rgba(11,27,58,0.14)",
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 38, fontWeight: 1200, letterSpacing: 1, color: NAVY, lineHeight: 1 }}>
            SENDY
          </div>
          <div style={{ marginTop: 6, fontWeight: 850, color: "rgba(11,27,58,0.70)" }}>
            House-party board game • one phone • pass-and-play
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, minWidth: 260 }}>
          {phase === "lobby" ? (
            <>
              <button
                onClick={onNew}
                style={{
                  flex: 1,
                  borderRadius: 18,
                  border: `3px solid ${USA_BLUE}`,
                  padding: "12px 12px",
                  background: "white",
                  fontWeight: 1000,
                  cursor: "pointer",
                }}
              >
                RESET
              </button>
              <button
                onClick={onResume}
                disabled={!hasSaved}
                style={{
                  flex: 1,
                  borderRadius: 18,
                  border: `3px solid ${USA_BLUE}`,
                  padding: "12px 12px",
                  background: USA_BLUE,
                  color: "white",
                  fontWeight: 1000,
                  cursor: hasSaved ? "pointer" : "not-allowed",
                  opacity: hasSaved ? 1 : 0.6,
                }}
              >
                RESUME
              </button>
            </>
          ) : (
            <button
              onClick={onNew}
              style={{
                width: "100%",
                borderRadius: 18,
                border: `3px solid ${USA_BLUE}`,
                padding: "12px 12px",
                background: USA_BLUE,
                color: "white",
                fontWeight: 1000,
                cursor: "pointer",
              }}
            >
              NEW GAME
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Lobby({
  players,
  addPlayer,
  removePlayer,
  onStart,
  onReset,
}: {
  players: Player[];
  addPlayer: (name: string) => void;
  removePlayer: (id: string) => void;
  onStart: () => void;
  onReset: () => void;
}) {
  const [name, setName] = React.useState("");

  const canAdd =
    name.trim().length > 0 &&
    players.length < MAX_PLAYERS &&
    !players.some((p) => p.name.toLowerCase() === name.trim().toLowerCase());

  return (
    <div
      style={{
        borderRadius: 24,
        padding: 16,
        background: "white",
        border: `4px solid ${USA_BLUE}`,
        boxShadow: "0 16px 34px rgba(11,27,58,0.14)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 22, fontWeight: 1100, color: NAVY }}>
          PLAYERS ({players.length}/{MAX_PLAYERS})
        </div>

        <div style={{ display: "flex", gap: 10, minWidth: 260 }}>
          <button
            onClick={onReset}
            style={{
              flex: 1,
              borderRadius: 16,
              border: `3px solid ${USA_RED}`,
              padding: "10px 12px",
              background: "white",
              fontWeight: 1000,
              cursor: "pointer",
            }}
          >
            CLEAR
          </button>
          <button
            onClick={onStart}
            disabled={players.length < 2}
            style={{
              flex: 1,
              borderRadius: 16,
              border: `3px solid ${USA_BLUE}`,
              padding: "10px 12px",
              background: USA_BLUE,
              color: "white",
              fontWeight: 1100,
              cursor: players.length >= 2 ? "pointer" : "not-allowed",
              opacity: players.length >= 2 ? 1 : 0.6,
            }}
          >
            START
          </button>
        </div>

        {/* ✅ Credit note (under buttons/intro area) */}
        <div style={{ width: "100%", marginTop: 8, fontWeight: 900, color: "rgba(11,27,58,0.55)" }}>
          made by <span style={{ color: USA_RED }}>Xavier.balls</span>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canAdd) {
              addPlayer(name);
              setName("");
            }
          }}
          placeholder="Add player name"
          maxLength={18}
          style={{
            flex: 1,
            minWidth: 220,
            borderRadius: 16,
            padding: "12px 12px",
            border: "2px solid rgba(11,27,58,0.14)",
            fontWeight: 800,
            outline: "none",
          }}
        />
        <button
          onClick={() => {
            if (!canAdd) return;
            addPlayer(name);
            setName("");
          }}
          disabled={!canAdd}
          style={{
            width: 160,
            borderRadius: 16,
            padding: "12px 12px",
            border: `3px solid ${USA_RED}`,
            background: USA_RED,
            color: "white",
            fontWeight: 1100,
            cursor: canAdd ? "pointer" : "not-allowed",
            opacity: canAdd ? 1 : 0.6,
          }}
        >
          ADD
        </button>
      </div>

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
        {players.map((p, idx) => (
          <div
            key={p.id}
            style={{
              borderRadius: 18,
              padding: 12,
              border: "2px solid rgba(11,27,58,0.10)",
              boxShadow: "0 12px 26px rgba(11,27,58,0.10)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  background: p.color,
                  border: "2px solid rgba(255,255,255,0.9)",
                  boxShadow: "0 8px 16px rgba(0,0,0,0.12)",
                }}
              />
              <div style={{ fontWeight: 1000, color: NAVY }}>
                {idx + 1}. {p.name}
              </div>
            </div>
            <button
              onClick={() => removePlayer(p.id)}
              style={{
                border: `2px solid rgba(11,27,58,0.14)`,
                background: "white",
                borderRadius: 14,
                padding: "8px 10px",
                fontWeight: 1000,
                cursor: "pointer",
              }}
            >
              REMOVE
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, fontWeight: 850, color: "rgba(11,27,58,0.70)" }}>
        Tip: put the phone down like a board game and pass it each turn.
      </div>
    </div>
  );
}
