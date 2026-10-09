import { useEventListener } from 'expo';
import { ReactNode, createContext, useContext, useEffect, useRef } from 'react';

import Manette, { ManetteButton } from '../../modules/manette';
import { playInterfaceSound } from '../feedback';

// Aiguilleur de la manette pour toute l'interface.
// - Un seul abonnement à la manette ; chaque appui est envoyé au gestionnaire du dessus de la pile
//   (le dernier écran ou panneau affiché), jamais à ceux qui sont derrière.
// - Le stick gauche agit comme la croix.
// - Une direction maintenue se répète (400 ms, puis toutes les 110 ms), comme sur la Xbox.

export type Direction = 'Up' | 'Down' | 'Left' | 'Right';
export type InputHandler = (button: ManetteButton, info: { repeat: boolean }) => void;

const REPEAT_DELAY = 400;
const REPEAT_INTERVAL = 110;
const STICK_PRESS = 0.6; // seuil pour « appuyer » avec le stick
const STICK_RELEASE = 0.4; // seuil pour « relâcher » (écart = pas de clignotement)

const DIRECTIONS: Direction[] = ['Up', 'Down', 'Left', 'Right'];

type Entry = { current: InputHandler; silent: boolean };
const InputContext = createContext<Entry[] | null>(null);

export function InputProvider({ children }: { children: ReactNode }) {
  const stack = useRef<Entry[]>([]);
  const dpad = useRef<Direction[]>([]); // directions de la croix enfoncées, dans l'ordre
  const stick = useRef<Direction | null>(null);
  const active = useRef<Direction | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function dispatch(button: ManetteButton, repeat = false) {
    const top = stack.current[stack.current.length - 1];
    if (!top) return;
    // Sons de l'interface (réglage « Interface sounds ») : déplacement, validation, retour.
    if (!top.silent) {
      if (DIRECTIONS.some((d) => d === button)) playInterfaceSound('move');
      else if (button === 'A') playInterfaceSound('select');
      else if (button === 'B') playInterfaceSound('back');
    }
    top.current(button, { repeat });
  }

  function stopRepeat() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  function repeat(direction: Direction, delay: number) {
    timer.current = setTimeout(() => {
      if (active.current !== direction) return;
      dispatch(direction, true);
      repeat(direction, REPEAT_INTERVAL);
    }, delay);
  }

  // La direction active : la dernière touche de croix enfoncée, sinon le stick.
  function updateDirection() {
    const next = dpad.current[dpad.current.length - 1] ?? stick.current;
    if (next === active.current) return;
    stopRepeat();
    active.current = next;
    if (next) {
      dispatch(next);
      repeat(next, REPEAT_DELAY);
    }
  }

  useEventListener(Manette, 'onButton', (event) => {
    const direction = DIRECTIONS.find((d) => d === event.button);
    if (direction) {
      dpad.current = dpad.current.filter((d) => d !== direction);
      if (event.pressed) dpad.current.push(direction);
      updateDirection();
    } else if (event.pressed) {
      dispatch(event.button);
    }
  });

  useEventListener(Manette, 'onStick', (event) => {
    if (event.stick !== 'LS') return;
    stick.current = stickDirection(stick.current, event.x, event.y);
    updateDirection();
  });

  useEffect(() => stopRepeat, []);

  return <InputContext.Provider value={stack.current}>{children}</InputContext.Provider>;
}

// Reçoit les appuis de la manette tant que ce composant est affiché et au-dessus de la pile.
// silent : pas de son d'interface (ex. Test buttons).
export function useInput(handler: InputHandler, enabled = true, options: { silent?: boolean } = {}) {
  const stack = useContext(InputContext);
  const latest = useRef(handler);
  latest.current = handler;
  const silent = options.silent ?? false;

  useEffect(() => {
    if (!stack || !enabled) return;
    const entry: Entry = { current: (button, info) => latest.current(button, info), silent };
    stack.push(entry);
    return () => {
      const index = stack.indexOf(entry);
      if (index >= 0) stack.splice(index, 1);
    };
  }, [stack, enabled, silent]);
}

// GameController : x vers la droite, y vers le haut (+1).
function stickDirection(current: Direction | null, x: number, y: number): Direction | null {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const dominant: Direction = ax > ay ? (x > 0 ? 'Right' : 'Left') : y > 0 ? 'Up' : 'Down';
  const strength = Math.max(ax, ay);

  if (current) {
    const held = current === 'Left' || current === 'Right' ? ax : ay;
    if (held < STICK_RELEASE) return strength > STICK_PRESS ? dominant : null;
    // Changement franc de direction sans repasser par le centre.
    if (dominant !== current && strength > STICK_PRESS && strength > held + 0.2) return dominant;
    return current;
  }
  return strength > STICK_PRESS ? dominant : null;
}
