import { useRef, useState } from 'react';

/** Small "Saved." toast message that clears itself. */
export default function useFlash() {
  const [msg, setMsg] = useState('');
  const timer = useRef();
  const flash = (t) => {
    setMsg(t);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(''), 2500);
  };
  return [msg, flash];
}
