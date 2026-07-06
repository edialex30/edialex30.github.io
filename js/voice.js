const SMALL = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];

const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function countText(n) {
  if (!Number.isInteger(n) || n < 0) return String(n);
  if (n < 20) return SMALL[n];
  if (n < 100) {
    const ten = Math.floor(n / 10);
    const rest = n % 10;
    return rest ? `${TENS[ten]} ${SMALL[rest]}` : TENS[ten];
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    return rest ? `${SMALL[hundreds]} hundred ${countText(rest)}` : `${SMALL[hundreds]} hundred`;
  }
  return String(n);
}

export function createVoice() {
  const synth = window.speechSynthesis;
  let enVoice = null;

  function pickVoice() {
    const voices = synth ? synth.getVoices() : [];
    enVoice = voices.find(v => v.lang?.toLowerCase().startsWith('en')) || null;
  }

  if (synth) {
    pickVoice();
    synth.onvoiceschanged = pickVoice;
  }

  function speak(text) {
    if (!synth) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    if (enVoice) {
      utterance.voice = enVoice;
    }
    utterance.rate = 1.1;
    synth.cancel();
    synth.speak(utterance);
  }

  return {
    enabled: !!synth,
    say(text) {
      speak(text);
    },
    count(n) {
      speak(countText(n));
    },
  };
}
