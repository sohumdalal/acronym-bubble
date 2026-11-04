// Mova AnimatedFormElement, its 'password-toggle' variant (forms), from
// @mova-ui/react 0.4.6 (MIT, see LICENSE.mova). Re-skinned for Acronym
// Bubble in Unit Bubble's look: colour is the theme tokens (ab-field in
// mova.css) and the corners are Unit Bubble's 8px.
//
// What changed beyond the skin:
// - Only this variant is here; the component's other variants and the
//   config switch around them are not.
// - Mova's demo value and its own state became props: the popup passes the
//   value, owns it, and saves it.
// - The haptic tap on the eye button is gone; it does nothing on a desktop.
// - The input has a label and turns off spellcheck and autocomplete, since
//   it holds an API key.
// The input's padding, the eye button's place and its motion are Mova's.
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';

export function SecretInput({ value, onChange, label, placeholder }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative w-full">
      <input
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className="w-full pl-3 pr-10 py-2 border text-[12px] outline-none ab-field"
      />
      <button
        type="button"
        aria-label={shown ? 'Hide the key' : 'Show the key'}
        onClick={() => setShown(!shown)}
        className="absolute right-2.5 top-2 cursor-pointer border-0 bg-transparent p-0 ab-field-eye"
      >
        <motion.div animate={{ scale: shown ? 1.1 : 1, rotate: shown ? 0 : -10 }}>
          {shown ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </motion.div>
      </button>
    </div>
  );
}
